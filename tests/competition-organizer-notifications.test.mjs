import test from 'node:test';
import assert from 'node:assert/strict';
import { compiledWorkflow } from '../scripts/build-core.mjs';
const directory = 'workflows/flow4gold/tasks/competition/';
const organizer = await compiledWorkflow(directory + 'handle-organizer-action.workflow.ts');
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
      output = expression(node.parameters.output, json);
      assert.ok(Number.isInteger(output) && output < node.parameters.numberOutputs, 'Valid numeric switch output required');
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
const fixture = workflow => Object.fromEntries(workflow.nodes.find(n=>n.name==='Fictional Demo Input').parameters.assignments.assignments.map(item => [item.name, structuredClone(item.value)]));
const decision = action => ({...fixture(organizer),action,competitionId:'demo',evidence:{reason:'Human decision',revision:'r1',question:'More detail?',juryDecisionId:'jury-1',invitationDetails:'Demo visit',attendanceRecord:'arrival-1',acceptanceDeadline:'2026-10-20T10:00:00Z',checkedAt:'2026-10-21T10:00:00Z',noAcceptanceRecorded:true}});

test('organizer routes all action families and preserves deterministic event proposals',()=>{
 const routes={INFORMATION_REQUESTED:'Record Missing Information',ENTRY_DISQUALIFIED:'Record Disqualification Reason',FINALIST_SELECTED:'Validate Human Jury Decision',NOT_SELECTED:'Validate Human Jury Decision',CHECKED_IN:'Validate Attendance Evidence',NO_SHOW_RECORDED:'Validate Attendance Evidence',WINNER_SELECTED:'Validate Human Jury Decision',RUNNER_UP_SELECTED:'Validate Human Jury Decision',PRIZE_ACCEPTANCE_EXPIRED:'Verify Acceptance Expiry'};
 for(const [action,branch] of Object.entries(routes)) {
   const request=decision(action), {json,visited}=execute(organizer,request);
   assert.ok(visited.includes(branch));
   assert.equal(json.events[0].type,action);
   assert.equal(json.events[0].eventId,JSON.stringify([request.caseId,request.requestId,action]));
   assert.equal(Object.hasOwn(json.events[0], 'causationId'), false, 'An independent organizer request is not an event cause');
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
