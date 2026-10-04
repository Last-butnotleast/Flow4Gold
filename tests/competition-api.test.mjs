import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { request } from 'node:http';
import { createDemoServer } from '../server/demo-server.mjs';
import { registrationRequest, actionRequest } from '../server/competition.mjs';
const machine = JSON.parse(await readFile('machines/flow4gold-submission.v1.json', 'utf8'));
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
    calls = [];
  let loseNext = false,
    partialNext = false;
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
              payload: {
                submission: Object.fromEntries(
                  Object.entries(input.submission).filter(([key]) => key !== 'publishedWorkflow'),
                ),
                actorId: input.actor.id,
              },
            },
            {
              type: input.submission.publishedWorkflow ? 'WORKFLOW_LINKED' : 'PUBLICATION_PENDING',
              payload: input.submission.publishedWorkflow
                ? { workflow: input.submission.publishedWorkflow, actorId: input.actor.id }
                : { actorId: input.actor.id },
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
      if (partialNext && index === 1) {
        partialNext = false;
        results.push({
          caseId: input.caseId,
          eventId: event.eventId,
          status: 'rejected',
          reason: 'Synthetic interrupted batch',
        });
        break;
      }
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
    calls,
    fetchImpl,
    lose: () => {
      loseNext = true;
    },
    partial: () => {
      partialNext = true;
    },
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
test('lost responses and partial registration preserve stable request identity and actual progress', async () =>
  withServer(async (api, fake) => {
    fake.lose();
    const lost = await api(base, register('lost'));
    assert.equal(lost.status, 502);
    assert.equal(lost.body.requestId, 'lost');
    assert.equal(fake.rows.length, 2);
    const retry = await api(base, register('lost'));
    assert.equal(retry.status, 201);
    assert.equal(fake.rows.length, 2);
    fake.partial();
    const partial = await api(base, register('partial'));
    assert.equal(partial.status, 409);
    assert.equal(partial.body.entry.state, 'REGISTERED');
    assert.equal(partial.body.result.persisted, false);
    const finished = await api(base, register('partial'));
    assert.equal(finished.status, 201);
    assert.equal(finished.body.entry.state, 'WAITING_FOR_PUBLICATION');
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
