import test from 'node:test';
import assert from 'node:assert/strict';
import {compiledWorkflow} from '../scripts/build-core.mjs';
const review=await compiledWorkflow('workflows/flow4gold/tasks/human-review.workflow.ts');
const issue=await compiledWorkflow('workflows/flow4gold/tasks/issue-refund.workflow.ts');
const verify=await compiledWorkflow('workflows/flow4gold/tasks/verify-refund.workflow.ts');
const run=(workflow,name,items,previous={})=>new Function('$input','$',workflow.nodes.find(n=>n.name===name).parameters.jsCode)({first:()=>({json:items[0]}),all:()=>items.map(json=>({json}))},name=>({first:()=>({json:previous[name]}),all:()=>previous[name].map(json=>({json}))}))[0].json;
const invocation={caseId:'review-case',triggerEventId:'escalation',taskInvocationId:'escalation:human_review',correlationId:'review-case',machine:'customer-refund',machineVersion:1,state:'HUMAN_REVIEW',task:'human_review',input:{reason:'No duplicate evidence'}};
const row=(eventId,type,sequence,payload,extra={})=>({...invocation,eventId,type,sequence,payload:JSON.stringify(payload),...extra});
const history=()=>[row('received','RECEIVED',1,{message:'Please refund order 1043'}),row('escalation','ESCALATE',2,{reason:'No duplicate evidence'})];
const orders=[{orderReference:'1043',itemName:'Weekend bag',amount:40,currency:'EUR',paymentReference:'demo-payment-1043',duplicateCharge:false}];
const prepare=(rows=history(),records=orders)=>run(review,'Prepare Review',records,{'Receive Task':invocation,'Read Case Events':rows});
const decide=(Decision,Message='The item never arrived',prepared=prepare(),extra={})=>run(review,'Build Review Result',[{Decision,Message,...extra}],{'Prepare Review':prepared});
test('human review shows conversation and trusted fixed payment despite escalation payload',()=>{
 const data=prepare();assert.equal(data.order.amount,40);assert.match(data.formDescription,/1043/);assert.match(data.formDescription,/No duplicate evidence/);assert.match(data.formDescription,/Please refund order 1043/);
 const unsafe=history();unsafe[0].payload=JSON.stringify({message:'<script>@everyone</script> order 1043'});assert.doesNotMatch(prepare(unsafe).formDescription,/<script>/);
});
test('human review sends approved fixed proposal, rejection or customer question with callback identity',()=>{
 const approved=decide('Approve refund','Manual exception',{...prepare()},{amount:5000,paymentReference:'evil',caseId:'evil'});
 assert.equal(approved.type,'REVIEW_APPROVED');assert.equal(approved.payload.proposal.amount,40);assert.equal(approved.payload.proposal.paymentReference,'demo-payment-1043');assert.equal(approved.caseId,invocation.caseId);assert.equal(approved.payload.reviewEventId,'escalation');
 assert.equal(decide('Reject').type,'REJECTED');assert.equal(decide('Ask customer','What happened?').type,'NEED_MORE_INFO');
 for(const decision of ['Approve refund','Reject','Ask customer'])assert.throws(()=>decide(decision,' '));
 assert.throws(()=>decide('Resume'));
});
test('unknown order can ask or reject but never approve; form omits approval option',()=>{
 const rows=history();rows[0].payload=JSON.stringify({message:'Something is wrong'});const prepared=prepare(rows);
 assert.equal(prepared.order,null);assert.throws(()=>decide('Approve refund','reason',prepared));assert.equal(decide('Ask customer','Which order?',prepared).type,'NEED_MORE_INFO');
 const choices=review.nodes.find(n=>n.name==='Wait for Information Decision').parameters.formFields.values[0].fieldOptions.values;
 assert.deepEqual(choices.map(x=>x.option),['Reject','Ask customer']);
 const known=review.nodes.find(n=>n.name==='Wait for Decision').parameters.formFields.values[0].fieldOptions.values;
 assert.deepEqual(known.map(x=>x.option),['Approve refund','Reject','Ask customer']);
 assert.deepEqual(review.connections['Has Known Order'].main.map(branch=>branch[0].node),['Wait for Decision','Wait for Information Decision']);
});
test('review messages use signed URL and wait submission never permits monetary inputs',()=>{
 const discord=review.nodes.find(n=>n.name==='Post to Discord');assert.match(discord.parameters.content,/signature=/);
 const fields=review.nodes.find(n=>n.name==='Wait for Decision').parameters.formFields.values;assert.deepEqual(fields.map(x=>x.fieldLabel),['Decision','Message']);assert.ok(fields.every(x=>x.requiredField));
});
test('human approved proposal produces verified simulated receipt without second approval',()=>{
 const approved=decide('Approve refund','Manual exception');const approvalRow=row(approved.eventId,approved.type,3,approved.payload,approved);approvalRow.payload=JSON.stringify(approved.payload);
 const rows=[...history(),approvalRow];
 const refundInvocation={...invocation,state:'EXECUTING',task:'issue_refund',triggerEventId:approved.eventId,taskInvocationId:approved.eventId+':issue_refund',input:approved.payload};
 run(issue,'Validate Invocation',[refundInvocation]);const receipt=run(issue,'Build Refund Result',rows,{'Validate Invocation':refundInvocation});assert.equal(receipt.type,'ACTION_COMPLETED');assert.equal(receipt.payload.proposalEventId,approved.eventId);assert.equal(receipt.payload.amount,40);
 const receiptRow=row(receipt.eventId,receipt.type,4,receipt.payload,receipt);receiptRow.payload=JSON.stringify(receipt.payload);rows.push(receiptRow);
 const verification={...invocation,state:'VERIFYING',task:'verify_refund',triggerEventId:receipt.eventId,taskInvocationId:receipt.eventId+':verify_refund',input:receipt.payload};
 run(verify,'Validate Invocation',[verification]);assert.equal(run(verify,'Build Verification Result',rows,{'Validate Invocation':verification}).type,'REFUND_CONFIRMED');
 receiptRow.payload=JSON.stringify({...receipt.payload,amount:5000});assert.equal(run(verify,'Build Verification Result',rows,{'Validate Invocation':verification}).type,'REFUND_UNCONFIRMED');
});

test('review captures native payment snapshot and refuses duplicate/invalid records without fallback',()=>{
 assert.equal(review.nodes.find(n=>n.name==='Read Demo Orders').parameters.dataTableId.value,'1NakvVeVYx0CI2hU');
 const snapshot=prepare();orders[0].amount=80;assert.equal(decide('Approve refund','Approved captured payment',snapshot).payload.proposal.amount,40);orders[0].amount=40;
 for(const records of [[],[orders[0],orders[0]],[{...orders[0],currency:'bad'}]]){const prepared=prepare(history(),records);assert.equal(prepared.order,null);assert.throws(()=>decide('Approve refund','reason',prepared));}
});


test('review rejects mismatched recorded escalation and invalid proposal snapshots at its boundary',()=>{
 for(const change of [{machine:'other'},{machineVersion:9},{correlationId:'other'},{type:'REFUND_RECOMMENDED'}]){const rows=history();Object.assign(rows[1],change);assert.throws(()=>prepare(rows));}
 for(const change of [{amount:0},{amount:40.005},{currency:'eur'},{paymentReference:''},{orderReference:''}])assert.throws(()=>decide('Approve refund','reason',{...prepare(),order:{...orders[0],...change}}));
});
