import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createDemoServer } from '../server/demo-server.mjs';
import {
  registrationRequest,
  actionRequest,
  projectNotifications,
} from '../server/competition.mjs';
import { readFile } from 'node:fs/promises';
const machine = JSON.parse(
  await readFile(new URL('../machines/flow4gold-submission.v1.json', import.meta.url), 'utf8'),
);
// The expected state-task model is also used while its workflow sources are being regenerated.
machine.states.REGISTERED.tasks = ['prepare_submission'];
machine.states.REGISTERED.on.PUBLICATION_PENDING.taskResult = true;
machine.states.REGISTERED.on.WORKFLOW_LINKED.taskResult = true;
for (const state of [
  'WAITING_FOR_PUBLICATION',
  'ADMIN_REVIEW',
  'NEEDS_INFORMATION',
  'INVITED',
  'CONFIRMED',
  'JUDGING',
  'AWAITING_PRIZE_ACCEPTANCE',
])
  machine.states[state].tasks = ['notify_participant'];
const submission = {
  contestantName: 'Taylor',
  email: 'taylor@example.invalid',
  title: 'Helpful automation',
  videoUrl: 'https://example.invalid/video',
  templateSubmitted: true,
  ticketConfirmed: true,
  privacyConsent: true,
  recordingConsent: true,
};
const register = (id) => ({ requestId: id, submission: { ...submission } });
function fakeN8n() {
  const rows = [],
    notifications = [],
    calls = [];
  let loseNext = false,
    prepareAutomatically = true;
  const replay = (caseId) => {
    const history = rows
      .filter((row) => row.caseId === caseId)
      .sort((a, b) => a.sequence - b.sequence);
    let state = machine.initial,
      outcome = null;
    for (const row of history) {
      const edge = machine.states[state].on[row.type];
      state = edge.target;
      outcome = edge.outcome ?? outcome;
    }
    return { history, state, outcome };
  };
  const completePreparation = (caseId) => {
    const { history, state } = replay(caseId);
    if (state !== 'REGISTERED') return;
    const trigger = history.at(-1),
      payload = JSON.parse(trigger.payload);
    const workflow = payload.submission.publishedWorkflow;
    rows.push({
      caseId,
      eventId: trigger.eventId + ':prepare_submission:result',
      type: workflow ? 'WORKFLOW_LINKED' : 'PUBLICATION_PENDING',
      payload: JSON.stringify({ ...(workflow ? { workflow } : {}), actorId: payload.actorId }),
      taskInvocationId: trigger.eventId + ':prepare_submission',
      causationId: trigger.eventId,
      machine: trigger.machine,
      machineVersion: trigger.machineVersion,
      correlationId: trigger.correlationId,
      sequence: trigger.sequence + 1,
      createdAt: new Date().toISOString(),
    });
  };
  const fetchImpl = async (url, options) => {
    const path = new URL(url).pathname;
    calls.push({ url: String(url), options });
    if (path.includes('/data-tables/Lm8JZL9uCNqj14vE'))
      return Response.json({
        data: [
          {
            machine: machine.machine,
            version: 1,
            definition: JSON.stringify(machine),
            isDefault: true,
          },
        ],
      });
    if (path.includes('/data-tables/GgWLi8jtrmWP9gpi')) {
      const filters = JSON.parse(new URL(url).searchParams.get('filter')).filters;
      return Response.json({
        data: notifications.filter((row) =>
          filters.every((filter) => row[filter.columnName] === filter.value),
        ),
      });
    }
    if (path.includes('/data-tables/TjuB58skTvPRCwB3')) {
      const filters = JSON.parse(new URL(url).searchParams.get('filter')).filters;
      return Response.json({
        data: rows.filter((row) =>
          filters.every((filter) => row[filter.columnName] === filter.value),
        ),
      });
    }
    if (path === '/webhook/flow4gold-demo') {
      const input = JSON.parse(options.body),
        { history, state, outcome } = replay(input.caseId);
      return Response.json({
        caseId: input.caseId,
        status: history.length ? 'inspected' : 'not_found',
        sequence: history.length,
        currentState: state,
        outcome,
      });
    }
    assert.equal(path, '/webhook/flow4gold-competition');
    assert.equal(options.headers['X-Flow4Gold-Demo'], 'private-token');
    const { adapter, input } = JSON.parse(options.body);
    assert.equal(input.actor.verified, true);
    const proposals =
      adapter === 'register'
        ? [
            {
              type: 'SUBMISSION_RECEIVED',
              payload: { submission: input.submission, actorId: input.actor.id },
            },
          ]
        : adapter === 'contestant'
          ? [
              {
                type: input.response.action,
                payload: {
                  ...Object.fromEntries(
                    Object.entries(input.response).filter(([key]) => key !== 'action'),
                  ),
                  actorId: input.actor.id,
                },
              },
            ]
          : [
              {
                type: input.action,
                payload: { ...input.evidence, actor: { id: input.actor.id, role: 'organizer' } },
              },
            ];
    const events = proposals.map((proposal, index) => ({
      ...proposal,
      caseId: input.caseId,
      eventId: JSON.stringify([input.caseId, input.requestId, proposal.type]),
      machine: machine.machine,
      machineVersion: 1,
      correlationId: input.correlationId,
      ...(index
        ? {
            causationId: JSON.stringify([input.caseId, input.requestId, proposals[index - 1].type]),
          }
        : {}),
    }));
    const results = [];
    for (const [index, event] of events.entries()) {
      const { history, state } = replay(input.caseId);
      const existing = rows.find((row) => row.eventId === event.eventId);
      if (existing) {
        const same = JSON.stringify(JSON.parse(existing.payload)) === JSON.stringify(event.payload);
        results.push({
          caseId: input.caseId,
          eventId: event.eventId,
          status: same ? 'duplicate' : 'rejected',
          reason: same ? undefined : 'Event content conflict',
        });
        if (!same) break;
        continue;
      }
      const edge = machine.states[state].on?.[event.type];
      if (!edge) {
        results.push({
          caseId: input.caseId,
          eventId: event.eventId,
          status: 'rejected',
          reason: 'Illegal transition',
        });
        break;
      }
      rows.push({
        ...event,
        payload: JSON.stringify(event.payload),
        sequence: history.length + 1,
        createdAt: new Date().toISOString(),
      });
      results.push({
        caseId: input.caseId,
        eventId: event.eventId,
        status: 'applied',
        currentState: edge.target,
      });
    }
    if (
      adapter === 'register' &&
      prepareAutomatically &&
      results.some((result) => result.status === 'applied')
    )
      completePreparation(input.caseId);
    if (loseNext) {
      loseNext = false;
      throw new Error('lost response');
    }
    const complete =
      results.length === events.length &&
      results.every((result) => ['applied', 'duplicate'].includes(result.status));
    return Response.json({
      caseId: input.caseId,
      events,
      results,
      status: complete
        ? 'completed'
        : results.some((result) => result.status === 'applied')
          ? 'partial'
          : 'rejected',
      persisted: complete,
      partiallyPersisted: !complete && results.some((result) => result.status === 'applied'),
    });
  };
  return {
    rows,
    notifications,
    calls,
    fetchImpl,
    lose: () => {
      loseNext = true;
    },
    deferPreparation: () => {
      prepareAutomatically = false;
    },
    completePreparation,
  };
}
async function withServer(run) {
  const fake = fakeN8n();
  const server = createDemoServer({
    host: 'https://n8n.example',
    apiKey: 'private-key',
    token: 'private-token',
    fetchImpl: fake.fetchImpl,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const api = (path, body) =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port: server.address().port,
          path,
          method: body === undefined ? 'GET' : 'POST',
          headers: {
            host: 'localhost:5174',
            origin: 'http://localhost:5173',
            'content-type': 'application/json',
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
        },
      );
      req.on('error', reject);
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  try {
    await run(api, fake);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
const base = '/api/competition/entries';
test('competition API starts empty, persists registration and displays authoritative pinned records without PIN', async () =>
  withServer(async (api, fake) => {
    assert.deepEqual((await api(base)).body, { entries: [] });
    const created = await api(base, register('register-one'));
    assert.equal(created.status, 201);
    const entry = created.body.entry;
    assert.match(entry.caseId, /^competition-[a-f0-9]{32}$/);
    assert.equal(entry.state, 'WAITING_FOR_PUBLICATION');
    assert.equal(entry.sequence, 2);
    assert.equal(entry.name, 'Taylor');
    assert.equal('pin' in entry, false);
    assert.deepEqual(entry.machine, machine);
    const refreshed = await api(`${base}/${entry.caseId}`);
    assert.equal(refreshed.body.entry.state, entry.state);
    assert.equal((await api(base)).body.entries.length, 1);
    const gateway = fake.calls.find((call) => call.url.endsWith('/webhook/flow4gold-competition'));
    assert.equal(JSON.parse(gateway.options.body).input.actor.id, `contestant:${entry.caseId}`);
    assert.ok(!JSON.stringify(created.body).includes('private-token'));
    // Unrelated smoke fixtures are not a second fake library in the UI.
    fake.rows.push({ ...fake.rows[0], caseId: 'generic-old-smoke', eventId: 'old' });
    assert.equal((await api(base)).body.entries.length, 1);
    const repeat = await api(base, register('register-one'));
    assert.equal(repeat.body.entry.caseId, entry.caseId);
    assert.equal(fake.rows.filter((row) => row.caseId === entry.caseId).length, 2);
  }));
test('full contestant/organizer journey persists evidence and retries after state advancement', async () =>
  withServer(async (api, fake) => {
    const created = await api(base, register('journey'));
    const caseId = created.body.entry.caseId;
    const url = `${base}/${caseId}/actions`;
    const actions = [
      { action: 'WORKFLOW_LINKED', workflowId: '12345', workflowVerified: true },
      {
        action: 'INFORMATION_REQUESTED',
        reason: 'Missing context',
        question: 'Who does this help?',
      },
      { action: 'INFORMATION_PROVIDED', response: 'It helps volunteers.' },
      {
        action: 'FINALIST_SELECTED',
        reason: 'Strong usefulness',
        invitationDetails: 'Attend the live final.',
      },
      { action: 'INVITATION_ACCEPTED' },
      {
        action: 'CHECKED_IN',
        reason: 'Present',
        attendanceRecord: 'Organizer observed arrival at desk.',
      },
      { action: 'WINNER_SELECTED', reason: 'Human jury selected this entry.' },
      { action: 'PRIZE_ACCEPTED' },
    ];
    for (const [index, action] of actions.entries()) {
      const response = await api(url, { requestId: `step-${index}`, ...action });
      assert.equal(response.status, 200, JSON.stringify(response.body));
    }
    const final = (await api(`${base}/${caseId}`)).body.entry;
    assert.equal(final.state, 'CLOSED');
    assert.equal(final.outcome, 'WINNER');
    assert.equal(final.workflowId, '12345');
    assert.equal(final.events.length, 10);
    const before = fake.rows.length;
    assert.equal((await api(url, { requestId: 'step-7', action: 'PRIZE_ACCEPTED' })).status, 200);
    assert.equal(fake.rows.length, before);
    const decision = final.events.find((event) => event.type === 'WINNER_SELECTED');
    assert.equal(decision.payload.juryDecisionId, 'local-workbench-decision:step-6');
    assert.equal(
      (await api(url, { requestId: 'new-illegal', action: 'WINNER_SELECTED', reason: 'Again' }))
        .status,
      409,
    );
  }));
test('single-event registration can prepare asynchronously and reject manual task-result events', async () =>
  withServer(async (api, fake) => {
    fake.lose();
    const lost = await api(base, register('lost'));
    assert.equal(lost.status, 502);
    assert.equal(lost.body.requestId, 'lost');
    assert.equal(fake.rows.length, 2);
    const retry = await api(base, register('lost'));
    assert.equal(retry.status, 201);
    assert.equal(fake.rows.length, 2);
    fake.deferPreparation();
    const accepted = await api(base, register('preparing'));
    assert.equal(accepted.status, 201);
    assert.equal(accepted.body.result.results.length, 1);
    assert.equal(accepted.body.result.persisted, true);
    assert.equal(accepted.body.entry.state, 'REGISTERED');
    assert.equal(accepted.body.entry.sequence, 1);
    assert.equal(accepted.body.entry.notification.status, 'not_expected');
    const caseId = accepted.body.entry.caseId;
    const callsBefore = fake.calls.filter((call) =>
      call.url.endsWith('/webhook/flow4gold-competition'),
    ).length;
    const manual = await api(`${base}/${caseId}/actions`, {
      requestId: 'manual-preparation',
      action: 'WORKFLOW_LINKED',
      workflowId: '123',
      workflowVerified: true,
    });
    assert.equal(manual.status, 409);
    assert.match(manual.body.error, /state task/);
    assert.equal(
      fake.calls.filter((call) => call.url.endsWith('/webhook/flow4gold-competition')).length,
      callsBefore,
    );
    const repeated = await api(base, register('preparing'));
    assert.equal(repeated.body.entry.sequence, 1);
    fake.completePreparation(caseId);
    const finished = (await api(`${base}/${caseId}`)).body.entry;
    assert.equal(finished.state, 'WAITING_FOR_PUBLICATION');
    assert.equal(finished.sequence, 2);
    assert.equal(finished.notification.status, 'pending');
    assert.equal(finished.notification.current, null);
    assert.equal(fake.rows.length, 4);
  }));
test('competition-wide capacity is enforced across concurrent writes, excluding identical retries', async () =>
  withServer(async (api, fake) => {
    const cases = [];
    for (let index = 0; index < 4; index++) {
      const body = register(`capacity-${index}`);
      body.submission.publishedWorkflow = {
        id: String(100 + index),
        url: `https://n8n.io/workflows/${100 + index}/`,
        verificationReference: 'User checked link',
      };
      cases.push((await api(base, body)).body.entry.caseId);
    }
    const select = (index) =>
      api(`${base}/${cases[index]}/actions`, {
        requestId: `finalist-${index}`,
        action: 'FINALIST_SELECTED',
        reason: 'Human jury decision',
        invitationDetails: 'Join final',
      });
    assert.equal((await select(0)).status, 200);
    assert.equal((await select(1)).status, 200);
    const responses = await Promise.all([select(2), select(3)]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
    assert.equal(fake.rows.filter((row) => row.type === 'FINALIST_SELECTED').length, 3);
    assert.equal((await select(0)).status, 200);
  }));
test('request validation rejects forged actors, missing consent, unchecked publication and invalid expiry', () => {
  assert.throws(() => registrationRequest({ ...register('r'), actor: { verified: true } }));
  assert.throws(() =>
    registrationRequest({ ...register('r'), submission: { ...submission, privacyConsent: false } }),
  );
  const entry = { contestantId: 'person', events: [{ correlationId: 'c' }] };
  assert.throws(() =>
    actionRequest('c', entry, { requestId: 'a', action: 'WORKFLOW_LINKED', workflowId: '123' }),
  );
  assert.throws(() =>
    actionRequest('c', entry, {
      requestId: 'a',
      action: 'WINNER_SELECTED',
      actor: { verified: true },
      reason: 'x',
    }),
  );
  assert.throws(() =>
    actionRequest('c', entry, {
      requestId: 'a',
      action: 'PRIZE_ACCEPTANCE_EXPIRED',
      reason: 'x',
      acceptanceDeadline: '2020-01-01',
      checkedAt: '2099-01-01',
      noAcceptanceRecorded: true,
    }),
  );
  const expired = actionRequest('c', entry, {
    requestId: 'a',
    action: 'PRIZE_ACCEPTANCE_EXPIRED',
    reason: 'Checked',
    acceptanceDeadline: '2020-01-01',
    checkedAt: '2020-01-02',
    noAcceptanceRecorded: true,
  });
  assert.equal(expired.input.evidence.noAcceptanceRecorded, true);
});

const notificationFor = (event, state, changes = {}) => ({
  taskInvocationId: event.eventId + ':notify_participant',
  caseId: event.caseId,
  triggerEventId: event.eventId,
  correlationId: event.correlationId,
  machine: event.machine,
  machineVersion: event.machineVersion,
  state,
  sequence: event.sequence,
  subject: 'Saved update',
  message: 'A message actually written by the state task.',
  channel: 'in_app',
  ...changes,
});
test('inbox projection shows only a stored message for the exact current state-entry event', async () =>
  withServer(async (api, fake) => {
    const created = await api(base, register('messages'));
    const caseId = created.body.entry.caseId;
    const pendingEvent = fake.rows.filter((row) => row.caseId === caseId).at(-1);
    assert.equal(created.body.entry.notification.status, 'pending');
    const earlier = notificationFor(pendingEvent, 'WAITING_FOR_PUBLICATION', {
      createdAt: '2099-01-01T00:00:00Z',
    });
    fake.notifications.push(earlier);
    const delivered = (await api(`${base}/${caseId}`)).body.entry;
    assert.equal(delivered.notification.status, 'delivered');
    assert.equal(delivered.notification.current.triggerEventId, pendingEvent.eventId);
    await api(`${base}/${caseId}/actions`, {
      requestId: 'link-message',
      action: 'WORKFLOW_LINKED',
      workflowId: '123',
      workflowVerified: true,
    });
    let entry = (await api(`${base}/${caseId}`)).body.entry;
    assert.equal(entry.state, 'ADMIN_REVIEW');
    assert.equal(entry.notification.status, 'pending');
    assert.equal(entry.notification.current, null);
    assert.equal(entry.notifications.length, 1);
    const reviewEvent = fake.rows.filter((row) => row.caseId === caseId).at(-1);
    for (const change of [
      { state: 'INVITED' },
      { sequence: 1 },
      { correlationId: 'other' },
      { machineVersion: 2 },
      { taskInvocationId: 'wrong' },
      { channel: 'email' },
    ])
      fake.notifications.push(notificationFor(reviewEvent, 'ADMIN_REVIEW', change));
    entry = (await api(`${base}/${caseId}`)).body.entry;
    assert.equal(entry.notification.status, 'pending');
    fake.notifications.push(
      notificationFor(reviewEvent, 'ADMIN_REVIEW', {
        subject: 'Current review',
        createdAt: '2026-01-01T00:00:00Z',
      }),
    );
    entry = (await api(`${base}/${caseId}`)).body.entry;
    assert.equal(entry.notification.current.subject, 'Current review');
    assert.equal(entry.notifications.length, 2);
    await api(`${base}/${caseId}/actions`, {
      requestId: 'close-message',
      action: 'NOT_SELECTED',
      reason: 'Human jury decision',
    });
    entry = (await api(`${base}/${caseId}`)).body.entry;
    assert.equal(entry.state, 'CLOSED');
    assert.equal(entry.notification.status, 'not_expected');
    assert.equal(entry.notification.current, null);
    assert.equal(entry.notifications.length, 2);
  }));
test('conflicting duplicate notification invocations are not treated as delivered', () => {
  const caseId = 'competition-' + 'a'.repeat(32);
  const stream = [
    {
      caseId,
      eventId: 'first',
      sequence: 1,
      type: 'SUBMISSION_RECEIVED',
      machine: machine.machine,
      machineVersion: 1,
      correlationId: caseId,
    },
    {
      caseId,
      eventId: 'prepared',
      sequence: 2,
      type: 'PUBLICATION_PENDING',
      machine: machine.machine,
      machineVersion: 1,
      correlationId: caseId,
    },
  ];
  const row = notificationFor(stream[1], 'WAITING_FOR_PUBLICATION');
  const result = projectNotifications(caseId, machine, 'WAITING_FOR_PUBLICATION', stream, [
    row,
    { ...row, message: 'Conflicting duplicate' },
  ]);
  assert.equal(result.notification.status, 'pending');
  assert.deepEqual(result.notifications, []);
});
