import test from 'node:test';
import assert from 'node:assert/strict';
import { compiledWorkflow } from '../scripts/build-core.mjs';
const workflow = await compiledWorkflow(
  'workflows/flow4gold/tasks/competition/notify-participant.workflow.ts',
);
const states = [
  'WAITING_FOR_PUBLICATION',
  'ADMIN_REVIEW',
  'NEEDS_INFORMATION',
  'INVITED',
  'CONFIRMED',
  'JUDGING',
  'AWAITING_PRIZE_ACCEPTANCE',
];
const types = [
  'PUBLICATION_PENDING',
  'WORKFLOW_LINKED',
  'INFORMATION_REQUESTED',
  'FINALIST_SELECTED',
  'INVITATION_ACCEPTED',
  'CHECKED_IN',
  'WINNER_SELECTED',
];
const definition = {
  machine: 'flow4gold-submission',
  version: 1,
  initial: 'OPEN',
  states: {
    OPEN: { on: { [types[0]]: { target: states[0] } } },
    ...Object.fromEntries(
      states.map((state, index) => [
        state,
        {
          tasks: ['notify_participant'],
          on:
            index < states.length - 1
              ? { [types[index + 1]]: { target: states[index + 1] } }
              : { PRIZE_ACCEPTED: { target: 'CLOSED', outcome: 'WINNER' } },
        },
      ]),
    ),
    CLOSED: { final: true },
  },
};
const catalog = () => [
  { machine: definition.machine, version: 1, definition: JSON.stringify(definition) },
];
const history = () =>
  states.map((state, index) => ({
    eventId: 'e' + index,
    caseId: 'entry',
    machine: definition.machine,
    machineVersion: 1,
    sequence: index + 1,
    type: types[index],
    payload: JSON.stringify({
      question: 'Please provide an audible video.',
      invitationDetails: 'Join the live jury session.',
      acceptanceDeadline: '2026-10-20',
    }),
    correlationId: 'entry',
    causationId: '',
    taskInvocationId: '',
  }));
const invocation = (index = 2) => ({
  caseId: 'entry',
  machine: definition.machine,
  machineVersion: 1,
  task: 'notify_participant',
  state: states[index],
  triggerEventId: 'e' + index,
  taskInvocationId: 'e' + index + ':notify_participant',
  correlationId: 'entry',
  input: {
    question: 'Untrusted replacement',
    registrationPin: 'Never display this',
    recipientEmail: 'attacker@example.invalid',
  },
});
const evaluate = (value, json) =>
  typeof value === 'string' && value.startsWith('={{')
    ? new Function('$json', 'return (' + value.slice(3, -2) + ')')(json)
    : value;
function execute(
  request,
  { events = history(), definitions = catalog(), database = [], writeResult } = {},
) {
  let name = 'Receive Task',
    items = [request];
  const prior = {},
    visited = [];
  while (name) {
    const node = workflow.nodes.find((node) => node.name === name);
    assert.ok(node, 'Missing ' + name);
    visited.push(name);
    let port = 0;
    if (node.type.endsWith('.code'))
      items = new Function('$input', '$', node.parameters.jsCode)(
        { first: () => ({ json: items[0] }), all: () => items.map((json) => ({ json })) },
        (key) => ({
          first: () => ({ json: prior[key][0] }),
          all: () => prior[key].map((json) => ({ json })),
        }),
      ).map((item) => item.json);
    if (node.type.endsWith('.dataTable')) {
      if (name === 'Read Case Events') items = events.length ? structuredClone(events) : [{}];
      else if (name === 'Read Machine Definitions') items = structuredClone(definitions);
      else {
        assert.equal(node.parameters.operation, 'upsert');
        assert.equal(node.parameters.options.dryRun, false);
        const match = node.parameters.filters.conditions;
        assert.equal(match.length, 1);
        assert.equal(match[0].keyName, 'taskInvocationId');
        assert.equal(match[0].condition, 'eq');
        const key = evaluate(match[0].keyValue, items[0]);
        const record = Object.fromEntries(
          Object.entries(node.parameters.columns.value).map(([field, value]) => [
            field,
            evaluate(value, items[0]),
          ]),
        );
        assert.equal(record.taskInvocationId, key);
        let row = database.find((row) => row.taskInvocationId === key);
        if (row) Object.assign(row, record);
        else {
          row = { ...record, id: database.length + 1 };
          database.push(row);
        }
        items = writeResult ?? [structuredClone(row)];
      }
    }
    if (node.type.endsWith('.switch')) {
      port = evaluate(node.parameters.output, items[0]);
      assert.ok(port >= 0 && port < node.parameters.numberOutputs);
    }
    prior[name] = structuredClone(items);
    const edges = workflow.connections[name]?.main?.[port] ?? [];
    assert.ok(edges.length <= 1);
    name = edges[0]?.node;
  }
  return { result: items[0], visited, database };
}
test('every supported state writes an in-app message from accepted history, without external delivery or callbacks', () => {
  const database = [];
  for (let index = 0; index < states.length; index++) {
    const { result, visited } = execute(invocation(index), { database });
    assert.equal(result.status, 'stored');
    assert.equal(result.persisted, true);
    assert.equal(result.channel, 'in_app');
    assert.equal(result.notification.state, states[index]);
    assert.equal(result.notification.sequence, index + 1);
    assert.deepEqual(result.events, []);
    assert.equal(result.callbackDispatched, false);
    assert.equal(visited.filter((name) => name === 'Upsert In-App Notification').length, 1);
    assert.equal(result.notification.message.includes('Never display this'), false);
    assert.equal(result.notification.message.includes('Untrusted replacement'), false);
  }
  assert.equal(database.length, states.length);
  assert.ok(database[2].message.includes('audible video'));
  assert.ok(database[4].message.includes('live jury session'));
  assert.equal(
    workflow.nodes.some((node) =>
      /httpRequest|discord|emailSend|executeWorkflow$|manualTrigger/.test(node.type),
    ),
    false,
  );
});
test('repeating an invocation upserts the same row and independent triggers get separate messages', () => {
  const database = [];
  const first = execute(invocation(), { database }).result;
  const second = execute(invocation(), { database }).result;
  assert.equal(database.length, 1);
  assert.equal(second.notification.id, first.notification.id);
  assert.equal(second.taskInvocationId, first.taskInvocationId);
  execute(invocation(3), { database });
  assert.equal(database.length, 2);
});
test('caller input is ignored and events after the trigger do not change a historical notification', () => {
  const rows = history();
  rows.push({ ...rows[0], eventId: 'later', sequence: 99, type: 'bad', payload: 'bad' });
  rows.push({ ...rows[0], caseId: 'other', eventId: 'other' });
  const one = execute(invocation(), { events: rows }).result;
  const two = execute(
    { ...invocation(), input: { question: 'Changed', subject: 'Injected' } },
    { events: rows },
  ).result;
  assert.deepEqual(one.notification, two.notification);
});
test('malformed envelope, forged identity, absent trigger, invalid replay and unbound states cannot write', () => {
  const database = [];
  for (const patch of [
    { taskInvocationId: 'wrong' },
    { correlationId: 'wrong' },
    { machineVersion: 2 },
    { state: 'INVITED' },
    { task: 'other' },
    { mode: 'preview' },
    { input: [] },
    { state: 'CLOSED' },
    { state: 'REGISTERED' },
    { state: 'OPEN' },
  ])
    assert.throws(() => execute({ ...invocation(), ...patch }, { database }));
  for (const events of [
    [],
    history().filter((row) => row.eventId !== 'e2'),
    [...history(), history()[2]],
    history().map((row, index) => (index === 1 ? { ...row, payload: 'bad' } : row)),
    history().map((row, index) => (index === 1 ? { ...row, sequence: 9 } : row)),
  ])
    assert.throws(() => execute(invocation(), { events, database }));
  const unbound = structuredClone(definition);
  delete unbound.states.NEEDS_INFORMATION.tasks;
  assert.throws(() =>
    execute(invocation(), {
      definitions: [
        { machine: definition.machine, version: 1, definition: JSON.stringify(unbound) },
      ],
      database,
    }),
  );
  assert.equal(database.length, 0);
});
test('pinned catalog version is required and required message evidence comes from events', () => {
  const missing = catalog();
  missing[0].version = 2;
  const changed = JSON.parse(missing[0].definition);
  changed.version = 2;
  missing[0].definition = JSON.stringify(changed);
  assert.throws(() => execute(invocation(), { definitions: missing }));
  const events = history();
  events[2].payload = '{}';
  assert.throws(() => execute(invocation(), { events }), /Recorded organizer question/);
  const noInvitation = history();
  noInvitation[3].payload = '{}';
  assert.throws(
    () => execute(invocation(4), { events: noInvitation }),
    /Recorded invitation details/,
  );
});
test('workflow confirms the actual upsert output rather than returning a claimed success', () => {
  for (const writeResult of [
    [],
    [{}],
    [{ id: 1, taskInvocationId: 'wrong' }],
    [{ id: 1 }, { id: 2 }],
  ])
    assert.throws(() => execute(invocation(), { writeResult }));
  const writes = workflow.nodes.filter(
    (node) => node.type.endsWith('.dataTable') && node.parameters.operation !== 'get',
  );
  assert.equal(writes.length, 1);
  assert.equal(writes[0].parameters.filters.conditions[0].keyName, 'taskInvocationId');
  assert.equal(
    workflow.nodes.find((node) => node.name === 'Read Machine Definitions').executeOnce,
    true,
  );
});
