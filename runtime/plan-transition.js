// Pure replay and planning. Only the downstream Append Event node writes.
const { request, definitions } = $('Load Machine Definitions').first().json;
// Empty query placeholders must not include unrelated malformed rows.
const rows = $input
  .all()
  .map((item) => item.json)
  .filter(
    (row) =>
      row.caseId === request.caseId ||
      (request.eventId && row.eventId === request.eventId) ||
      (request.causationId && row.eventId === request.causationId),
  );
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const canonical = (value) =>
  JSON.stringify(
    value === null || typeof value !== 'object'
      ? value
      : Array.isArray(value)
        ? value.map((value) => JSON.parse(canonical(value)))
        : Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, JSON.parse(canonical(value[key]))]),
          ),
  );
const isId = (value) => typeof value === 'string' && value.length > 0 && value.trim() === value;
const stream = rows
  .filter((row) => row.caseId === request.caseId)
  .sort((a, b) => a.sequence - b.sequence);
const beforeReplay = (status, reason) => [
  {
    json: {
      action: 'return',
      result: {
        caseId: request.caseId,
        eventId: request.eventId ?? null,
        status,
        reason,
        currentState: null,
        outcome: null,
        sequence: 0,
      },
    },
  },
];
if (!stream.length && request.operation === 'inspect')
  return beforeReplay('not_found', 'Case has no recorded events.');
if (!stream.length && request.machine === undefined)
  return beforeReplay('rejected', 'A new case requires explicit machine and machineVersion.');
if (
  stream.length &&
  request.machine !== undefined &&
  (request.machine !== stream[0].machine || request.machineVersion !== stream[0].machineVersion)
)
  return beforeReplay('rejected', 'Case machine and version are pinned by its first event.');
// A catalog update never changes the definition used to replay an existing case.
const identity = stream.length
  ? { machine: stream[0].machine, version: stream[0].machineVersion }
  : { machine: request.machine, version: request.machineVersion };
const definition = definitions.find(
  (item) => item.machine === identity.machine && item.version === identity.version,
);
if (!definition) return beforeReplay('rejected', 'Unknown machine or version.');
let currentState = definition.initial,
  outcome = null,
  sequence = 0;
let correlationId = request.correlationId ?? stream[0]?.correlationId ?? request.caseId;
const output = (result, extra = {}) => [
  {
    json: {
      action: 'return',
      result: {
        caseId: request.caseId,
        eventId: request.eventId ?? null,
        currentState: stream.length ? currentState : null,
        outcome,
        sequence,
        correlationId,
        causationId: request.causationId ?? '',
        ...result,
      },
      ...extra,
    },
  },
];
const reject = (reason) => output({ status: 'rejected', reason });
const transition = (stateName, type) => {
  const state = definition.states[stateName];
  if (!state || state.final) return null;
  const kind = has(state.on || {}, type) ? 'on' : has(state.decide || {}, type) ? 'decide' : null;
  if (!kind) return null;
  const edge = state[kind][type];
  return has(definition.states, edge.target) ? { ...edge, kind } : null;
};
const ids = new Set();
for (const event of rows) {
  if (
    !isId(event.eventId) ||
    !isId(event.caseId) ||
    !isId(event.type) ||
    !isId(event.correlationId) ||
    typeof event.causationId !== 'string' ||
    event.causationId.trim() !== event.causationId ||
    (event.taskInvocationId != null &&
      (typeof event.taskInvocationId !== 'string' ||
        event.taskInvocationId.trim() !== event.taskInvocationId)) ||
    event.causationId === event.eventId ||
    !Number.isSafeInteger(event.sequence) ||
    event.sequence < 1 ||
    !isId(event.machine) ||
    !Number.isSafeInteger(event.machineVersion) ||
    event.machineVersion < 1 ||
    (event.caseId === request.caseId &&
      (event.machine !== definition.machine || event.machineVersion !== definition.version))
  )
    return reject('Invalid persisted event identity, sequence, or machine version.');
  if (ids.has(event.eventId))
    return reject('Multiple rows share an eventId; manual reconciliation required.');
  ids.add(event.eventId);
  try {
    const payload = JSON.parse(event.payload);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      return reject('Invalid persisted event payload.');
  } catch {
    return reject('Invalid persisted event payload.');
  }
}
const seen = new Set();
let previousEvent;
// Result lineage binds a callback to this entry into the state, not an older task run.
const validInvocation = (event, state, trigger) => {
  const invocationId = event.taskInvocationId ?? '';
  const requiresResult = transition(state, event.type)?.taskResult === true;
  if (!invocationId) return !requiresResult;
  const tasks = definition.states[state].tasks || [];
  return (
    tasks.length === 1 &&
    trigger &&
    event.causationId === trigger.eventId &&
    invocationId === `${trigger.eventId}:${tasks[0]}` &&
    event.eventId === `${invocationId}:result`
  );
};
// Replay reconstructs state only. Dispatch is planned later for a newly accepted event.
for (const event of stream) {
  if (event.sequence !== sequence + 1)
    return reject('Event stream sequence must be contiguous from 1.');
  if (event.correlationId !== stream[0].correlationId)
    return reject('Event stream correlationId changed.');
  const localCause = stream.find((candidate) => candidate.eventId === event.causationId);
  if (localCause && !seen.has(localCause.eventId))
    return reject('Event stream has a forward causation reference.');
  if (!validInvocation(event, currentState, previousEvent))
    return reject('Event stream contains an invalid task invocation.');
  const edge = transition(currentState, event.type);
  if (!edge) return reject('Event stream contains an illegal transition.');
  currentState = edge.target;
  outcome = edge.outcome ?? outcome;
  sequence = event.sequence;
  seen.add(event.eventId);
  previousEvent = event;
}
if (request.operation === 'inspect')
  return output({ status: stream.length ? 'inspected' : 'not_found' });
if (request.causationId === request.eventId) return reject('An event cannot cause itself.');
const cause = request.causationId
  ? rows.find((event) => event.eventId === request.causationId)
  : undefined;
if (request.causationId && !cause) return reject('causationId must reference an existing event.');
correlationId =
  request.correlationId ?? stream[0]?.correlationId ?? cause?.correlationId ?? request.caseId;
if (
  (stream.length && correlationId !== stream[0].correlationId) ||
  (cause && correlationId !== cause.correlationId)
)
  return reject('correlationId must agree with the case stream and cause.');
if (request.taskInvocationId && request.eventId !== `${request.taskInvocationId}:result`)
  return reject('Task result eventId must match taskInvocationId.');
// Check retries before validating the current state: an accepted result may have moved it on.
const duplicate = rows.find((event) => event.eventId === request.eventId);
if (duplicate) {
  if (
    duplicate.caseId !== request.caseId ||
    duplicate.type !== request.type ||
    canonical(JSON.parse(duplicate.payload)) !== canonical(request.payload) ||
    (duplicate.taskInvocationId ?? '') !== (request.taskInvocationId ?? '') ||
    duplicate.causationId !== request.causationId ||
    duplicate.correlationId !== correlationId
  )
    return reject('eventId already belongs to a different event.');
  return output({ status: 'duplicate' });
}
if (!validInvocation(request, currentState, stream.at(-1)))
  return reject('Task result does not match the current task invocation.');
const edge = transition(currentState, request.type);
if (!edge) return reject('Event is not enabled in the current state.');
const tasks = definition.states[edge.target].tasks || [];
if (tasks.length > 1) return reject('Only one task per entered state is supported.');
const taskInvocation = tasks.length
  ? {
      caseId: request.caseId,
      task: tasks[0],
      taskInvocationId: `${request.eventId}:${tasks[0]}`,
      triggerEventId: request.eventId,
      correlationId,
      state: edge.target,
      machine: definition.machine,
      machineVersion: definition.version,
      input: request.payload,
    }
  : null;
const from = currentState;
const eventRecord = {
  eventId: request.eventId,
  caseId: request.caseId,
  sequence: sequence + 1,
  type: request.type,
  taskInvocationId: request.taskInvocationId ?? '',
  payload: canonical(request.payload),
  causationId: request.causationId,
  correlationId,
  machine: definition.machine,
  machineVersion: definition.version,
};
return output(
  {
    status: 'applied',
    currentState: edge.target,
    sequence: eventRecord.sequence,
    outcome: edge.outcome ?? outcome,
    transition: { from, target: edge.target, event: request.type, kind: edge.kind },
  },
  { action: 'apply', eventRecord, taskInvocation },
);
