import { createHash } from 'node:crypto';

const machineId = 'flow4gold-submission';
const eventTableId = 'TjuB58skTvPRCwB3';
const casePattern = /^competition-[a-f0-9]{32}$/;
const contestantActions = new Set([
  'WORKFLOW_LINKED',
  'INFORMATION_PROVIDED',
  'INVITATION_ACCEPTED',
  'INVITATION_DECLINED',
  'WITHDRAWN',
  'PRIZE_ACCEPTED',
  'PRIZE_DECLINED',
]);
const organizerActions = new Set([
  'INFORMATION_REQUESTED',
  'ENTRY_DISQUALIFIED',
  'FINALIST_SELECTED',
  'NOT_SELECTED',
  'CHECKED_IN',
  'NO_SHOW_RECORDED',
  'WINNER_SELECTED',
  'RUNNER_UP_SELECTED',
  'PRIZE_ACCEPTANCE_EXPIRED',
]);
const error = (message, status = 400, details = {}) => {
  throw Object.assign(new Error(message), { status, details });
};
const text = (value, name, max = 2000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    error(`${name} is required (maximum ${max} characters).`);
  return value.trim();
};
const object = (value, keys, name) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    error(`Invalid ${name} fields.`);
  return value;
};
const requestId = (value) => {
  const id = text(value, 'requestId', 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) error('Invalid requestId.');
  return id;
};
const https = (value, name) => {
  const result = text(value, name, 2000);
  let url;
  try {
    url = new URL(result);
  } catch {
    error(`${name} must be an HTTPS URL.`);
  }
  if (url.protocol !== 'https:' || url.username || url.password)
    error(`${name} must be an HTTPS URL without credentials.`);
  return result;
};
function workflowEvidence(value) {
  object(value, ['id', 'url', 'verificationReference'], 'published workflow');
  const id = text(value.id, 'Published workflow ID', 30);
  if (!/^[1-9][0-9]*$/.test(id))
    error('Published workflow ID must be a positive numeric template ID.');
  const url = https(value.url, 'Published workflow URL');
  if (!new RegExp('^https://n8n\\.io/workflows/' + id + '(?:[-/?#]|$)').test(url))
    error('Published workflow URL must match its n8n template ID.');
  return {
    id,
    url,
    verificationReference: text(
      value.verificationReference,
      'Publication verification reference',
      1000,
    ),
  };
}
export function registrationRequest(body) {
  object(body, ['requestId', 'submission'], 'registration');
  const id = requestId(body.requestId);
  const raw = object(
    body.submission,
    [
      'contestantName',
      'email',
      'title',
      'videoUrl',
      'templateSubmitted',
      'ticketConfirmed',
      'privacyConsent',
      'recordingConsent',
      'publishedWorkflow',
    ],
    'submission',
  );
  const email = text(raw.email, 'Email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error('Enter a valid email address.');
  const submission = {
    contestantName: text(raw.contestantName, 'Name', 200),
    email,
    title: text(raw.title, 'Title', 300),
    videoUrl: https(raw.videoUrl, 'Video URL'),
  };
  for (const key of [
    'templateSubmitted',
    'ticketConfirmed',
    'privacyConsent',
    'recordingConsent',
  ]) {
    if (raw[key] !== true) error(`Registration requires ${key}.`);
    submission[key] = true;
  }
  if (raw.publishedWorkflow !== undefined)
    submission.publishedWorkflow = workflowEvidence(raw.publishedWorkflow);
  // Stable request-derived identity makes a lost-response retry address the same stored case.
  const caseId = 'competition-' + createHash('sha256').update(id).digest('hex').slice(0, 32);
  return {
    adapter: 'register',
    input: {
      caseId,
      requestId: id,
      correlationId: caseId,
      actor: { id: `contestant:${caseId}`, role: 'contestant', verified: true, caseId },
      submission,
    },
  };
}
export function actionRequest(caseId, entry, body, now = Date.now()) {
  object(
    body,
    [
      'requestId',
      'action',
      'reason',
      'question',
      'response',
      'workflowId',
      'workflowVerified',
      'juryDecisionId',
      'invitationDetails',
      'attendanceRecord',
      'acceptanceDeadline',
      'checkedAt',
      'noAcceptanceRecorded',
    ],
    'action',
  );
  const id = requestId(body.requestId),
    action = text(body.action, 'Action', 100);
  if (!contestantActions.has(action) && !organizerActions.has(action))
    error('Unsupported competition action.');
  const common = { caseId, requestId: id, correlationId: entry.events[0].correlationId };
  if (contestantActions.has(action)) {
    const response = { action };
    if (body.reason !== undefined) response.reason = text(body.reason, 'Reason');
    if (action === 'WORKFLOW_LINKED') {
      if (body.workflowVerified !== true)
        error('Confirm that you checked the published workflow link.');
      response.workflow = workflowEvidence({
        id: body.workflowId,
        url: `https://n8n.io/workflows/${body.workflowId}/`,
        verificationReference: `user-provided-workflow:${id}`,
      });
    }
    if (action === 'INFORMATION_PROVIDED')
      response.message = text(body.response, 'Clarification', 10000);
    return {
      adapter: 'contestant',
      input: {
        ...common,
        actor: { id: entry.contestantId, role: 'contestant', verified: true, caseId },
        caseSnapshot: { caseId, contestantId: entry.contestantId },
        response,
      },
    };
  }
  const evidence = { reason: text(body.reason, 'Decision reason'), revision: id };
  if (action === 'INFORMATION_REQUESTED') evidence.question = text(body.question, 'Question');
  if (
    ['FINALIST_SELECTED', 'WINNER_SELECTED', 'RUNNER_UP_SELECTED', 'NOT_SELECTED'].includes(action)
  )
    evidence.juryDecisionId =
      body.juryDecisionId === undefined
        ? `local-workbench-decision:${id}`
        : text(body.juryDecisionId, 'Jury decision reference');
  if (action === 'FINALIST_SELECTED')
    evidence.invitationDetails = text(body.invitationDetails, 'Invitation details');
  if (['CHECKED_IN', 'NO_SHOW_RECORDED'].includes(action))
    evidence.attendanceRecord = text(body.attendanceRecord, 'Attendance record');
  if (action === 'PRIZE_ACCEPTANCE_EXPIRED') {
    const deadline = text(body.acceptanceDeadline, 'Acceptance deadline'),
      checkedAt = text(body.checkedAt, 'Checked time');
    if (
      !Number.isFinite(Date.parse(deadline)) ||
      !Number.isFinite(Date.parse(checkedAt)) ||
      Date.parse(checkedAt) <= Date.parse(deadline) ||
      Date.parse(checkedAt) > now ||
      body.noAcceptanceRecorded !== true
    )
      error(
        'Expiry needs an explicit check after the deadline, no later than now, and confirmation that no acceptance was recorded.',
      );
    if (entry.events.some((event) => event.type === 'PRIZE_ACCEPTED'))
      error('Prize acceptance is already recorded.', 409);
    Object.assign(evidence, {
      acceptanceDeadline: deadline,
      checkedAt,
      noAcceptanceRecorded: true,
    });
  }
  return {
    adapter: 'organizer',
    input: {
      ...common,
      actor: { id: 'local-workbench-organizer', role: 'organizer', verified: true },
      action,
      evidence,
      ...(['FINALIST_SELECTED', 'WINNER_SELECTED'].includes(action)
        ? { competitionId: 'flow4gold-workbench' }
        : {}),
    },
  };
}

export function createCompetitionService({
  host,
  apiKey,
  token,
  fetchImpl = fetch,
  catalog,
  inspect,
}) {
  const cache = new Map();
  let writeTail = Promise.resolve();
  const serialize = (work) => {
    const next = writeTail.then(work, work);
    writeTail = next.catch(() => {});
    return next;
  };
  async function rows(caseId) {
    const found = [];
    let cursor;
    do {
      const filters = [{ columnName: 'machine', condition: 'eq', value: machineId }];
      if (caseId) filters.push({ columnName: 'caseId', condition: 'eq', value: caseId });
      const query = new URLSearchParams({
        filter: JSON.stringify({ type: 'and', filters }),
        limit: '100',
      });
      if (cursor) query.set('cursor', cursor);
      const response = await fetchImpl(
        new URL(`/api/v1/data-tables/${eventTableId}/rows?${query}`, host),
        { headers: { 'X-N8N-API-KEY': apiKey }, signal: AbortSignal.timeout(15000) },
      );
      if (!response.ok) error('Could not load competition events.', 502);
      const page = await response.json();
      if (
        !Array.isArray(page.data) ||
        page.data.some((row) => row.machine !== machineId || (caseId && row.caseId !== caseId))
      )
        error('Unexpected competition event response.', 502);
      for (const row of page.data) {
        if (!casePattern.test(row.caseId)) continue;
        let payload;
        try {
          payload = JSON.parse(row.payload);
        } catch {
          error('Competition event payload is invalid.', 502);
        }
        found.push({ ...row, payload });
      }
      cursor = page.nextCursor;
      if (found.length > 20000) error('Competition workbench event limit exceeded.', 502);
    } while (cursor);
    return found.sort((a, b) => a.sequence - b.sequence);
  }
  async function project(caseId, stream, stored) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!stream.length) error('Competition entry not found.', 404);
      const fingerprint = JSON.stringify(stream),
        cached = cache.get(caseId);
      const result =
        cached?.fingerprint === fingerprint
          ? cached.result
          : await inspect({ caseId, operation: 'inspect' });
      if (result.caseId !== caseId || result.status !== 'inspected')
        error('Core could not inspect this competition entry.', 502);
      if (result.sequence !== stream.length) {
        stream = await rows(caseId);
        continue;
      }
      const first = stream[0],
        registration = first.payload?.submission;
      if (
        first.type !== 'SUBMISSION_RECEIVED' ||
        !registration ||
        typeof first.payload.actorId !== 'string' ||
        stream.some(
          (event) =>
            event.machine !== first.machine || event.machineVersion !== first.machineVersion,
        )
      )
        error('Competition registration evidence is incomplete.', 502);
      const definition = stored.machines.find(
        (item) => item.machine === first.machine && item.version === first.machineVersion,
      )?.definition;
      if (!definition) error('The entry machine version is missing from the catalog.', 502);
      if (cache.size >= 200) cache.delete(cache.keys().next().value);
      cache.set(caseId, { fingerprint, result });
      const workflow = stream.findLast((event) => event.payload.workflow)?.payload.workflow;
      const videoUrl =
        stream.findLast((event) => event.payload.videoUrl)?.payload.videoUrl ??
        registration.videoUrl;
      return {
        caseId,
        machine: definition,
        state: result.currentState,
        currentState: result.currentState,
        outcome: result.outcome,
        sequence: result.sequence,
        events: stream,
        title: registration.title,
        name: registration.contestantName,
        contestantName: registration.contestantName,
        email: registration.email,
        videoUrl,
        contestantId: first.payload.actorId,
        ...(workflow ? { workflow, workflowId: workflow.id, workflowUrl: workflow.url } : {}),
        reference: caseId,
        identity: 'local-workbench',
        notification: { delivered: false },
      };
    }
    error('This entry is changing. Refresh and try again.', 503);
  }
  async function get(caseId) {
    if (!casePattern.test(caseId)) error('Competition entry not found.', 404);
    const [stream, stored] = await Promise.all([rows(caseId), catalog()]);
    return project(caseId, stream, stored);
  }
  async function list() {
    const [stream, stored] = await Promise.all([rows(), catalog()]);
    const grouped = new Map();
    for (const event of stream) {
      if (!grouped.has(event.caseId)) grouped.set(event.caseId, []);
      grouped.get(event.caseId).push(event);
    }
    const entries = [];
    for (const [caseId, events] of grouped) entries.push(await project(caseId, events, stored));
    return entries.sort(
      (a, b) =>
        (b.events[0].createdAt ?? '').localeCompare(a.events[0].createdAt ?? '') ||
        a.caseId.localeCompare(b.caseId),
    );
  }
  async function dispatch(envelope) {
    let response;
    try {
      response = await fetchImpl(new URL('/webhook/flow4gold-competition', host), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Flow4Gold-Demo': token },
        body: JSON.stringify(envelope),
        signal: AbortSignal.timeout(60000),
      });
    } catch {
      error(
        'n8n did not confirm the request. Refresh the entry and retry with the same request ID.',
        502,
        { caseId: envelope.input.caseId, requestId: envelope.input.requestId },
      );
    }
    if (!response.ok)
      error(
        'n8n could not complete the competition request. Refresh and retry with the same request ID.',
        502,
        { caseId: envelope.input.caseId, requestId: envelope.input.requestId },
      );
    let result;
    try {
      result = await response.json();
    } catch {
      error('n8n returned an unreadable response. Retry with the same request ID.', 502, {
        caseId: envelope.input.caseId,
        requestId: envelope.input.requestId,
      });
    }
    if (result.caseId !== envelope.input.caseId || !Array.isArray(result.results))
      error('Unexpected competition gateway response.', 502);
    let entry;
    try {
      entry = await get(envelope.input.caseId);
    } catch (failure) {
      if (failure.status !== 404) throw failure;
    }
    if (result.status !== 'completed' || result.persisted !== true) {
      const reason = result.results.find((item) => item.status === 'rejected')?.reason;
      error(
        reason ??
          (result.partiallyPersisted
            ? 'Only part of the request was saved. Refresh and retry the same request ID.'
            : 'The request was not confirmed. Refresh and retry the same request ID.'),
        result.status === 'uncertain' ? 502 : 409,
        { entry, result, caseId: envelope.input.caseId, requestId: envelope.input.requestId },
      );
    }
    if (!entry)
      error(
        'n8n acknowledged the request but its saved entry is not yet readable. Retry the same request ID.',
        502,
        { result, caseId: envelope.input.caseId },
      );
    return { entry, result };
  }
  return {
    list,
    get,
    register: (body) => serialize(() => dispatch(registrationRequest(body))),
    act: (caseId, body) =>
      serialize(async () => {
        const entry = await get(caseId),
          envelope = actionRequest(caseId, entry, body);
        const eventId = JSON.stringify([caseId, envelope.input.requestId, body.action]);
        const alreadyRecorded = entry.events.some((event) => event.eventId === eventId);
        // Do not reject a retry because its accepted event already advanced the state.
        if (!alreadyRecorded) {
          const state = entry.machine.states[entry.state];
          if (!state?.on?.[body.action] && !state?.decide?.[body.action])
            error(`${body.action} is not available from ${entry.state}.`, 409);
          if (['FINALIST_SELECTED', 'WINNER_SELECTED'].includes(body.action)) {
            const limit = body.action === 'FINALIST_SELECTED' ? 3 : 1;
            const entries = await list();
            if (
              entries.filter((item) => item.events.some((event) => event.type === body.action))
                .length >= limit
            )
              error(
                body.action === 'FINALIST_SELECTED'
                  ? 'All three finalist places have already been assigned.'
                  : 'A winner has already been selected.',
                409,
              );
          }
        }
        return dispatch(envelope);
      }),
  };
}
