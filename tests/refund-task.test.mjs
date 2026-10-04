import test from 'node:test';
import assert from 'node:assert/strict';
import {compiledWorkflow} from '../scripts/build-core.mjs';
const approval=await compiledWorkflow('workflows/flow4gold/tasks/request-approval.workflow.ts');
const issue=await compiledWorkflow('workflows/flow4gold/tasks/issue-refund.workflow.ts');
const verify=await compiledWorkflow('workflows/flow4gold/tasks/verify-refund.workflow.ts');
const execute=(workflow,name,items,previous={})=>new Function('$input','$',workflow.nodes.find(node=>node.name===name).parameters.jsCode)(
 {first:()=>({json:items[0]}),all:()=>items.map(json=>({json}))},key=>({first:()=>({json:previous[key]}),all:()=>previous[key].map(json=>({json}))}))[0].json;
const identity={caseId:'refund-case',machine:'customer-refund',machineVersion:1,correlationId:'refund-case'};
const record=(event,sequence)=>({...identity,...event,sequence,payload:JSON.stringify(event.payload)});
const proposal={amount:25,currency:'EUR',paymentReference:'demo-payment-001',reason:'Duplicate charge'};
function fixture(){
 const received=record({eventId:'received',type:'RECEIVED',payload:{message:'Duplicate charge'}},1);
 const proposed=record({eventId:'received:diagnose:result',taskInvocationId:'received:diagnose',causationId:'received',type:'REFUND_RECOMMENDED',payload:proposal},2);
 const invocation={...identity,task:'request_approval',state:'AWAITING_APPROVAL',triggerEventId:proposed.eventId,taskInvocationId:proposed.eventId+':request_approval',input:{...proposal}};
 return {rows:[received,proposed],invocation};
}
const prepare=(invocation,rows)=>execute(approval,'Prepare Approval',rows,{'Receive Task':invocation});
function runTask(workflow,invocation,rows){execute(workflow,'Validate Invocation',[invocation]);return execute(workflow,workflow===issue?'Build Refund Result':'Build Verification Result',rows,{'Validate Invocation':invocation});}
function approvedFixture(){const {rows,invocation}=fixture();const prepared=prepare(invocation,rows);const approved=execute(approval,'Build Approval Result',[{Decision:'Approve'}],{'Prepare Approval':prepared});rows.push(record(approved,3));return {rows,invocation:{...identity,task:'issue_refund',state:'EXECUTING',triggerEventId:approved.eventId,taskInvocationId:approved.eventId+':issue_refund',input:approved.payload}};}
test('approval reads the recorded proposal and safely presents exactly that amount',()=>{
 const {rows,invocation}=fixture();const prepared=prepare(invocation,rows);
 for(const value of ['EUR 25','demo-payment-001','Duplicate charge',invocation.triggerEventId]){assert.ok(prepared.formDescription.includes(value));assert.ok(prepared.discordSummary.includes(value));}
 const unsafe={...proposal,reason:'<script>@everyone</script>'};rows[1].payload=JSON.stringify(unsafe);
 const escaped=prepare({...invocation,input:unsafe},rows);assert.doesNotMatch(escaped.formDescription,/<script>/);assert.doesNotMatch(escaped.discordSummary,/@everyone/);
 assert.equal(approval.nodes.find(node=>node.name==='Read Case Events').parameters.operation,'get');
});
test('approval task fails closed on missing, foreign or altered recorded proposals',()=>{
 const {rows,invocation}=fixture();assert.throws(()=>prepare(invocation,[]));assert.throws(()=>prepare(invocation,[...rows,rows[1]]));
 for(const change of [{caseId:'other'},{machine:'other'},{machineVersion:2},{correlationId:'other'},{type:'APPROVED'},{payload:'broken json'}])assert.throws(()=>prepare(invocation,[rows[0],{...rows[1],...change}]));
 for(const changes of [{amount:0},{amount:25.005},{amount:1000001},{currency:'eur'},{paymentReference:''},{reason:''}]){const input={...proposal,...changes};assert.throws(()=>prepare({...invocation,input},[rows[0],{...rows[1],payload:JSON.stringify(input)}]));}
 assert.throws(()=>prepare({...invocation,input:{...proposal,amount:5000}},rows));
});
test('approval needs an explicit choice and ignores form-controlled identity or payment fields',()=>{
 const {rows,invocation}=fixture();const prepared=prepare(invocation,rows);
 for(const Decision of [undefined,null,'','APPROVED','approve',true,['Approve']])assert.throws(()=>execute(approval,'Build Approval Result',[{Decision}],{'Prepare Approval':prepared}));
 for(const [Decision,type] of [['Approve','APPROVED'],['Reject','REJECTED']]){const result=execute(approval,'Build Approval Result',[{Decision,caseId:'attacker',eventId:'attacker',proposalEventId:'attacker',amount:5000}],{'Prepare Approval':prepared});assert.equal(result.type,type);assert.equal(result.caseId,identity.caseId);assert.equal(result.eventId,invocation.taskInvocationId+':result');assert.equal(result.causationId,invocation.triggerEventId);assert.deepEqual(result.payload,{proposalEventId:invocation.triggerEventId});}
 const wait=approval.nodes.find(node=>node.name==='Wait for Decision');assert.equal(wait.parameters.resume,'form');assert.equal(wait.parameters.formFields.values[0].requiredField,true);
});
test('approval notification refuses unsigned form URLs',()=>{
 const expression=approval.nodes.find(node=>node.name==='Post to Discord').parameters.content;
 const render=url=>new Function('$execution','$json','return '+expression.slice(3,-2))({resumeFormUrl:url},{discordSummary:'Simulated approval'});
 assert.throws(()=>render('https://example.test/form-waiting/123'));assert.throws(()=>render('https://example.test/form-waiting/123?signature=short'));
 const signed='https://example.test/form-waiting/123?signature='+'a'.repeat(64);assert.ok(render(signed).includes(signed));
});
test('simulated task chain validates approval, produces a stable receipt and confirms exact evidence',()=>{
 const {rows,invocation}=approvedFixture();const receipt=runTask(issue,invocation,rows);assert.equal(receipt.type,'ACTION_COMPLETED');assert.equal(receipt.payload.simulation,true);assert.equal(receipt.payload.amount,25);assert.equal(receipt.payload.proposalEventId,rows[1].eventId);assert.deepEqual(runTask(issue,invocation,rows),receipt);
 rows.push(record(receipt,4));const verification={...identity,task:'verify_refund',state:'VERIFYING',triggerEventId:receipt.eventId,taskInvocationId:receipt.eventId+':verify_refund',input:receipt.payload};
 const confirmed=runTask(verify,verification,rows);assert.equal(confirmed.type,'REFUND_CONFIRMED');assert.deepEqual(confirmed.payload,receipt.payload);assert.deepEqual(runTask(verify,verification,rows),confirmed);
});
test('refund task rejects absent, foreign, malformed or unbound recorded proposals',()=>{
 const {rows,invocation}=approvedFixture();
 for(const changes of [{caseId:'foreign'},{payload:'bad json'},{payload:JSON.stringify({amount:0})},{machineVersion:9}])assert.throws(()=>runTask(issue,invocation,[rows[0],{...rows[1],...changes},rows[2]]));
 assert.throws(()=>runTask(issue,invocation,[rows[0],rows[2]]));assert.throws(()=>runTask(issue,{...invocation,input:{proposalEventId:'foreign'}},rows));
 for(const changes of [{taskInvocationId:'wrong'},{causationId:'wrong'},{sequence:8}])assert.throws(()=>runTask(issue,invocation,[rows[0],rows[1],{...rows[2],...changes}]));
 assert.equal(runTask(issue,{...invocation,input:{...invocation.input,amount:999,paymentReference:'foreign'}},rows).payload.amount,25);
});
test('verification reconciles missing, altered, foreign and nonsimulated receipt evidence',()=>{
 const {rows,invocation}=approvedFixture();const receipt=runTask(issue,invocation,rows),stored=record(receipt,4);
 const verification={...identity,task:'verify_refund',state:'VERIFYING',triggerEventId:receipt.eventId,taskInvocationId:receipt.eventId+':verify_refund',input:receipt.payload};
 const check=entries=>assert.equal(runTask(verify,verification,entries).type,'REFUND_UNCONFIRMED');check(rows);
 for(const changes of [{amount:999},{currency:'USD'},{paymentReference:'foreign'},{receiptId:'other'},{simulation:false},{proposalEventId:'foreign'}])check([...rows,{...stored,payload:JSON.stringify({...receipt.payload,...changes})}]);
 check([...rows,{...stored,caseId:'foreign'}]);assert.equal(runTask(verify,{...verification,input:{...receipt.payload,amount:1}},[...rows,stored]).type,'REFUND_UNCONFIRMED');
});
test('refund adapters require positive pinned versions without legacy version branches',()=>{
 const {rows,invocation}=approvedFixture();const futureRows=rows.map(row=>({...row,machineVersion:2}));assert.equal(runTask(issue,{...invocation,machineVersion:2},futureRows).payload.amount,25);
 for(const machineVersion of [0,-1,1.1,'1'])assert.throws(()=>runTask(issue,{...invocation,machineVersion},rows));
});
test('simulated payment adapters only read evidence and callback asynchronously',()=>{
 for(const workflow of [issue,verify]){assert.ok(workflow.nodes.every(node=>['n8n-nodes-base.executeWorkflowTrigger','n8n-nodes-base.code','n8n-nodes-base.dataTable','n8n-nodes-base.executeWorkflow'].includes(node.type)));assert.ok(workflow.nodes.filter(node=>node.type==='n8n-nodes-base.dataTable').every(node=>node.parameters.operation==='get'));}
 for(const workflow of [approval,issue,verify])assert.equal(workflow.nodes.find(node=>node.name==='Return Domain Event').parameters.options.waitForSubWorkflow,false);
});
