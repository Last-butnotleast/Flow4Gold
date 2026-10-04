import test from 'node:test';
import assert from 'node:assert/strict';
import { compiledWorkflow } from '../scripts/build-core.mjs';
const directory = 'workflows/flow4gold/tasks/competition/';
const organizer = await compiledWorkflow(directory + 'handle-organizer-action.workflow.ts');
const notification = await compiledWorkflow(directory + 'notify-participant.workflow.ts');
const expression = (value, json) => typeof value === 'string' && value.startsWith('={{') ? new Function('$json', 'return (' + value.slice(3,-2) + ');')(json) : value;
// Follow compiled native routes; a missing/miswired branch fails, rather than testing isolated snippets.
function execute(workflow, request) {
  let name = 'Receive Task', json = structuredClone(request);
  const visited = [];
  for (let count = 0; count < 30; count++) {
    const node = workflow.nodes.find(n => n.name === name);
    assert.ok(node, 'Missing node: ' + name);
    visited.push(name);
    let output = 0;
    if (node.type.endsWith('.code')) json = new Function('$input', node.parameters.jsCode)({first:()=>({json}),all:()=>[{json}]})[0].json;
    if (node.type.endsWith('.switch')) {
      output = node.parameters.rules.values.findIndex(rule => rule.conditions.conditions.every(condition => expression(condition.leftValue,json) === true));
      assert.notEqual(output,-1,'No switch branch for request');
    }
    if (node.type.endsWith('.set')) {
      const prior = json;
      json = node.parameters.includeOtherFields ? {...prior} : {};
      for (const item of node.parameters.assignments.assignments) json[item.name]=expression(item.value,prior);
    }
    const edges=workflow.connections[name]?.main?.[output] ?? [];
    if (!edges.length) return {json,visited};
    assert.equal(edges.length,1,'Mutually exclusive path expected');
    name=edges[0].node;
  }
  throw new Error('Unexpected workflow cycle');
}
const fixture = workflow => JSON.parse(workflow.nodes.find(n=>n.name==='Fictional Demo Input').parameters.jsonOutput);
const decision = action => ({...fixture(organizer),action,competitionId:'demo',evidence:{reason:'Human decision',revision:'r1',question:'More detail?',juryDecisionId:'jury-1',invitationDetails:'Demo visit',attendanceRecord:'arrival-1',acceptanceDeadline:'2026-10-20T10:00:00Z',checkedAt:'2026-10-21T10:00:00Z',noAcceptanceRecorded:true}});
const message = state => ({...fixture(notification),state,input:{...fixture(notification).input,registrationPin:'private-demo-pin',invitationDetails:'Demo visit',acceptanceDeadline:'2026-10-21',outcome:'WINNER',reason:'Eligibility failed'}});
test('organizer routes all action families and preserves deterministic event proposals',()=>{
 const routes={INFORMATION_REQUESTED:'Record Missing Information',ENTRY_DISQUALIFIED:'Record Disqualification Reason',FINALIST_SELECTED:'Validate Human Jury Decision',NOT_SELECTED:'Validate Human Jury Decision',CHECKED_IN:'Validate Attendance Evidence',NO_SHOW_RECORDED:'Validate Attendance Evidence',WINNER_SELECTED:'Validate Human Jury Decision',RUNNER_UP_SELECTED:'Validate Human Jury Decision',PRIZE_ACCEPTANCE_EXPIRED:'Verify Acceptance Expiry'};
 for(const [action,branch] of Object.entries(routes)) {
   const request=decision(action), {json,visited}=execute(organizer,request);
   assert.ok(visited.includes(branch));
   assert.equal(json.events[0].type,action);
   assert.equal(json.events[0].eventId,JSON.stringify([request.caseId,request.requestId,action]));
   assert.equal(json.dispatched,false); assert.equal(json.persisted,false);
   assert.deepEqual(execute(organizer,request).json,json);
 }
});
test('organizer fails closed for invalid identity, action evidence and expiry',()=>{
 for(const patch of [{mode:'apply'},{action:'PRIZE_ACCEPTED'},{actor:{id:'x',role:'contestant',verified:true}},{actor:{id:'x',role:'organizer',verified:false}},{machineVersion:2}]) assert.throws(()=>execute(organizer,{...decision('INFORMATION_REQUESTED'),...patch}));
 for(const [action,field] of [['INFORMATION_REQUESTED','question'],['FINALIST_SELECTED','juryDecisionId'],['FINALIST_SELECTED','invitationDetails'],['CHECKED_IN','attendanceRecord'],['PRIZE_ACCEPTANCE_EXPIRED','noAcceptanceRecorded']]) {
  const request=decision(action); delete request.evidence[field]; assert.throws(()=>execute(organizer,request));
 }
 const request=decision('PRIZE_ACCEPTANCE_EXPIRED'); request.evidence.checkedAt=request.evidence.acceptanceDeadline; assert.throws(()=>execute(organizer,request));
 for(const action of ['FINALIST_SELECTED','WINNER_SELECTED']) {const request=decision(action);delete request.competitionId;assert.throws(()=>execute(organizer,request));}
});
test('notification native branches render every state and expose the PIN only for registration',()=>{
 const states=['REGISTERED','WAITING_FOR_PUBLICATION','ADMIN_REVIEW','NEEDS_INFORMATION','INVITED','CONFIRMED','JUDGING','AWAITING_PRIZE_ACCEPTANCE','CLOSED'];
 const branches=new Set();
 for(const state of states) {
  const {json,visited}=execute(notification,message(state));
  branches.add(visited.find(name=>name.endsWith(' Message')&&name!=='Compose Participant Message'));
  assert.equal(json.delivered,false); assert.deepEqual(json.events,[]);
  assert.equal(json.effects[0].status,'preview');
  assert.equal(json.effects[0].text.includes('private-demo-pin'),state==='REGISTERED');
  assert.ok(json.effects[0].text.includes('\n\nEntry: demo-entry-001'));
  assert.equal(json.effects[0].deliveryKey,message(state).taskInvocationId);
 }
 assert.equal(branches.size,6);
});
test('closed notification template supports all explicit outcomes',()=>{
 for(const outcome of ['WITHDRAWN','NOT_SELECTED','DISQUALIFIED','DECLINED','NO_SHOW','RUNNER_UP','WINNER','PRIZE_UNCLAIMED']) {
   const request=message('CLOSED');request.input.outcome=outcome;
   assert.ok(execute(notification,request).json.effects[0].subject.endsWith(outcome));
 }
});
test('notification rejects untrusted recipients, unsafe mode, missing templates and required fields',()=>{
 for(const patch of [{mode:'apply'},{state:'OPEN'},{taskInvocationId:'bad'},{machineVersion:2}]) assert.throws(()=>execute(notification,{...message('REGISTERED'),...patch}));
 for(const patch of [{recipientVerified:false},{recipientEmail:'invalid'},{responseUrl:'http://example.invalid'}]) assert.throws(()=>execute(notification,{...message('REGISTERED'),input:{...message('REGISTERED').input,...patch}}));
 for(const [state,field] of [['REGISTERED','registrationPin'],['NEEDS_INFORMATION','question'],['INVITED','invitationDetails'],['AWAITING_PRIZE_ACCEPTANCE','acceptanceDeadline'],['CLOSED','outcome']]) {const request=message(state);delete request.input[field];assert.throws(()=>execute(notification,request));}
});
