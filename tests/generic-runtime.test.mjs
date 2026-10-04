import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {parseMachine} from '../shared/machine-validation.mjs';
import {plan,parcel,start,callback} from './helpers/runtime.mjs';
const refund=JSON.parse(await readFile('machines/customer-refund.v1.json','utf8'));
const submission=JSON.parse(await readFile('machines/flow4gold-submission.v1.json','utf8'));

test('refund and submission run interleaved in one event store with their own initial events',()=>{
 const definitions=[refund,submission];const rows=[];
 const append=request=>{const result=plan(request,rows,definitions);assert.equal(result.action,'apply',result.result.reason);rows.push(result.eventRecord);return result;};
 const r=append({caseId:'refund',eventId:'r1',type:'RECEIVED',machine:refund.machine,machineVersion:1});
 const s=append({caseId:'entry',eventId:'s1',type:'SUBMISSION_RECEIVED',machine:submission.machine,machineVersion:submission.version});
 assert.equal(r.taskInvocation.task,'diagnose');assert.equal(s.result.currentState,'REGISTERED');assert.equal(s.taskInvocation,null);
 append({caseId:'entry',eventId:'s2',type:'PUBLICATION_PENDING'});
 append({caseId:'entry',eventId:'s3',type:'WORKFLOW_LINKED'});
 append(callback(rows[0],'diagnose','ESCALATE',{reason:'Needs review'}));
 append({caseId:'entry',eventId:'s4',type:'NOT_SELECTED'});
 assert.equal(plan({caseId:'refund',operation:'inspect'},rows,definitions).result.currentState,'HUMAN_REVIEW');
 assert.equal(plan({caseId:'entry',operation:'inspect'},rows,definitions).result.outcome,'NOT_SELECTED');
 assert.deepEqual(rows.filter(x=>x.caseId==='refund').map(x=>x.sequence),[1,2]);
 assert.deepEqual(rows.filter(x=>x.caseId==='entry').map(x=>x.sequence),[1,2,3,4]);
});
test('two versions of one machine stay pinned in shared storage and reject requested identity changes',()=>{
 const v2=structuredClone(parcel);v2.version=2;v2.states.OPEN.on.START.target='WAITING';const definitions=[parcel,v2];
 const a=plan(start({caseId:'a',eventId:'a1'}),[],definitions).eventRecord;
 const b=plan(start({caseId:'b',eventId:'b1',machineVersion:2}),[a],definitions).eventRecord;
 assert.equal(plan({caseId:'a',operation:'inspect'},[a,b],definitions).result.currentState,'WORKING');
 assert.equal(plan({caseId:'b',operation:'inspect'},[a,b],definitions).result.currentState,'WAITING');
 for(const identity of [{machine:'parcel',machineVersion:2},{machine:'other',machineVersion:1}])assert.equal(plan({...callback(a,'work','DONE'),...identity},[a,b],definitions).result.status,'rejected');
 assert.equal(plan({...callback(a,'work','DONE'),machine:'parcel',machineVersion:1},[a,b],definitions).action,'apply');
 assert.equal(plan({caseId:'a',operation:'inspect'},[a,b],[v2]).result.status,'rejected');
});
test('refund-like state names and payloads have no implicit domain rules',()=>{
 const machine={machine:'unrelated',version:7,initial:'OPEN',states:{OPEN:{on:{BEGIN:{target:'AWAITING_APPROVAL'}}},AWAITING_APPROVAL:{on:{APPROVED:{target:'HUMAN_REVIEW'}}},HUMAN_REVIEW:{on:{FINISH:{target:'CLOSED'}}},CLOSED:{final:true}}};
 const first=plan({caseId:'other',eventId:'1',type:'BEGIN',machine:'unrelated',machineVersion:7},[],[machine]).eventRecord;
 const next=plan({caseId:'other',eventId:'2',type:'APPROVED',payload:{anything:'domain adapter owns this'}},[first],[machine]);assert.equal(next.action,'apply');
 assert.equal(plan({caseId:'other',eventId:'3',type:'FINISH'},[first,next.eventRecord],[machine]).result.currentState,'CLOSED');
});
test('taskResult is explicit true only, requires source task, initial states are passive',()=>{
 for(const taskResult of [false,'true',1,null]){const bad=structuredClone(parcel);bad.states.WORKING.on.DONE.taskResult=taskResult;assert.throws(()=>parseMachine(bad),/taskResult/);}
 const noTask=structuredClone(parcel);noTask.states.OPEN.on.START.taskResult=true;assert.throws(()=>parseMachine(noTask),/requires exactly one task/);
 const activeInitial=structuredClone(parcel);activeInitial.states.OPEN.tasks=['work'];assert.throws(()=>parseMachine(activeInitial),/Initial state must be passive/);
 assert.deepEqual(parseMachine(parcel),parcel);
});

test('task names cannot create ambiguous invocation IDs while colon event IDs remain valid',()=>{
 const left=structuredClone(parcel);left.machine='left';left.states.WORKING.tasks=['b:c'];
 // Before validation, these two distinct event/task pairs produced the same ID.
 assert.equal(`${'a'}:${'b:c'}`,`${'a:b'}:${'c'}`);
 assert.throws(()=>parseMachine(left),/cannot contain ':'; it is reserved as the task invocation delimiter/);
 for(const task of [':work','work:',':']){const invalid=structuredClone(parcel);invalid.states.WORKING.tasks=[task];assert.throws(()=>parseMachine(invalid),/cannot contain ':'/);}
 left.states.WORKING.tasks=['b-c'];
 const right=structuredClone(parcel);right.machine='right';right.states.WORKING.tasks=['c'];
 const definitions=[parseMachine(left),parseMachine(right)];const history=[];
 const one=plan(start({caseId:'one',eventId:'a',machine:'left'}),history,definitions);history.push(one.eventRecord);
 const two=plan(start({caseId:'two',eventId:'a:b',machine:'right'}),history,definitions);history.push(two.eventRecord);
 assert.notEqual(one.taskInvocation.taskInvocationId,two.taskInvocation.taskInvocationId);
 for(const [entry,task] of [[one.eventRecord,'b-c'],[two.eventRecord,'c']]){const result=plan(callback(entry,task,'DONE'),history,definitions);assert.equal(result.action,'apply',result.result.reason);history.push(result.eventRecord);}
 const flexible=structuredClone(parcel);flexible.states.WORKING.tasks=['handle reply / café'];assert.doesNotThrow(()=>parseMachine(flexible));
});
