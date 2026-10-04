import test from 'node:test';
import assert from 'node:assert/strict';
import {compiledWorkflow} from '../scripts/build-core.mjs';
const workflow=await compiledWorkflow('workflows/flow4gold/competition-gateway.workflow.ts');
const envelope=(adapter='register')=>({adapter,input:{caseId:'entry',requestId:'request',correlationId:'entry',actor:{id:'person',role:'contestant',verified:true,caseId:'entry'}}});
const event=(index)=>({caseId:'entry',eventId:`event-${index}`,type:index===1?'SUBMISSION_RECEIVED':'PUBLICATION_PENDING',payload:{actorId:'person'},machine:'flow4gold-submission',machineVersion:1,correlationId:'entry',...(index===2?{causationId:'event-1'}:{})});
const preview=(count=1)=>({mode:'preview',persisted:false,events:[event(1),event(2)].slice(0,count),effects:[{type:'issue_and_store_pin',status:'unbound'}]});
function run(input,adapter=preview(),statuses=['applied'],entry='Trusted Internal Request'){
 let name=entry;let data=[input];const prior={};const calls=[];
 while(name){
  const node=workflow.nodes.find(node=>node.name===name);let port=0;
  if(node.type.endsWith('.code'))data=new Function('$input','$',node.parameters.jsCode)({all:()=>data.map(json=>({json})),first:()=>({json:data[0]})},key=>({first:()=>({json:prior[key][0]})})).map(item=>item.json);
  if(node.type.endsWith('.executeWorkflow')){
   assert.equal(node.parameters.options.waitForSubWorkflow,true);
   calls.push({name,input:structuredClone(data[0])});
   if(name==='Run Preview Adapter')data=[adapter];
   else{const status=statuses.shift();data=[typeof status==='string'?{status,caseId:data[0].caseId,eventId:data[0].eventId,currentState:'TEST'}:status];}
  }
  if(node.type.endsWith('.if'))port=data[0].continueBatch?0:1;
  prior[name]=structuredClone(data);
  const links=workflow.connections[name]?.main?.[port]??[];assert.ok(links.length<=1);name=links[0]?.node;
 }
 return {result:data[0],calls};
}
test('fixed adapter gateway persists one registration event and delegates following state tasks to core',()=>{
 const {result,calls}=run(envelope());
 assert.deepEqual(calls.map(call=>call.name),['Run Preview Adapter','Apply First Event']);
 assert.equal(calls[0].input.mode,'preview');assert.equal(calls[0].input.machine,'flow4gold-submission');assert.equal(calls[0].input.machineVersion,1);
 assert.deepEqual(calls.slice(1).map(call=>call.input),preview().events);
 assert.equal(result.status,'completed');assert.equal(result.persisted,true);assert.equal(result.appliedCount,1);assert.equal(result.notification.delivered,false);
 assert.deepEqual(result.effects,preview().effects);assert.equal(workflow.nodes.some(node=>/httpRequest|email|dataTable/.test(node.type)),false);
 assert.equal(workflow.active,false);
});
test('rejection reports no accepted registration and unchanged retries preserve the event identity',()=>{
 const first=run(envelope(),preview(),['rejected']);assert.equal(first.result.status,'rejected');assert.equal(first.calls.length,2);assert.deepEqual(first.result.unattemptedEventIds,[]);assert.equal(first.result.persisted,false);
 const retry=run(envelope(),preview(),['duplicate']);assert.equal(retry.result.persisted,true);assert.equal(retry.result.duplicateCount,1);assert.equal(retry.result.appliedCount,0);assert.deepEqual(retry.calls.slice(1).map(call=>call.input.eventId),['event-1']);
 assert.equal(workflow.nodes.some(node=>node.name==='Apply Second Event'),false);
});
test('core errors or mismatched results are uncertain and never reported as persisted',()=>{
 for(const response of [{error:'execution failed'}, {status:'applied',caseId:'other',eventId:'event-1'}]){
  const {result,calls}=run(envelope(),preview(),[response]);assert.equal(result.status,'uncertain');assert.equal(result.persisted,false);assert.equal(calls.length,2);
 }
 for(const name of ['Apply First Event'])assert.equal(workflow.nodes.find(node=>node.name===name).onError,'continueRegularOutput');
});
test('contestant and organizer dispatch one event only; notification or arbitrary IDs cannot be selected',()=>{
 for(const adapter of ['contestant','organizer']){const result=run(envelope(adapter),preview(1),['applied']);assert.equal(result.calls.length,2);assert.equal(result.result.persisted,true);}
 for(const input of [envelope('notify'),envelope('constructor'),{...envelope(),workflowId:'arbitrary'},{...envelope(),input:{...envelope().input,machine:'customer-refund'}}])assert.throws(()=>run(input));
 for(const bad of [{...preview(),persisted:true},preview(2),{...preview(),events:[event(1),{...event(2),causationId:'wrong'}]},{...preview(),events:[event(1),{...event(2),caseId:'other'}]}])assert.throws(()=>run(envelope(),bad));
});

test('authenticated webhook unwraps JSON body and uses the same fixed adapter validation',()=>{
 const webhook=workflow.nodes.find(node=>node.name==='Competition Server Webhook');
 assert.equal(webhook.type,'n8n-nodes-base.webhook');assert.equal(webhook.parameters.httpMethod,'POST');
 assert.equal(webhook.parameters.path,'flow4gold-competition');assert.equal(webhook.parameters.authentication,'headerAuth');
 assert.equal(webhook.credentials.httpHeaderAuth.id,'IY5r9QTXQxCFlFge');
 assert.equal(webhook.parameters.responseMode,'lastNode');assert.equal(webhook.parameters.responseData,'firstEntryJson');
 assert.deepEqual(workflow.connections['Competition Server Webhook'].main[0].map(link=>link.node),['Extract Webhook Body']);
 assert.deepEqual(workflow.connections['Extract Webhook Body'].main[0].map(link=>link.node),['Prepare Adapter']);
 assert.deepEqual(workflow.connections['Trusted Internal Request'].main[0].map(link=>link.node),['Prepare Adapter']);
 const internal=run(envelope());const browser=run({body:envelope(),headers:{'x-flow4gold-demo':'not-forwarded'},query:{adapter:'notify'}},preview(),['applied','applied'],'Competition Server Webhook');
 assert.deepEqual(browser,internal);assert.equal(browser.calls[0].input.headers,undefined);
});
test('webhook cannot bypass envelope validation through raw input, URL fields, or arbitrary workflow IDs',()=>{
 for(const input of [envelope(),{body:null},{body:[]},{body:'text'},{body:{...envelope(),workflowId:'arbitrary'}},{body:envelope('notify')},{body:{...envelope(),input:{...envelope().input,machine:'customer-refund'}}}])assert.throws(()=>run(input,preview(),['applied','applied'],'Competition Server Webhook'));
});
