import test from 'node:test';
import assert from 'node:assert/strict';
import { compiledWorkflow } from '../scripts/build-core.mjs';
const directory = 'workflows/flow4gold/tasks/competition/';
const registration = await compiledWorkflow(directory + 'register-submission.workflow.ts');
const response = await compiledWorkflow(directory + 'contestant-response.workflow.ts');
const executeCode = (node, inputs) => new Function('$input', node.parameters.jsCode)({
  all: () => inputs.map(json => ({ json })), first: () => ({ json: inputs[0] }),
})[0].json;
const matches = (conditions, data) => {
  assert.equal(conditions.combinator, 'and');
  return conditions.conditions.every(condition => {
    assert.equal(condition.operator.operation, 'equals');
    const expression = condition.leftValue.slice(3, -2).trim();
    const left = new Function('$json', 'return (' + expression + ');')(data);
    return left === condition.rightValue;
  });
};
function runGraph(workflow, inputs) {
  let name = 'Receive Request';
  let data = inputs;
  const visited = [];
  while (name) {
    const node = workflow.nodes.find(candidate => candidate.name === name);
    assert.ok(node, 'Connected node exists: ' + name);
    visited.push(name);
    assert.ok(visited.length < 20, 'Graph must terminate');
    let output = 0;
    if (node.type.endsWith('.code')) data = [executeCode(node, data)];
    if (node.type.endsWith('.if')) output = matches(node.parameters.conditions, data[0]) ? 0 : 1;
    if (node.type.endsWith('.switch')) {
      const outputs = node.parameters.rules.values.map((rule, index) => matches(rule.conditions, data[0]) ? index : -1).filter(index => index >= 0);
      assert.equal(outputs.length, 1, 'Exactly one response branch must match');
      output = outputs[0];
    }
    const connections = workflow.connections[name]?.main?.[output] ?? [];
    assert.ok(connections.length <= 1, 'No duplicated event dispatch at a branch');
    name = connections[0]?.node;
  }
  return { result: data[0], visited };
}
const run = (workflow, name, inputs = []) => name === 'Prepare Event Proposals'
  ? runGraph(workflow, inputs).result
  : executeCode(workflow.nodes.find(node => node.name === name), inputs);
const fixture = workflow => run(workflow, 'Synthetic Request');
const prepare = (workflow, request = fixture(workflow)) => run(workflow, 'Prepare Event Proposals', [request]);
const published = { id: '12345', url: 'https://n8n.io/workflows/12345-demo/', verificationReference: 'organizer-check-1' };

test('registration retains pending publication and yields ordered deterministic proposals only', () => {
  const result = prepare(registration);
  assert.deepEqual(result.events.map(event => event.type), ['SUBMISSION_RECEIVED', 'PUBLICATION_PENDING']);
  assert.equal(result.events[1].causationId, result.events[0].eventId);
  assert.equal(result.persisted, false);
  assert.equal(result.dispatched, false);
  assert.equal(result.integration.runtime, 'unbound');
  assert.deepEqual(prepare(registration), result);
  assert.equal(result.effects[1].type, 'issue_and_store_pin');
  assert.equal(result.effects[1].status, 'unbound');
  assert.equal(JSON.stringify(result).includes('"pin":'), false);
});

test('published registration and contestant follow-up require matching publication evidence', () => {
  const request = fixture(registration);
  request.submission.publishedWorkflow = published;
  assert.equal(prepare(registration, request).events[1].type, 'WORKFLOW_LINKED');
  for (const value of [{ ...published, url: 'https://n8n.io/workflows/999/' }, { ...published, verificationReference: '' }, { ...published, id: 'https://evil.invalid/' }, { ...published, url: 'https://n8n.io.evil.invalid/workflows/12345/' }]) {
    request.submission.publishedWorkflow = value;
    assert.throws(() => prepare(registration, request));
  }
  const followup = fixture(response);
  followup.response = { action: 'WORKFLOW_LINKED', workflow: published };
  assert.deepEqual(prepare(response, followup).events[0].payload.workflow, published);
});

test('contestant clarification preserves evidence and only supports contestant actions', () => {
  const request = fixture(response);
  request.response.videoUrl = 'https://example.invalid/video/corrected';
  assert.equal(prepare(response, request).events[0].payload.videoUrl, request.response.videoUrl);
  for (const action of ['INVITATION_ACCEPTED', 'INVITATION_DECLINED', 'WITHDRAWN', 'PRIZE_ACCEPTED', 'PRIZE_DECLINED']) {
    request.response = { action };
    assert.equal(prepare(response, request).events[0].type, action);
  }
  for (const action of ['WINNER_SELECTED', 'FINALIST_SELECTED', 'PRIZE_ACCEPTANCE_EXPIRED', 'ENTRY_DISQUALIFIED']) {
    request.response = { action };
    assert.throws(() => prepare(response, request));
  }
  request.response = { action: 'INFORMATION_PROVIDED', message: ' ' };
  assert.throws(() => prepare(response, request));
});

test('unbound execution, untrusted actor, mixed identity and batches fail closed', () => {
  for (const workflow of [registration, response]) {
    for (const patch of [{ mode: 'apply' }, { machine: 'customer-refund' }, { machineVersion: 2 }, { actor: { ...fixture(workflow).actor, verified: false } }, { actor: { ...fixture(workflow).actor, role: 'admin' } }, { actor: { ...fixture(workflow).actor, caseId: 'another-entry' } }]) {
      assert.throws(() => prepare(workflow, { ...fixture(workflow), ...patch }));
    }
    assert.throws(() => run(workflow, 'Prepare Event Proposals', [fixture(workflow), fixture(workflow)]));
    assert.equal(workflow.active, false);
    assert.equal(workflow.nodes.some(node => /webhook|httpRequest|executeWorkflow$|dataTable/.test(node.type)), false);
  }
  assert.throws(() => prepare(response, { ...fixture(response), caseSnapshot: { caseId: 'demo-entry-alex', contestantId: 'different-person' } }));
});

test('missing required registration evidence fails and raw caller secrets are not forwarded', () => {
  for (const field of ['templateSubmitted', 'ticketConfirmed', 'privacyConsent', 'recordingConsent', 'videoUrl', 'email', 'title']) {
    const request = fixture(registration);
    delete request.submission[field];
    assert.throws(() => prepare(registration, request));
  }
  const request = fixture(registration);
  request.pin = 'do-not-forward';
  request.submission.token = 'do-not-forward';
  assert.equal(JSON.stringify(prepare(registration, request)).includes('do-not-forward'), false);
});


test('native publication branch and all response branches converge once at the preview boundary', () => {
  const pending = runGraph(registration, [fixture(registration)]);
  assert.ok(pending.visited.includes('Prepare Pending Publication'));
  assert.ok(!pending.visited.includes('Prepare Published Entry'));
  const entry = fixture(registration);
  entry.submission.publishedWorkflow = published;
  const linked = runGraph(registration, [entry]);
  assert.ok(linked.visited.includes('Prepare Published Entry'));
  assert.ok(!linked.visited.includes('Prepare Pending Publication'));
  for (const [action, branch] of [['WORKFLOW_LINKED', 'Prepare Workflow Link'], ['INFORMATION_PROVIDED', 'Prepare Clarification Evidence'], ['INVITATION_ACCEPTED', 'Prepare Participation Decision']]) {
    const request = fixture(response);
    request.response = { action, workflow: published, message: 'Requested clarification' };
    const path = runGraph(response, [request]);
    assert.ok(path.visited.includes(branch));
    assert.equal(path.visited.filter(name => name === 'Return Event Preview').length, 1);
    assert.equal(path.result.events.length, 1);
  }
  assert.equal(registration.nodes.find(node => node.name === 'Published Workflow Provided?').type, 'n8n-nodes-base.if');
  assert.equal(response.nodes.find(node => node.name === 'Which Contestant Response?').type, 'n8n-nodes-base.switch');
});
