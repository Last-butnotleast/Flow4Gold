import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compiledWorkflow} from '../scripts/build-core.mjs';
import {plan} from './helpers/runtime.mjs';
const machine=JSON.parse(await readFile('machines/flow4gold-submission.v1.json','utf8'));
const workflow=await compiledWorkflow('workflows/flow4gold/tasks/competition/prepare-submission.workflow.ts');
const submission={contestantName:'Taylor',email:'taylor@example.invalid',title:'Useful flow',videoUrl:'https://example.invalid/video',templateSubmitted:true,ticketConfirmed:true,privacyConsent:true,recordingConsent:true};
const published={id:'12345',url:'https://n8n.io/workflows/12345/',verificationReference:'User checked publication'};
function fixture(evidence=submission){
 const accepted=plan({caseId:'entry',eventId:'registered',machine:machine.machine,machineVersion:1,type:'SUBMISSION_RECEIVED',payload:{submission:evidence,actorId:'contestant-entry'}},[],[machine]);
 assert.equal(accepted.action,'apply',accepted.result.reason);return {record:accepted.eventRecord,invocation:accepted.taskInvocation};
}
function run(invocation,rows,definition=machine){
 const previous={'Validate Invocation':[invocation],'Read Case Events':rows};
 const execute=(name,items)=>new Function('$input','$',workflow.nodes.find(node=>node.name===name).parameters.jsCode)({all:()=>items.map(json=>({json}))},name=>({first:()=>({json:previous[name][0]}),all:()=>previous[name].map(json=>({json}))}))[0].json;
 execute('Validate Invocation',[invocation]);
 return execute('Build Preparation Result',[{machine:definition.machine,version:definition.version,definition:JSON.stringify(definition)}]);
}
test('REGISTERED launches preparation and stored evidence selects one linked task result',()=>{
 for(const [evidence,type,state] of [[submission,'PUBLICATION_PENDING','WAITING_FOR_PUBLICATION'],[{...submission,publishedWorkflow:published},'WORKFLOW_LINKED','ADMIN_REVIEW']]){
  const {record,invocation}=fixture(evidence);assert.equal(invocation.task,'prepare_submission');
  const event=run(invocation,[record]);assert.equal(event.type,type);assert.equal(event.eventId,'registered:prepare_submission:result');assert.equal(event.causationId,'registered');
  assert.deepEqual(run({...invocation,input:{submission:{publishedWorkflow:{id:'ATTACK'}}}},[record]),event);
  const accepted=plan(event,[record],[machine]);assert.equal(accepted.result.currentState,state);assert.equal(accepted.taskInvocation.task,'notify_participant');
  if(type==='WORKFLOW_LINKED')assert.deepEqual(event.payload.workflow,published);
  const history=[record,accepted.eventRecord];assert.equal(plan(event,history,[machine]).result.status,'duplicate');assert.equal(plan(event,history,[machine]).taskInvocation,undefined);
 }
});
test('preparation rejects missing, foreign, malformed or mismatched recorded evidence',()=>{
 const {record,invocation}=fixture({...submission,publishedWorkflow:published});
 for(const rows of [[],[record,record],[{...record,caseId:'other'}],[{...record,machineVersion:2}],[{...record,sequence:2}],[{...record,payload:'bad'}],[{...record,payload:JSON.stringify({submission:{...submission,publishedWorkflow:{...published,id:'other'}},actorId:'actor'})}]])assert.throws(()=>run(invocation,rows));
 for(const patch of [{taskInvocationId:'wrong'},{machineVersion:2},{state:'OPEN'},{task:'other'}])assert.throws(()=>run({...invocation,...patch},[record]));
 const bad=structuredClone(machine);delete bad.states.REGISTERED.on.WORKFLOW_LINKED.taskResult;assert.throws(()=>run(invocation,[record],bad));
});
test('withdrawal can beat preparation; stale callback is rejected without another task',()=>{
 const {record,invocation}=fixture();const withdrawn=plan({caseId:'entry',eventId:'withdrawn',type:'WITHDRAWN'},[record],[machine]);assert.equal(withdrawn.result.currentState,'CLOSED');
 const result=plan(run(invocation,[record,withdrawn.eventRecord]),[record,withdrawn.eventRecord],[machine]);assert.equal(result.result.status,'rejected');assert.equal(result.taskInvocation,undefined);
});
test('preparation reads persisted evidence and returns to core without waiting, no external side effects',()=>{
 assert.equal(workflow.nodes.find(node=>node.name==='Read Pinned Definition').executeOnce,true);
 assert.equal(workflow.nodes.find(node=>node.name==='Return Domain Event').parameters.options.waitForSubWorkflow,false);
 assert.ok(workflow.nodes.filter(node=>node.type==='n8n-nodes-base.dataTable').every(node=>node.parameters.operation==='get'));
 assert.equal(workflow.nodes.some(node=>/httpRequest|email|webhook/.test(node.type)),false);
});
