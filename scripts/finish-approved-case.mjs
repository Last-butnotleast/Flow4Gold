import { loadEnvFile } from 'node:process';
loadEnvFile('.env');
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

// Fixed-case manual recovery only. Sequential operator run; no concurrent recovery guarantee.
// Reuses the existing approved event and original invocation; never sends another approval.
const source = readFileSync(new URL('../workflows/flow4gold/tests/finish-approved-case.workflow.ts', import.meta.url), 'utf8');
const workflowId = source.match(/@workflow\(\{\s*id: '([^']+)'/)[1];
const coreId = 'frF2jemAeCrcFPDe';
const diagnoseId = 'wkjUfwKoHZDmTAXW';
const approvalId = 'cL04Sd1GfOlJk0Te';
const issueId = 'QWAFL09ceL8nUa6y';
const verifyId = '9LZC7MMcWWLI4FN9';
const eventTableId = 'TjuB58skTvPRCwB3';
const caseId = 'approval-check-20261004-52617792';
function cli(...args) {
  return execFileSync('npm', ['run', '--silent', 'n8n', '--', ...args], { encoding: 'utf8', timeout: 120_000 });
}
const contextOutput = cli('env', 'status', '--json');
const context = JSON.parse(contextOutput.slice(contextOutput.indexOf('{')));
assert.ok(process.env.N8N_API_KEY, 'Set N8N_API_KEY in .env');
async function api(path) {
  const response = await fetch(new URL('/api/v1/' + path, context.host), {
    headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY }, signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.status, 200, `API read failed for ${path.split('?')[0]}`);
  return response.json();
}
async function snapshot() {
  const query = new URLSearchParams({ filter: JSON.stringify({ type: 'and', filters: [{ columnName: 'caseId', condition: 'eq', value: caseId }] }), limit: '100' });
  const page = await api(`data-tables/${eventTableId}/rows?${query}`);
  assert.equal(page.nextCursor, null, 'Unexpected paginated fixture');
  assert.ok(page.data.every(row => row.caseId === caseId), 'Server must filter fixture rows');
  return page.data.sort((a, b) => a.sequence - b.sequence);
}
async function taskExecutions(id = diagnoseId) {
  const page = await api(`executions?workflowId=${id}&limit=100`);
  assert.ok(page.data.every(row => row.workflowId === id), 'Execution lookup must remain scoped');
  return page.data;
}
async function poll(check, description) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await setTimeout(250);
  }
  throw new Error('Timed out: ' + description);
}
assert.ok(process.argv.includes('--resume-approved-simulation'), 'Explicit --resume-approved-simulation required');
const before = await snapshot();
assert.equal(before.length, 3, 'Only the original approved, undispatched case can be resumed; inspect completed case instead');
assert.equal(before[2].type, 'APPROVED');
const baselines = Object.fromEntries(await Promise.all([issueId,verifyId,approvalId,diagnoseId].map(async id => [id,new Set((await taskExecutions(id)).map(e=>e.id))])));
function run(operation) {
  const output = cli('test', workflowId, '--prod', '--data', JSON.stringify({operation}));
  const raw = output.slice(output.indexOf('{'));
  return JSON.parse(raw.slice(0,raw.lastIndexOf('}')+1));
}
try {
  for (const id of [verifyId, issueId]) console.log(cli('workflow','activate',id));
  console.log(cli('workflow','activate',workflowId));
  const initial = run('inspect');
  assert.equal(initial.currentState,'EXECUTING'); assert.equal(initial.sequence,3);
  run('resume');
  const rows = await poll(async()=> {const events = await snapshot();return events.length === 5 ? events : null;}, 'five-event simulated completion');
  assert.deepEqual(rows.slice(0,3),before);
  assert.deepEqual(rows.map(e=>e.type),['RECEIVED','REFUND_RECOMMENDED','APPROVED','ACTION_COMPLETED','REFUND_CONFIRMED']);
  assert.deepEqual(rows.map(e=>e.sequence),[1,2,3,4,5]);
  const proposal = JSON.parse(rows[1].payload);
  for (const [index,task] of [[3,'issue_refund'],[4,'verify_refund']]) {
    const row=rows[index],cause=rows[index-1];
    assert.equal(row.causationId,cause.eventId);
    assert.equal(row.taskInvocationId,cause.eventId+':'+task);
    assert.equal(row.eventId,row.taskInvocationId+':result');
    assert.equal(row.correlationId,caseId);
    assert.equal(row.machineVersion,2);
    const payload=JSON.parse(row.payload);
    assert.equal(payload.simulation,true);
    assert.equal(payload.proposalEventId,rows[1].eventId);
    for (const field of ['amount','currency','paymentReference']) assert.equal(payload[field],proposal[field]);
    assert.equal(payload.receiptId,'simulated-refund:'+rows[2].eventId+':issue_refund');
  }
  const final=run('inspect');
  assert.equal(final.currentState,'CLOSED');assert.equal(final.outcome,'REFUNDED');assert.equal(final.sequence,5);
  const tasks={};
  for (const id of [issueId,verifyId]) {
    tasks[id]=await poll(async()=> {
      const entries=(await taskExecutions(id)).filter(e=>!baselines[id].has(e.id));
      assert.ok(entries.length<=1,'Exactly one task invocation');
      if(entries[0]?.status==='error') throw new Error('Task failed: '+entries[0].id);
      return entries[0]?.status==='success'?entries[0]:null;
    },'task success');
  }
  const repeated=run('resume');assert.equal(repeated.currentState,'CLOSED');assert.equal(repeated.dispatch,false);
  assert.deepEqual(await snapshot(),rows);
  for(const id of [approvalId,diagnoseId]) assert.deepEqual(new Set((await taskExecutions(id)).map(e=>e.id)),baselines[id], 'No new diagnosis or human approval');
  for(const id of [issueId,verifyId]) assert.equal((await taskExecutions(id)).filter(e=>!baselines[id].has(e.id)).length,1);
  console.log(JSON.stringify({caseId,state:final.currentState,outcome:final.outcome,sequence:final.sequence,simulation:true,issueExecutionId:tasks[issueId].id,verifyExecutionId:tasks[verifyId].id,originalApprovalPreserved:true,repeatResumeNoDispatch:true}));
} finally {
  console.log(cli('workflow','deactivate',workflowId));
  const harness=await api('workflows/'+workflowId);assert.equal(harness.active,false);assert.equal(harness.activeVersionId,null);
}
