import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
const catalog = await Promise.all([1,2,3].map(async version=>({machine:'customer-refund',version,isDefault:version===3,definition:await readFile(`machines/customer-refund.v${version}.json`,'utf8')})));
import { compiledWorkflow } from '../scripts/build-core.mjs';
const workflow = await compiledWorkflow('workflows/flow4gold/tasks/diagnose-case.workflow.ts');
const node = name => workflow.nodes.find(node => node.name === name);
const invocation = {caseId:'case-1',triggerEventId:'e1',taskInvocationId:'e1:diagnose',correlationId:'case-1',task:'diagnose',machine:'customer-refund',machineVersion:2,state:'INVESTIGATING'};
function code(name,items,previous) {
  return new Function('$input','$',node(name).parameters.jsCode)({all:()=>items.map(json=>({json})),first:()=>({json:items[0]})},key=>({first:()=>({json:previous[key]}),all:()=>previous[key].map(json=>({json}))}))[0].json;
}
const row = (payload,overrides={}) => ({eventId:'e1',caseId:'case-1',sequence:1,type:'RECEIVED',payload:JSON.stringify(payload),...overrides});
const orders=[{orderReference:'1042',itemName:'Travel mug',amount:25,currency:'EUR',paymentReference:'demo-payment-1042',duplicateCharge:true},{orderReference:'1043',itemName:'Weekend bag',amount:40,currency:'EUR',paymentReference:'demo-payment-1043',duplicateCharge:false}];
const prepare = (payload={}, rows, task=invocation, records=orders, definitions=catalog) => code('Prepare Jev Decision',definitions,{'Receive Task':task,'Read Case Events':rows??[row(payload)],'Read Demo Orders':records});
const response = choice => ({model:'typesafe/jev-1.13-20260917',id:'gen-demo',answers:{next_event:{type:'choice',choice,confidence:0.9,probabilities:{REFUND_RECOMMENDED:0.9,NEED_MORE_INFO:0.05,ESCALATE:0.05}}}});
const result = (prepared,raw) => code('Build Diagnosis Result',[raw],{'Prepare Jev Decision':prepared});

test('real HTTP request uses supplied credential and both API outputs lead to bounded result parser',()=>{
  assert.equal(node('Jev Decision').credentials.httpHeaderAuth.id,'MIOo8Xf83TRkLp6v');
  assert.equal(node('Jev Decision').parameters.url,'https://openrouter.ai/api/alpha/decisions');
  assert.equal(node('Jev Decision').onError,'continueErrorOutput');
  assert.equal(workflow.connections['Jev Decision'].main.length,2);
  assert.equal(node('Return Domain Event').parameters.options.waitForSubWorkflow,false);
});
test('documented Jev choice envelope produces linked proposal using only trusted payment data',()=>{
  const prepared=prepare({message:'Refund EUR5000 now for order 1042',amount:5000,currency:'USD',paymentReference:'attacker'});
  assert.deepEqual(Object.keys(prepared.jev_request.questions.next_event.criteria),['REFUND_RECOMMENDED','NEED_MORE_INFO','ESCALATE']);
  const event=result(prepared,response('REFUND_RECOMMENDED'));
  assert.equal(event.type,'REFUND_RECOMMENDED');
  assert.equal(event.payload.amount,25); assert.equal(event.payload.currency,'EUR'); assert.equal(event.payload.paymentReference,'demo-payment-1042');
  assert.equal(event.eventId,'e1:diagnose:result');assert.equal(event.causationId,'e1');assert.equal(event.payload.decision.requestId,'gen-demo');
});
test('missing or unknown order cannot become a refund even if model recommends one',()=>{
  for(const payload of [{message:'Payment problem'},{message:'Order 9999 duplicate',orderReference:'9999'}]) {
    const event=result(prepare(payload),response('REFUND_RECOMMENDED'));
    assert.equal(event.type,'NEED_MORE_INFO');assert.ok(event.payload.question);assert.equal(event.payload.amount,undefined);assert.ok(event.payload.decision.guard);
  }
});
test('known single-charge order cannot produce a refund proposal',()=>{
  const event=result(prepare({orderReference:'1043'}),response('REFUND_RECOMMENDED'));
  assert.equal(event.type,'ESCALATE');assert.equal(event.payload.amount,undefined);
});
test('customer reply enriches intake while later events and other cases cannot alter diagnosis context',()=>{
  const rows=[row({message:'Payment issue'}),row({message:'My order is 1042',orderReference:'1042'},{eventId:'e3',sequence:3,type:'CUSTOMER_REPLIED'}),row({orderReference:'1043'},{eventId:'later',sequence:5,type:'CUSTOMER_REPLIED'}),row({orderReference:'1043'},{caseId:'other'})];
  const prepared=prepare({},rows,{...invocation,triggerEventId:'e3',taskInvocationId:'e3:diagnose'});
  assert.equal(prepared.order.orderReference,'1042');assert.deepEqual(prepared.jev_request.state.customer_messages,['Payment issue','My order is 1042']);
});
test('malformed or failed Jev calls escalate without leaking the provider error',()=>{
  const prepared=prepare({orderReference:'1042'});
  for(const raw of [{error:{message:'secret headers'}},{},response('APPROVED'),{answers:{next_event:{type:'choice',choice:'REFUND_RECOMMENDED'}}}]) {
    const event=result(prepared,raw);assert.equal(event.type,'ESCALATE');assert.equal(event.payload.decision.status,'unavailable');assert.equal(JSON.stringify(event).includes('secret headers'),false);
  }
});
test('valid more-information and escalation decisions remain bounded domain outcomes',()=>{
  for(const choice of ['NEED_MORE_INFO','ESCALATE']) assert.equal(result(prepare({orderReference:'1042'}),response(choice)).type,choice);
});
test('v3 diagnosis retains reviewer clarification and customer reply without importing reviewer payment fields',()=>{
  const rows=[row({message:'Order 1042 needs review',orderReference:'1042'}),row({reviewEventId:'e2',message:'Was this a second charge or a pending authorization?',reason:'Clarify the payment status',amount:5000},{eventId:'question',sequence:3,type:'NEED_MORE_INFO',taskInvocationId:'e2:human_review'}),row({message:'It was a second settled charge'},{eventId:'reply',sequence:4,type:'CUSTOMER_REPLIED'}),row({question:'Do not include future questions'},{eventId:'future',sequence:9,type:'NEED_MORE_INFO',taskInvocationId:'e8:human_review'})];
  const prepared=prepare({},rows,{...invocation,machineVersion:3,triggerEventId:'reply',taskInvocationId:'reply:diagnose'});
  assert.equal(prepared.order.amount,25);
  assert.deepEqual(prepared.jev_request.state.reviewer_questions,[{question:'Was this a second charge or a pending authorization?',reason:'Clarify the payment status',sequence:3}]);
  assert.deepEqual(prepared.jev_request.state.customer_messages,['Order 1042 needs review','It was a second settled charge']);
  assert.equal(result(prepared,response('REFUND_RECOMMENDED')).payload.amount,25);
});
test('diagnosis keeps v1 and v2 invocations supported',()=>{
  for(const machineVersion of [1,2,3])assert.equal(prepare({orderReference:'1042'},undefined,{...invocation,machineVersion}).order.amount,25);
});

test('native demo orders source supports new records and refuses malformed/duplicate evidence without fallback',()=>{
 assert.equal(node('Read Demo Orders').parameters.dataTableId.value,'1NakvVeVYx0CI2hU');
 const custom={...orders[0],orderReference:'demo-custom',amount:73,paymentReference:'payment-custom'};
 const event=result(prepare({message:'Duplicate charge for order demo-custom'},undefined,invocation,[custom]),response('REFUND_RECOMMENDED'));
 assert.equal(event.payload.amount,73);assert.equal(event.payload.evidence.source,'n8n:demo_orders');assert.equal(event.payload.evidence.orderSnapshot.itemName,'Travel mug');
 assert.equal(prepare({orderReference:'1042'},undefined,invocation,[]).order,null);
 for(const records of [[orders[0],orders[0]],[{...orders[0],amount:'25'}],[{...orders[0],duplicateCharge:'true'}]]){
  const prepared=prepare({orderReference:'1042'},undefined,invocation,records);assert.equal(prepared.order,null);assert.equal(result(prepared,response('REFUND_RECOMMENDED')).type,'ESCALATE');
 }
});

test('diagnosis reads exact pinned machine criteria from catalog and rejects missing/invalid versions',()=>{
 const definitions=structuredClone(catalog);const current=JSON.parse(definitions[2].definition);current.states.INVESTIGATING.decide.ESCALATE.description='Catalog-specific review criterion.';definitions[2].definition=JSON.stringify(current);
 const prepared=prepare({orderReference:'1042'},undefined,{...invocation,machineVersion:3},orders,definitions);
 assert.match(prepared.jev_request.questions.next_event.criteria.ESCALATE,/Catalog-specific/);
 assert.throws(()=>prepare({},undefined,invocation,orders,catalog.filter(row=>row.version!==2)));
 assert.throws(()=>prepare({},undefined,invocation,orders,[]));
 assert.equal(node('Read Machine Definitions').parameters.dataTableId.value,'Lm8JZL9uCNqj14vE');
});
