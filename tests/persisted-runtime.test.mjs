import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compiledWorkflow } from '../scripts/build-core.mjs';

const definition = JSON.parse(await readFile('machines/customer-refund.v1.json', 'utf8'));
const currentDefinition = JSON.parse(await readFile('machines/customer-refund.v3.json', 'utf8'));
const machineDefinitions = await Promise.all([1,2,3].map(async version=>JSON.parse(await readFile(`machines/customer-refund.v${version}.json`,'utf8'))));
const catalogRows = machineDefinitions.map(definition=>({machine:definition.machine,version:definition.version,definition:JSON.stringify(definition),isDefault:definition.version===3}));
const workflow = await compiledWorkflow();
const getNode = (name) => {
  const node = workflow.nodes.find(entry => entry.name === name);
  assert.ok(node, `Generated workflow contains ${name}`);
  return node;
};
const input = json => ({ json });
const executeCode = (name, items, previous = {}) => new Function('$input', '$', getNode(name).parameters.jsCode)(
  { all: () => items }, name => ({ all: () => previous[name], first: () => previous[name][0] }),
);
const request = (overrides = {}) => ({ caseId: 'test-case', eventId: 'event-1', type: 'RECEIVED', ...overrides });
function plan(event = request(), history = [], catalog = catalogRows) {
  const prepared = executeCode('Prepare Event', [input(event)]);
  const loaded = executeCode('Load Machine Definitions', catalog.map(input), { 'Prepare Event': prepared });
  return executeCode('Plan Transition', (history.length ? history : [{}]).map(input), { 'Load Machine Definitions': loaded })[0].json;
}
function stream(types, overrides = {}) {
  return types.map((type, index) => ({ id: index + 1, eventId: `event-${index + 1}`, caseId: 'test-case',
    sequence: index + 1, machine: definition.machine, machineVersion: definition.version, type, payload: '{}',
    correlationId: 'test-case', causationId: index ? `event-${index}` : '', ...overrides }));
}
const paths = {
  OPEN: [], INVESTIGATING: ['RECEIVED'], WAITING_CUSTOMER: ['RECEIVED', 'NEED_MORE_INFO'],
  HUMAN_REVIEW: ['RECEIVED', 'ESCALATE'], AWAITING_APPROVAL: ['RECEIVED', 'REFUND_RECOMMENDED'],
  EXECUTING: ['RECEIVED', 'REFUND_RECOMMENDED', 'APPROVED'],
  VERIFYING: ['RECEIVED', 'REFUND_RECOMMENDED', 'APPROVED', 'ACTION_COMPLETED'],
  RECONCILING: ['RECEIVED', 'REFUND_RECOMMENDED', 'APPROVED', 'ACTION_FAILED'],
  CLOSED: ['RECEIVED', 'REFUND_RECOMMENDED', 'REJECTED'],
};
const inspect = history => plan({ caseId: 'test-case', operation: 'inspect' }, history);
function assertNoWrite(proposal, status = 'rejected') {
  assert.equal(proposal.action, 'return');
  assert.equal(proposal.result.status, status);
  assert.equal(proposal.eventRecord, undefined);
}

test('generated workflow loads the machine catalog and has exactly one storage write', () => {
  assert.equal(executeCode('Prepare Event', [input(request())])[0].json.definition, undefined);
  assert.deepEqual(executeCode('Load Machine Definitions',catalogRows.map(input),{'Prepare Event':executeCode('Prepare Event',[input(request())])})[0].json.definition,currentDefinition);
  const writes = workflow.nodes.filter(node => node.type === 'n8n-nodes-base.dataTable' && node.parameters.operation !== 'get');
  assert.deepEqual(writes.map(node => [node.name, node.parameters.operation]), [['Append Event', 'insert']]);
  assert.equal(workflow.nodes.some(node => /Case/.test(node.name)), false);
});

test('first RECEIVED appends only one ordered fact and fresh invocation reconstructs state', () => {
  const first = plan();
  assert.equal(first.action, 'apply');
  assert.equal(first.result.currentState, 'INVESTIGATING');
  assert.equal(first.eventRecord.sequence, 1);
  assert.equal(first.eventRecord.machine, definition.machine);
  assert.equal(first.eventRecord.machineVersion, currentDefinition.version);
  assert.equal(first.eventRecord.correlationId, 'test-case');
  const next = plan(request({ eventId: 'event-2', type: 'NEED_MORE_INFO', causationId: 'event-1' }), [first.eventRecord]);
  assert.equal(next.action, 'apply');
  assert.equal(next.result.currentState, 'WAITING_CUSTOMER');
  assert.equal(next.eventRecord.sequence, 2);
  assert.equal(next.eventRecord.causationId, 'event-1');
  assert.equal(next.eventRecord.correlationId, 'test-case');
});

test('inspect rebuilds solely from unordered event rows, including terminal outcome', () => {
  for (const [state, types] of Object.entries(paths)) {
    const view = inspect(stream(types).reverse());
    assertNoWrite(view, types.length ? 'inspected' : 'not_found');
    assert.equal(view.result.currentState, types.length ? state : null);
    assert.equal(view.result.sequence, types.length);
    if (state === 'CLOSED') assert.equal(view.result.outcome, 'REJECTED');
  }
});

test('every lifecycle edge replays a real path and derives closure outcome', () => {
  let edges = 0;
  for (const [state, entry] of Object.entries(definition.states)) {
    for (const kind of ['on', 'decide']) for (const [type, edge] of Object.entries(entry[kind] || {})) {
      const proposal = plan(request({ eventId: 'next', type }), stream(paths[state]));
      assert.equal(proposal.action, 'apply', `${state}/${type}`);
      assert.equal(proposal.result.currentState, edge.target);
      assert.equal(proposal.result.outcome, edge.outcome ?? null);
      const replay = inspect([...stream(paths[state]), proposal.eventRecord]);
      assert.equal(replay.result.currentState, edge.target);
      assert.equal(replay.result.outcome, edge.outcome ?? null);
      edges++;
    }
    assertNoWrite(plan(request({ eventId: 'invalid', type: 'UNRECOGNIZED' }), stream(paths[state])));
  }
  assert.equal(edges, 14);
});

test('illegal incoming events and prototype keys never append', () => {
  for (const history of [[], stream(['RECEIVED'])]) for (const type of ['APPROVED', 'constructor', '__proto__']) {
    assertNoWrite(plan(request({ eventId: 'new', type }), history));
  }
  for (const state of ['VERIFYING', 'RECONCILING']) for (const type of ['RESUME', 'APPROVED', 'REJECTED', 'RETRY']) {
    assertNoWrite(plan(request({ eventId: 'new', type }), stream(paths[state])));
  }
});

test('identical retries compare canonical payload and return latest replayed state without append', () => {
  const event = request({ payload: { reason: 'duplicate charge', details: { b: 2, a: 1 } } });
  const first = plan(event);
  const next = plan(request({ eventId: 'event-2', type: 'NEED_MORE_INFO' }), [first.eventRecord]);
  const duplicate = plan(request({ payload: { details: { a: 1, b: 2 }, reason: 'duplicate charge' } }), [first.eventRecord, next.eventRecord]);
  assertNoWrite(duplicate, 'duplicate');
  assert.equal(duplicate.result.currentState, 'WAITING_CUSTOMER');
  assert.equal(duplicate.result.sequence, 2);
});

test('event identity includes case, type, payload and links', () => {
  const row = plan().eventRecord;
  for (const changes of [{ caseId: 'other-case' }, { type: 'NEED_MORE_INFO' }, { payload: { changed: true } },
    { correlationId: 'changed' }, { causationId: 'unknown' }]) {
    assertNoWrite(plan(request(changes), [row]));
  }
});

test('malformed stream fails closed: sequence, identity, transition, machine and payload', () => {
  const rows = stream(['RECEIVED', 'NEED_MORE_INFO']);
  for (const changes of [{ sequence: 3 }, { sequence: 1 }, { sequence: '2' }, { eventId: 'event-1' },
    { machine: 'other' }, { machineVersion: 2 }, { machineVersion: '1' }, { type: 'APPROVED' },
    { payload: '[' }, { payload: '[]' }, { correlationId: '' }, { causationId: 'event-2' }]) {
    assertNoWrite(inspect([rows[0], { ...rows[1], ...changes }]));
  }
  assertNoWrite(inspect([{ ...rows[0], sequence: 2 }]));
  assertNoWrite(inspect([rows[0], rows[0]]));
});

test('causation links and shared correlation allow a new case in the same chain', () => {
  const cause = { ...stream(['RECEIVED'])[0], caseId: 'upstream-case', correlationId: 'shared-chain', eventId: 'cause-1', machine: 'automation-incident', machineVersion: 2 };
  const first = plan(request({ causationId: 'cause-1' }), [cause]);
  assert.equal(first.action, 'apply');
  assert.equal(first.eventRecord.causationId, 'cause-1');
  assert.equal(first.eventRecord.correlationId, 'shared-chain');
  assertNoWrite(plan(request({ correlationId: 'different', causationId: 'cause-1' }), [cause]));
  assertNoWrite(plan(request({ causationId: 'missing' })));
  assertNoWrite(plan(request({ causationId: 'cause-1' }), [cause, cause]));
  assertNoWrite(plan(request({ causationId: 'event-1' })));
});

test('malformed requests fail before table operations and callers cannot inject state', () => {
  for (const value of [null, [], {}, request({ caseId: '' }), request({ eventId: ' ' }), request({ type: '' }),
    request({ state: 'OPEN' }), request({ definition }), request({ payload: [] }), request({ sequence: 99 }),
    request({ machineVersion: 2 }), { operation: 'inspect', caseId: 'test-case', payload: {} }]) {
    assert.throws(() => executeCode('Prepare Event', [input(value)]), undefined, JSON.stringify(value));
  }
  assert.throws(() => executeCode('Prepare Event', []));
  assert.throws(() => executeCode('Prepare Event', [input(request()), input(request())]));
});

test('non-appending routing bypasses storage and replay cannot execute tasks', () => {
  const gate = getNode('Append Event?').parameters.conditions.conditions[0];
  assert.equal(gate.leftValue, '={{ $json.action }}');
  assert.equal(gate.rightValue, 'apply');
  assert.equal(gate.operator.operation, 'equals');
  const targets = (name, port = 0) => (workflow.connections[name]?.main[port] || []).map(link => link.node);
  assert.deepEqual(targets('Append Event?', 0), ['Append Event']);
  assert.deepEqual(targets('Append Event?', 1), ['Existing Result']);
  assert.deepEqual(targets('Append Event'), ['After Append']);
  assert.deepEqual(targets('After Append'), ['Has Task?']);
  assert.deepEqual(targets('Has Task?', 0), ['Find Task Binding']);
  assert.deepEqual(targets('Has Task?', 1), ['Applied Result']);
  assert.deepEqual(targets('Existing Result'), []);
  assert.equal(getNode('Run Task').parameters.options.waitForSubWorkflow, false);
  assert.deepEqual(targets('Binding Available?', 0), ['Run Task']);
  assert.deepEqual(targets('Binding Available?', 1), ['Dispatch Unavailable']);
  const lookup = getNode('Find Event');
  assert.equal(lookup.alwaysOutputData, true);
  assert.equal(lookup.parameters.returnAll, true);
  assert.equal(lookup.parameters.matchType, 'anyCondition');
  assert.ok(lookup.parameters.filters.conditions.some(filter => filter.keyName === 'caseId'));
  assert.equal(lookup.parameters.filters.conditions.filter(filter => filter.keyName === 'eventId').length, 2);
});

test('unrelated empty-ID rows do not poison a stream read or append', () => {
  const unrelated = { id: 90, caseId: 'unrelated', eventId: '' };
  assert.equal(plan(request(), [unrelated]).action, 'apply');
  const replay = inspect([...stream(['RECEIVED']), unrelated]);
  assertNoWrite(replay, 'inspected');
  assert.equal(replay.result.currentState, 'INVESTIGATING');
});

const callback = (overrides = {}) => request({
  eventId: 'event-1:diagnose:result', type: 'REFUND_RECOMMENDED',
  causationId: 'event-1', correlationId: 'test-case', taskInvocationId: 'event-1:diagnose',
  payload: { amount: 25, currency: 'EUR', paymentReference: 'demo-payment-001', reason: 'Duplicate charge' },
  ...overrides,
});

test('newly entered task state creates stable invocation and callback replays without scheduling', () => {
  const start = plan(request({ payload: { reason: 'Duplicate charge' } }));
  assert.deepEqual(start.taskInvocation, {
    caseId: 'test-case', task: 'diagnose', taskInvocationId: 'event-1:diagnose', triggerEventId: 'event-1',
    correlationId: 'test-case', state: 'INVESTIGATING', machine: definition.machine, machineVersion: currentDefinition.version,
    input: { reason: 'Duplicate charge' },
  });
  const completed = plan(callback(), [start.eventRecord]);
  assert.equal(completed.action, 'apply');
  assert.equal(completed.result.currentState, 'AWAITING_APPROVAL');
  assert.equal(completed.eventRecord.taskInvocationId, 'event-1:diagnose');
  assert.equal(completed.taskInvocation.task, 'request_approval');
  assert.equal(completed.taskInvocation.triggerEventId, completed.eventRecord.eventId);
  const history = [start.eventRecord, completed.eventRecord];
  assertNoWrite(plan(callback(), history), 'duplicate');
  assert.equal(inspect(history).result.currentState, 'AWAITING_APPROVAL');
  assert.ok(!inspect(history).taskInvocation);
  assert.ok(!plan(callback(), history).taskInvocation);
});

test('task callback rejects wrong invocation, missing links and altered identity without appending', () => {
  const history = [plan().eventRecord];
  for (const change of [
    { taskInvocationId: 'event-1:other' }, { taskInvocationId: 'other:diagnose' },
    { causationId: '' }, { correlationId: 'other' }, { eventId: 'arbitrary' },
  ]) assertNoWrite(plan(callback(change), history));
  const completed = plan(callback(), history).eventRecord;
  assertNoWrite(plan(callback({ taskInvocationId: undefined }), [...history, completed]));
});

test('late callback cannot satisfy a newer entry into the same task state', () => {
  const history = stream(['RECEIVED', 'NEED_MORE_INFO', 'CUSTOMER_REPLIED']);
  assert.equal(inspect(history).result.currentState, 'INVESTIGATING');
  assertNoWrite(plan(callback(), history));
  const current = callback({ eventId: 'event-3:diagnose:result', causationId: 'event-3', taskInvocationId: 'event-3:diagnose' });
  const completed = plan(current, history);
  assert.equal(completed.action, 'apply');
  assert.equal(completed.result.currentState, 'AWAITING_APPROVAL');
  assert.equal(inspect([...history, completed.eventRecord]).result.currentState, 'AWAITING_APPROVAL');
});

test('replay rejects tampered historical task invocation and accepts legacy blank metadata', () => {
  const start = plan().eventRecord;
  const result = plan(callback(), [start]).eventRecord;
  for (const changes of [{ taskInvocationId: 'event-1:other' }, { taskInvocationId: false }, { taskInvocationId: 0 }, { causationId: '' }, { eventId: 'arbitrary' }]) {
    assertNoWrite(inspect([start, { ...result, ...changes }]));
  }
  assert.equal(inspect(stream(['RECEIVED', 'REFUND_RECOMMENDED'], { taskInvocationId: null })).result.currentState, 'AWAITING_APPROVAL');
});

test('task binding resolution fails closed for missing and ambiguous mapping', () => {
  const proposal = plan();
  const resolve = rows => executeCode('Prepare Task Dispatch', rows.map(input), { 'Plan Transition': [input(proposal)] })[0].json;
  for (const rows of [[{}], [{ task: 'other', workflowId: 'abc' }], [{ task: 'diagnose', workflowId: '' }],
    [{ task: 'diagnose', workflowId: 'abc' }, { task: 'diagnose', workflowId: 'def' }]]) {
    assert.equal(resolve(rows).bindingAvailable, false);
    assert.equal(resolve(rows).workflowId, '');
  }
  const resolved = resolve([{ task: 'diagnose', workflowId: 'workflow-123' }]);
  assert.equal(resolved.bindingAvailable, true);
  assert.equal(resolved.workflowId, 'workflow-123');
  assert.equal(resolved.taskInvocationId, 'event-1:diagnose');
});

function approvalHistory() {
  const start = plan().eventRecord;
  const diagnosis = plan(callback(), [start]).eventRecord;
  return [start, diagnosis];
}
function approvalEvent(type = 'APPROVED', overrides = {}) {
  const proposalEventId = callback().eventId;
  const taskInvocationId = `${proposalEventId}:request_approval`;
  return request({ type, eventId: `${taskInvocationId}:result`, taskInvocationId,
    causationId: proposalEventId, correlationId: 'test-case', payload: { proposalEventId }, ...overrides });
}

test('new streams use v3 and both human decisions bind to the recorded proposal', () => {
  const history = approvalHistory();
  assert.ok(history.every(row => row.machineVersion === currentDefinition.version));
  for (const [type, state, outcome] of [['APPROVED', 'EXECUTING', null], ['REJECTED', 'CLOSED', 'REJECTED']]) {
    const event = approvalEvent(type);
    const decision = plan(event, history);
    assert.equal(decision.action, 'apply');
    assert.equal(decision.result.currentState, state);
    assert.equal(decision.result.outcome, outcome);
    assert.deepEqual(JSON.parse(decision.eventRecord.payload), { proposalEventId: history[1].eventId });
    const replay = [...history, decision.eventRecord];
    assert.equal(inspect(replay).result.currentState, state);
    const duplicate = plan(event, replay);
    assertNoWrite(duplicate, 'duplicate');
    assert.equal(duplicate.taskInvocation, undefined);
    assert.equal(inspect(replay).taskInvocation, undefined);
  }
});

test('missing, stale, or altered proposal approval is rejected with no writes', () => {
  const history = approvalHistory();
  for (const type of ['APPROVED', 'REJECTED']) {
    for (const changes of [
      { payload: {} }, { payload: { proposalEventId: 'other-proposal' } },
      { payload: { proposalEventId: history[1].eventId, amount: 10000 } },
      { taskInvocationId: undefined }, { causationId: '' }, { causationId: history[0].eventId },
      { taskInvocationId: 'old:request_approval', eventId: 'old:request_approval:result' },
      { correlationId: 'different' },
    ]) assertNoWrite(plan(approvalEvent(type, changes), history));
    const accepted = plan(approvalEvent(type), history).eventRecord;
    for (const changes of [{ taskInvocationId: '' }, { payload: '{}' },
      { payload: JSON.stringify({ proposalEventId: 'wrong' }) }]) {
      assertNoWrite(inspect([...history, { ...accepted, ...changes }]));
    }
  }
});

test('legacy v1 streams preserve their original approval and no approval task', () => {
  const history = stream(['RECEIVED']);
  const diagnosis = plan(request({ eventId: 'event-2', type: 'REFUND_RECOMMENDED' }), history);
  assert.equal(diagnosis.eventRecord.machineVersion, 1);
  assert.equal(diagnosis.taskInvocation, null);
  const approval = plan(request({ eventId: 'event-3', type: 'APPROVED' }), [...history, diagnosis.eventRecord]);
  assert.equal(approval.action, 'apply');
  assert.equal(approval.eventRecord.machineVersion, 1);
  assert.equal(inspect([...history, diagnosis.eventRecord, approval.eventRecord]).result.currentState, 'EXECUTING');
});

const approvalWorkflow = await compiledWorkflow('workflows/flow4gold/tasks/request-approval.workflow.ts');
const approvalCode = (name, json, previous) => {
  const node = approvalWorkflow.nodes.find(node => node.name === name);
  return new Function('$input', '$', node.parameters.jsCode)(
    { first: () => ({ json }) }, () => ({ first: () => ({ json: previous }) }),
  )[0].json;
};
const approvalInvocation = () => {
  const [received] = approvalHistory();
  return plan(callback(), [received]).taskInvocation;
};

test('approval task presents original proposal safely and rejects malformed proposals', () => {
  const invocation = approvalInvocation();
  const prepared = approvalCode('Prepare Approval', invocation);
  for (const text of ['EUR 25', 'demo-payment-001', 'Duplicate charge', invocation.triggerEventId]) {
    assert.ok(prepared.formDescription.includes(text));
    assert.ok(prepared.discordSummary.includes(text));
  }
  const escaped = approvalCode('Prepare Approval', { ...invocation, input: { ...invocation.input, reason: '<script>@everyone</script>' } });
  assert.ok(!escaped.formDescription.includes('<script>'));
  assert.ok(!escaped.discordSummary.includes('@everyone'));
  for (const input of [{}, { ...invocation.input, amount: 0 }, { ...invocation.input, currency: 'eur' }]) {
    assert.throws(() => approvalCode('Prepare Approval', { ...invocation, input }));
  }
});

test('form requires explicit decision and never trusts form-supplied proposal or IDs', () => {
  const original = approvalCode('Prepare Approval', approvalInvocation());
  for (const Decision of [undefined, null, '', 'APPROVED', 'approve', true, ['Approve']]) {
    assert.throws(() => approvalCode('Build Approval Result', { Decision }, original));
  }
  for (const [Decision, type] of [['Approve', 'APPROVED'], ['Reject', 'REJECTED']]) {
    const result = approvalCode('Build Approval Result', { Decision, caseId: 'attack', eventId: 'attack',
      taskInvocationId: 'attack', proposalEventId: 'attack', payload: { amount: 5000 } }, original);
    assert.deepEqual(result, approvalEvent(type));
    assert.equal(plan(result, approvalHistory()).action, 'apply');
  }
  const wait = approvalWorkflow.nodes.find(node => node.name === 'Wait for Decision');
  assert.equal(wait.parameters.resume, 'form');
  assert.equal(wait.parameters.formFields.values[0].requiredField, true);
  assert.equal(approvalWorkflow.nodes.find(node => node.name === 'Return Domain Event').parameters.options.waitForSubWorkflow, false);
});

test('Discord notification refuses unsigned form URLs', () => {
  const expression = approvalWorkflow.nodes.find(node => node.name === 'Post to Discord').parameters.content;
  const render = url => new Function('$execution', '$json', 'return ' + expression.slice(3, -2))(
    { resumeFormUrl: url }, { discordSummary: 'Simulated approval' },
  );
  assert.throws(() => render('https://example.test/form-waiting/123'));
  assert.throws(() => render('https://example.test/form-waiting/123?signature=short'));
  const signed = 'https://example.test/form-waiting/123?signature=' + 'a'.repeat(64);
  assert.ok(render(signed).includes(signed));
});

const issueWorkflow = await compiledWorkflow('workflows/flow4gold/tasks/issue-refund.workflow.ts');
const verifyWorkflow = await compiledWorkflow('workflows/flow4gold/tasks/verify-refund.workflow.ts');
function runTask(workflow, invocation, rows) {
  const execute = (name, items) => new Function('$input', '$', workflow.nodes.find(n => n.name === name).parameters.jsCode)(
    { first: () => items[0], all: () => items }, () => ({ first: () => input(invocation) }));
  execute('Validate Invocation', [input(invocation)]);
  return execute(workflow === issueWorkflow ? 'Build Refund Result' : 'Build Verification Result', rows.map(input))[0].json;
}
function approvedFixture() {
  const rows = approvalHistory();
  const approval = plan(approvalEvent(), rows);
  return { rows: [...rows, approval.eventRecord], invocation: approval.taskInvocation };
}
test('actual simulated tasks complete approved current-version case through receipt and verification with stable IDs', () => {
  const { rows, invocation } = approvedFixture();
  const receipt = runTask(issueWorkflow, invocation, rows);
  assert.deepEqual(runTask(issueWorkflow, invocation, rows), receipt);
  assert.equal(receipt.payload.simulation, true);
  assert.equal(receipt.payload.proposalEventId, rows[1].eventId);
  assert.equal(receipt.causationId, rows[2].eventId);
  const completed = plan(receipt, rows);
  assert.equal(completed.result.currentState, 'VERIFYING');
  rows.push(completed.eventRecord);
  const verified = runTask(verifyWorkflow, completed.taskInvocation, rows);
  assert.equal(verified.type, 'REFUND_CONFIRMED');
  assert.deepEqual(verified.payload, receipt.payload);
  const closed = plan(verified, rows);
  rows.push(closed.eventRecord);
  assert.equal(closed.result.currentState, 'CLOSED');
  assert.equal(closed.result.outcome, 'REFUNDED');
  assert.equal(inspect(rows).result.outcome, 'REFUNDED');
  for (const event of [receipt, verified]) {
    const duplicate = plan(event, rows);
    assertNoWrite(duplicate, 'duplicate');
    assert.equal(duplicate.taskInvocation, undefined);
  }
});
test('refund task rejects absent, foreign, malformed or unbound recorded proposal', () => {
  const { rows, invocation } = approvedFixture();
  for (const changes of [{ caseId: 'foreign' }, { payload: 'bad json' }, { payload: JSON.stringify({amount: 0}) }, { machineVersion: 1 }]) {
    assert.throws(() => runTask(issueWorkflow, invocation, [rows[0], {...rows[1], ...changes}, rows[2]]));
  }
  assert.throws(() => runTask(issueWorkflow, invocation, [rows[0], rows[2]]));
  assert.throws(() => runTask(issueWorkflow, {...invocation, input: {proposalEventId: 'foreign'}}, rows));
  assert.throws(() => runTask(issueWorkflow, {...invocation, machineVersion: 1}, rows));
  // An injected amount cannot override the approved event stored in the table.
  assert.equal(runTask(issueWorkflow, {...invocation, input: {...invocation.input, amount: 999, paymentReference: 'foreign'}}, rows).payload.amount, 25);
});
test('verification reconciles missing, changed, foreign or nonsimulated receipts instead of confirming', () => {
  const { rows, invocation } = approvedFixture();
  const receipt = runTask(issueWorkflow, invocation, rows);
  const completed = plan(receipt, rows);
  const stored = completed.eventRecord;
  const check = entries => {
    const result = runTask(verifyWorkflow, completed.taskInvocation, entries);
    assert.equal(result.type, 'REFUND_UNCONFIRMED');
    assert.equal(plan(result, [...rows, stored]).result.currentState, 'RECONCILING');
  };
  check(rows);
  for (const changes of [{amount: 999}, {currency: 'USD'}, {paymentReference: 'foreign'}, {receiptId: 'other'}, {simulation: false}, {proposalEventId: 'foreign'}]) {
    check([...rows, {...stored, payload: JSON.stringify({...receipt.payload, ...changes})}]);
  }
  check([...rows, {...stored, caseId: 'foreign'}]);
  assert.equal(runTask(verifyWorkflow, {...completed.taskInvocation, input: {...receipt.payload, amount: 1}}, [...rows, stored]).type, 'REFUND_UNCONFIRMED');
});
test('simulated task workflows only read evidence and callback core asynchronously, without payment integrations', () => {
  for (const task of [issueWorkflow, verifyWorkflow]) {
    assert.ok(task.nodes.every(n => ['n8n-nodes-base.executeWorkflowTrigger','n8n-nodes-base.code','n8n-nodes-base.dataTable','n8n-nodes-base.executeWorkflow'].includes(n.type)));
    assert.ok(task.nodes.filter(n => n.type === 'n8n-nodes-base.dataTable').every(n => n.parameters.operation === 'get'));
    assert.equal(task.nodes.find(n => n.name === 'Return Domain Event').parameters.options.waitForSubWorkflow, false);
  }
});

test('machine catalog pins existing histories and uses default only for new cases',()=>{
 const v2Default=catalogRows.map(row=>({...row,isDefault:row.version===2}));
 assert.equal(plan(request(),[],v2Default).eventRecord.machineVersion,2);
 const first=plan().eventRecord;
 assert.equal(plan({caseId:'test-case',operation:'inspect'},[first],v2Default).result.currentState,'INVESTIGATING');
 assert.equal(plan(request({eventId:'next',type:'ESCALATE'}),[first],v2Default).eventRecord.machineVersion,3);
 const missing=catalogRows.filter(row=>row.version!==1);
 assertNoWrite(plan({caseId:'test-case',operation:'inspect'},stream(['RECEIVED']),missing));
});
test('invalid catalogs fail before any event write or dispatch, without embedded fallback',()=>{
 for(const catalog of [[],[...catalogRows,catalogRows[0]],catalogRows.map(row=>({...row,isDefault:false})),catalogRows.map(row=>({...row,isDefault:true})),catalogRows.map((row,index)=>index?row:{...row,definition:'bad'}),catalogRows.map((row,index)=>index?row:{...row,machine:'wrong'})])assert.throws(()=>plan(request(),[],catalog));
 const unsupported=structuredClone(currentDefinition);unsupported.states.OPEN.on.RECEIVED.guard='not implemented';
 assert.throws(()=>plan(request(),[],[{machine:unsupported.machine,version:unsupported.version,isDefault:true,definition:JSON.stringify(unsupported)}]));
 assert.equal(getNode('Read Machine Definitions').parameters.dataTableId.value,'Lm8JZL9uCNqj14vE');
 assert.ok(!getNode('Prepare Event').parameters.jsCode.includes('REFUND_RECOMMENDED'));
});
