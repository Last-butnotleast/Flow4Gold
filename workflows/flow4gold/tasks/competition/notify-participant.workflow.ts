import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : Flow4Gold Competition - Notify Participant
// Nodes   : 14  |  Connections: 15
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// ReceiveTask                        executeWorkflowTrigger
// ValidateNotificationInvocation     code
// ReadCaseEvents                     dataTable                  [alwaysOutput]
// ReadMachineDefinitions             dataTable                  [alwaysOutput] [executeOnce]
// HydrateRecordedNotification        code
// RouteNotificationState             switch
// ProgressUpdateMessage              code
// InformationRequestMessage          code
// InvitationMessage                  code
// PrizeAcceptanceMessage             code
// ComposeNotificationRecord          code
// UpsertInAppNotification            dataTable
// ReturnStoredNotification           code
// InAppNotificationBoundary          stickyNote
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// ReceiveTask
//    → ValidateNotificationInvocation
//      → ReadCaseEvents
//        → ReadMachineDefinitions
//          → HydrateRecordedNotification
//            → RouteNotificationState
//              → ProgressUpdateMessage
//                → ComposeNotificationRecord
//                  → UpsertInAppNotification
//                    → ReturnStoredNotification
//             .out(1) → InformationRequestMessage
//                → ComposeNotificationRecord (↩ loop)
//             .out(2) → InvitationMessage
//                → ComposeNotificationRecord (↩ loop)
//             .out(3) → PrizeAcceptanceMessage
//                → ComposeNotificationRecord (↩ loop)
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'u98rBfeXu4I66zMP',
    name: 'Flow4Gold Competition - Notify Participant',
    active: false,
    isArchived: false,
    settings: { saveManualExecutions: false, saveDataErrorExecution: 'none', executionOrder: 'v1' },
})
export class Flow4goldCompetitionNotifyParticipantWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: '31cb1159-2639-46e2-957b-b801934e1f6a',
        name: 'Receive Task',
        type: 'n8n-nodes-base.executeWorkflowTrigger',
        version: 1.2,
        position: [0, 0],
    })
    ReceiveTask = {
        inputSource: 'passthrough',
    };

    @node({
        id: 'competition-notify-ValidateInvocation',
        name: 'Validate Notification Invocation',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [240, 0],
    })
    ValidateNotificationInvocation = {
        mode: 'runOnceForAllItems',
        jsCode: `const items = $input.all();
if (items.length !== 1) throw new Error('Submit exactly one notification invocation.');
const invocation = items[0].json;
const fields = [
  'caseId',
  'task',
  'taskInvocationId',
  'triggerEventId',
  'correlationId',
  'state',
  'machine',
  'machineVersion',
  'input',
];
if (
  !invocation ||
  typeof invocation !== 'object' ||
  Array.isArray(invocation) ||
  Object.keys(invocation).length !== fields.length ||
  Object.keys(invocation).some((key) => !fields.includes(key))
) {
  throw new Error('Notification requires the core task invocation envelope.');
}
for (const field of fields.filter((field) => !['machineVersion', 'input'].includes(field))) {
  if (
    typeof invocation[field] !== 'string' ||
    !invocation[field].trim() ||
    invocation[field].trim() !== invocation[field]
  )
    throw new Error('Invalid invocation field: ' + field);
}
if (
  invocation.machine !== 'flow4gold-submission' ||
  invocation.task !== 'notify_participant' ||
  !Number.isSafeInteger(invocation.machineVersion) ||
  invocation.machineVersion < 1 ||
  invocation.taskInvocationId !== invocation.triggerEventId + ':notify_participant' ||
  !invocation.input ||
  typeof invocation.input !== 'object' ||
  Array.isArray(invocation.input)
)
  throw new Error('Unexpected notification invocation.');
const supported = [
  'WAITING_FOR_PUBLICATION',
  'ADMIN_REVIEW',
  'NEEDS_INFORMATION',
  'INVITED',
  'CONFIRMED',
  'JUDGING',
  'AWAITING_PRIZE_ACCEPTANCE',
];
if (!supported.includes(invocation.state))
  throw new Error('Notification is not bound to this state.');
return [{ json: invocation }];
`,
    };

    @node({
        id: 'competition-notify-ReadCaseEvents',
        name: 'Read Case Events',
        type: 'n8n-nodes-base.dataTable',
        version: 1.1,
        position: [480, 0],
        alwaysOutputData: true,
    })
    ReadCaseEvents = {
        resource: 'row',
        operation: 'get',
        dataTableId: {
            __rl: true,
            value: 'TjuB58skTvPRCwB3',
            mode: 'id',
        },
        filters: {
            conditions: [
                {
                    keyName: 'caseId',
                    condition: 'eq',
                    keyValue: '={{ $json.caseId }}',
                },
            ],
        },
        returnAll: true,
    };

    @node({
        id: 'competition-notify-ReadMachineDefinitions',
        name: 'Read Machine Definitions',
        type: 'n8n-nodes-base.dataTable',
        version: 1.1,
        position: [720, 0],
        alwaysOutputData: true,
        executeOnce: true,
    })
    ReadMachineDefinitions = {
        resource: 'row',
        operation: 'get',
        dataTableId: {
            __rl: true,
            value: 'Lm8JZL9uCNqj14vE',
            mode: 'id',
        },
        returnAll: true,
    };

    @node({
        id: 'competition-notify-HydrateNotification',
        name: 'Hydrate Recorded Notification',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [960, 0],
    })
    HydrateRecordedNotification = {
        mode: 'runOnceForAllItems',
        jsCode: `const object = (value, path) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(\`\${path} must be an object.\`);
  return value;
};
const string = (value, path) => {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim())
    throw new Error(\`\${path} must be a non-empty string without surrounding whitespace.\`);
  return value;
};
const optionalString = (value, path) => {
  if (value !== undefined && typeof value !== 'string')
    throw new Error(\`\${path} must be a string.\`);
};
/** Validate executable graph structure; preserve additional JSON metadata unchanged. */
function parseMachine(input) {
  const root = object(input, 'Machine');
  const unsupported = (value, path, keys) => {
    for (const key of keys)
      if (Object.hasOwn(value, key))
        throw new Error(\`\${path}.\${key} is unsupported by this runtime.\`);
  };
  unsupported(root, 'Machine', ['invoke', 'actions', 'guards', 'entry', 'exit']);
  string(root.machine, 'machine');
  if (!Number.isSafeInteger(root.version) || root.version < 1)
    throw new Error('version must be a positive integer.');
  const initial = string(root.initial, 'initial');
  const states = object(root.states, 'states');
  if (!Object.keys(states).length) throw new Error('states must contain at least one state.');
  if (!Object.hasOwn(states, initial))
    throw new Error(\`Initial state "\${initial}" does not exist.\`);
  for (const [id, raw] of Object.entries(states)) {
    string(id, 'State name');
    const state = object(raw, \`states.\${id}\`);
    unsupported(state, \`states.\${id}\`, [
      'states',
      'initial',
      'type',
      'entry',
      'exit',
      'invoke',
      'actions',
      'guards',
      'always',
      'after',
      'onDone',
    ]);
    if (state.final !== undefined && typeof state.final !== 'boolean')
      throw new Error(\`states.\${id}.final must be a boolean.\`);
    optionalString(state.description, \`states.\${id}.description\`);
    if (state.tasks !== undefined) {
      if (!Array.isArray(state.tasks))
        throw new Error(\`states.\${id}.tasks must be an array of strings.\`);
      if (state.tasks.length > 1)
        throw new Error(\`states.\${id} supports only one task per entered state.\`);
      state.tasks.forEach((task, index) => {
        string(task, \`states.\${id}.tasks[\${index}]\`);
        if (task.includes(':'))
          throw new Error(
            \`states.\${id}.tasks[\${index}] cannot contain ':'; it is reserved as the task invocation delimiter.\`,
          );
      });
    }
    const events = new Set();
    for (const kind of ['on', 'decide']) {
      if (state[kind] === undefined) continue;
      for (const [event, rawTransition] of Object.entries(
        object(state[kind], \`states.\${id}.\${kind}\`),
      )) {
        string(event, \`Event name in states.\${id}.\${kind}\`);
        if (events.has(event))
          throw new Error(\`states.\${id} declares event "\${event}" in both on and decide.\`);
        events.add(event);
        const path = \`states.\${id}.\${kind}.\${event}\`;
        const transition = object(rawTransition, path);
        unsupported(transition, path, [
          'guard',
          'guards',
          'cond',
          'actions',
          'action',
          'internal',
          'reenter',
        ]);
        const target = string(transition.target, \`\${path}.target\`);
        if (!Object.hasOwn(states, target))
          throw new Error(\`\${path} targets unknown state "\${target}".\`);
        if (transition.taskResult !== undefined && transition.taskResult !== true)
          throw new Error(\`\${path}.taskResult must be true when declared.\`);
        if (transition.taskResult && state.tasks?.length !== 1)
          throw new Error(\`\${path}.taskResult requires exactly one task on the source state.\`);
        optionalString(transition.description, \`\${path}.description\`);
        optionalString(transition.outcome, \`\${path}.outcome\`);
      }
    }
    if (state.final && (events.size || state.tasks?.length))
      throw new Error(\`Final state "\${id}" cannot have outgoing transitions or tasks.\`);
  }
  if (states[initial].tasks?.length)
    throw new Error('Initial state must be passive; tasks run only after an accepted transition.');
  return input;
}
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return \`[\${value.map(canonicalJson).join(',')}]\`;
  return \`{\${Object.keys(value)
    .sort()
    .map((key) => \`\${JSON.stringify(key)}:\${canonicalJson(value[key])}\`)
    .join(',')}}\`;
}
/** Validate definition identities independently of editor/default metadata. */
function parseMachineDefinitions(rows) {
  if (!Array.isArray(rows)) throw new Error('Machine catalog rows must be an array.');
  const identities = new Set();
  return rows.map((row) => {
    object(row, 'Machine catalog row');
    if (typeof row.definition !== 'string')
      throw new Error('Stored machine definition must be JSON text.');
    let definition;
    try {
      definition = parseMachine(JSON.parse(row.definition));
    } catch (error) {
      throw new Error(\`Invalid stored machine definition: \${error.message}\`);
    }
    if (row.machine !== definition.machine || row.version !== definition.version)
      throw new Error('Machine catalog identity does not match its definition.');
    const identity = JSON.stringify([row.machine, row.version]);
    if (identities.has(identity))
      throw new Error('Duplicate machine/version catalog rows require correction.');
    identities.add(identity);
    return definition;
  });
}
/** Editor/catalog defaults do not select runtime case identity. */
function parseMachineCatalog(rows) {
  const definitions = parseMachineDefinitions(rows);
  const machines = rows.map((row, index) => {
    if (typeof row.isDefault !== 'boolean')
      throw new Error('Machine catalog default flag must be a boolean.');
    return {
      machine: row.machine,
      version: row.version,
      definition: definitions[index],
      isDefault: row.isDefault,
    };
  });
  const defaults = machines.filter((machine) => machine.isDefault);
  if (defaults.length !== 1)
    throw new Error('Machine catalog must contain exactly one default definition.');
  return { machines, default: { machine: defaults[0].machine, version: defaults[0].version } };
}

function replayNotification(history, machineDefinition, caseId) {
  const $input = { all: () => history.map((json) => ({ json })) };
  const $ = () => ({
    first: () => ({
      json: { request: { operation: 'inspect', caseId }, definitions: [machineDefinition] },
    }),
  });
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
      invocationId === \`\${trigger.eventId}:\${tasks[0]}\` &&
      event.eventId === \`\${invocationId}:result\`
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
  if (request.taskInvocationId && request.eventId !== \`\${request.taskInvocationId}:result\`)
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
        taskInvocationId: \`\${request.eventId}:\${tasks[0]}\`,
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
}
const invocation = $('Validate Notification Invocation').first().json;
const definitions = parseMachineDefinitions($input.all().map((item) => item.json));
const definition = definitions.find(
  (entry) => entry.machine === invocation.machine && entry.version === invocation.machineVersion,
);
if (!definition) throw new Error('Notification machine version is not in the catalog.');
const rows = $('Read Case Events')
  .all()
  .map((item) => item.json)
  .filter((row) => row.caseId === invocation.caseId);
const matches = rows.filter((row) => row.eventId === invocation.triggerEventId);
if (matches.length !== 1) throw new Error('Notification requires one recorded triggering event.');
const trigger = matches[0];
if (!Number.isSafeInteger(trigger.sequence) || trigger.sequence < 1)
  throw new Error('Invalid triggering event sequence.');
// Notifications describe this historical transition even if the case has since advanced.
const prefix = rows
  .filter((row) => row.sequence <= trigger.sequence)
  .sort((a, b) => a.sequence - b.sequence);
const replay = replayNotification(prefix, definition, invocation.caseId)[0].json.result;
const state = definition.states[invocation.state];
if (
  replay.status !== 'inspected' ||
  replay.currentState !== invocation.state ||
  replay.sequence !== trigger.sequence ||
  replay.correlationId !== invocation.correlationId ||
  trigger.machine !== invocation.machine ||
  trigger.machineVersion !== invocation.machineVersion ||
  !state ||
  state.final ||
  state.tasks?.length !== 1 ||
  state.tasks[0] !== invocation.task
) {
  throw new Error('Notification invocation does not match the recorded state entry.');
}
const history = prefix.map((row) => ({ ...row, payload: JSON.parse(row.payload) }));
const recorded = history.at(-1).payload;
const invitation = history.findLast((row) => row.type === 'FINALIST_SELECTED')?.payload;
// Input supplied by a caller never supplies message facts; use accepted events only.
return [
  {
    json: {
      taskInvocationId: invocation.taskInvocationId,
      caseId: invocation.caseId,
      triggerEventId: trigger.eventId,
      correlationId: invocation.correlationId,
      machine: invocation.machine,
      machineVersion: invocation.machineVersion,
      state: invocation.state,
      sequence: trigger.sequence,
      channel: 'in_app',
      question: recorded.question,
      invitationDetails:
        invocation.state === 'INVITED' ? recorded.invitationDetails : invitation?.invitationDetails,
      acceptanceDeadline: recorded.acceptanceDeadline,
    },
  },
];
`,
    };

    @node({
        id: 'competition-notify-RouteState',
        name: 'Route Notification State',
        type: 'n8n-nodes-base.switch',
        version: 3.4,
        position: [1200, 0],
    })
    RouteNotificationState = {
        mode: 'expression',
        numberOutputs: 4,
        output: '={{ ["WAITING_FOR_PUBLICATION", "ADMIN_REVIEW", "JUDGING"].includes($json.state) ? 0 : $json.state === "NEEDS_INFORMATION" ? 1 : ["INVITED", "CONFIRMED"].includes($json.state) ? 2 : $json.state === "AWAITING_PRIZE_ACCEPTANCE" ? 3 : -1 }}',
    };

    @node({
        id: 'competition-notify-ProgressMessage',
        name: 'Progress Update Message',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1480, -300],
    })
    ProgressUpdateMessage = {
        mode: 'runOnceForAllItems',
        jsCode: `const x = $input.first().json;
const templates = {
  WAITING_FOR_PUBLICATION: [
    'Waiting for your published workflow',
    'Your submission is recorded. When your workflow is published, provide its workflow ID in your entry.',
  ],
  ADMIN_REVIEW: [
    'Your entry is ready for review',
    'The organizer can now review your published workflow and submission evidence.',
  ],
  JUDGING: [
    'Check-in recorded',
    'Your check-in is recorded. The human jury will determine the competition result.',
  ],
};
const template = templates[x.state];
if (!template) throw new Error('Unknown progress state');
return [{ json: { ...x, subject: template[0], message: template[1] } }];
`,
    };

    @node({
        id: 'competition-notify-QuestionMessage',
        name: 'Information Request Message',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1480, -100],
    })
    InformationRequestMessage = {
        mode: 'runOnceForAllItems',
        jsCode: `const x = $input.first().json;
if (typeof x.question !== 'string' || !x.question.trim())
  throw new Error('Recorded organizer question is required');
return [
  { json: { ...x, subject: 'The organizer needs more information', message: x.question.trim() } },
];
`,
    };

    @node({
        id: 'competition-notify-InvitationMessage',
        name: 'Invitation Message',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1480, 100],
    })
    InvitationMessage = {
        mode: 'runOnceForAllItems',
        jsCode: `const x = $input.first().json;
if (typeof x.invitationDetails !== 'string' || !x.invitationDetails.trim())
  throw new Error('Recorded invitation details are required');
return [
  {
    json: {
      ...x,
      subject: x.state === 'INVITED' ? 'You are invited as a finalist' : 'Participation confirmed',
      message:
        (x.state === 'INVITED'
          ? 'The human jury selected your entry. Accept or decline this invitation in your entry. '
          : 'Your participation is confirmed. ') + x.invitationDetails.trim(),
    },
  },
];
`,
    };

    @node({
        id: 'competition-notify-PrizeMessage',
        name: 'Prize Acceptance Message',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1480, 300],
    })
    PrizeAcceptanceMessage = {
        mode: 'runOnceForAllItems',
        jsCode: `const x = $input.first().json;
const deadline =
  typeof x.acceptanceDeadline === 'string' && x.acceptanceDeadline.trim()
    ? ' Recorded acceptance deadline: ' + x.acceptanceDeadline.trim() + '.'
    : '';
return [
  {
    json: {
      ...x,
      subject: 'Please accept your prize',
      message:
        'The human jury selected your entry as the winner. Accept or decline the prize in your entry. Acceptance does not confirm prize delivery.' +
        deadline,
    },
  },
];
`,
    };

    @node({
        id: 'competition-notify-ComposeRecord',
        name: 'Compose Notification Record',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1800, 0],
    })
    ComposeNotificationRecord = {
        mode: 'runOnceForAllItems',
        jsCode: `const x = $input.first().json;
const fields = [
  'taskInvocationId',
  'caseId',
  'triggerEventId',
  'correlationId',
  'machine',
  'machineVersion',
  'state',
  'sequence',
  'subject',
  'message',
  'channel',
];
if (
  typeof x.subject !== 'string' ||
  !x.subject.trim() ||
  typeof x.message !== 'string' ||
  !x.message.trim()
)
  throw new Error('Notification subject and message are required');
return [{ json: Object.fromEntries(fields.map((field) => [field, x[field]])) }];
`,
    };

    @node({
        id: 'competition-notify-StoreNotification',
        name: 'Upsert In-App Notification',
        type: 'n8n-nodes-base.dataTable',
        version: 1.1,
        position: [2040, 0],
    })
    UpsertInAppNotification = {
        resource: 'row',
        operation: 'upsert',
        dataTableId: {
            __rl: true,
            value: 'GgWLi8jtrmWP9gpi',
            mode: 'id',
        },
        matchType: 'allConditions',
        filters: {
            conditions: [
                {
                    keyName: 'taskInvocationId',
                    condition: 'eq',
                    keyValue: '={{ $json.taskInvocationId }}',
                },
            ],
        },
        columns: {
            mappingMode: 'defineBelow',
            value: {
                taskInvocationId: '={{ $json.taskInvocationId }}',
                caseId: '={{ $json.caseId }}',
                triggerEventId: '={{ $json.triggerEventId }}',
                correlationId: '={{ $json.correlationId }}',
                machine: '={{ $json.machine }}',
                machineVersion: '={{ $json.machineVersion }}',
                state: '={{ $json.state }}',
                sequence: '={{ $json.sequence }}',
                subject: '={{ $json.subject }}',
                message: '={{ $json.message }}',
                channel: '={{ $json.channel }}',
            },
            matchingColumns: [],
            schema: [
                {
                    id: 'taskInvocationId',
                    displayName: 'taskInvocationId',
                    required: false,
                    defaultMatch: false,
                    display: true,
                    type: 'string',
                    readOnly: false,
                    removed: false,
                },
                {
                    id: 'caseId',
                    displayName: 'caseId',
                    required: false,
                    defaultMatch: false,
                    display: true,
                    type: 'string',
                    readOnly: false,
                    removed: false,
                },
                {
                    id: 'triggerEventId',
                    displayName: 'triggerEventId',
                    required: false,
                    defaultMatch: false,
                    display: true,
                    type: 'string',
                    readOnly: false,
                    removed: false,
                },
                {
                    id: 'correlationId',
                    displayName: 'correlationId',
                    required: false,
                    defaultMatch: false,
                    display: true,
                    type: 'string',
                    readOnly: false,
                    removed: false,
                },
                {
                    id: 'machine',
                    displayName: 'machine',
                    required: false,
                    defaultMatch: false,
                    display: true,
                    type: 'string',
                    readOnly: false,
                    removed: false,
                },
                {
                    id: 'machineVersion',
                    displayName: 'machineVersion',
                    required: false,
                    defaultMatch: false,
                    display: true,
                    type: 'number',
                    readOnly: false,
                    removed: false,
                },
                {
                    id: 'state',
                    displayName: 'state',
                    required: false,
                    defaultMatch: false,
                    display: true,
                    type: 'string',
                    readOnly: false,
                    removed: false,
                },
                {
                    id: 'sequence',
                    displayName: 'sequence',
                    required: false,
                    defaultMatch: false,
                    display: true,
                    type: 'number',
                    readOnly: false,
                    removed: false,
                },
                {
                    id: 'subject',
                    displayName: 'subject',
                    required: false,
                    defaultMatch: false,
                    display: true,
                    type: 'string',
                    readOnly: false,
                    removed: false,
                },
                {
                    id: 'message',
                    displayName: 'message',
                    required: false,
                    defaultMatch: false,
                    display: true,
                    type: 'string',
                    readOnly: false,
                    removed: false,
                },
                {
                    id: 'channel',
                    displayName: 'channel',
                    required: false,
                    defaultMatch: false,
                    display: true,
                    type: 'string',
                    readOnly: false,
                    removed: false,
                },
            ],
            attemptToConvertTypes: false,
            convertFieldsToString: false,
        },
        options: {
            dryRun: false,
        },
    };

    @node({
        id: 'competition-notify-ReturnStored',
        name: 'Return Stored Notification',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [2280, 0],
    })
    ReturnStoredNotification = {
        mode: 'runOnceForAllItems',
        jsCode: `const expected = $('Compose Notification Record').first().json;
const rows = $input.all().map((item) => item.json);
if (rows.length !== 1) throw new Error('Notification upsert must return exactly one stored row.');
const stored = rows[0];
if (
  !Number.isSafeInteger(stored.id) ||
  stored.id < 1 ||
  Object.keys(expected).some((key) => stored[key] !== expected[key])
) {
  throw new Error('Notification upsert response does not match the intended in-app message.');
}
return [
  {
    json: {
      status: 'stored',
      persisted: true,
      channel: 'in_app',
      taskInvocationId: stored.taskInvocationId,
      caseId: stored.caseId,
      notification: stored,
      events: [],
      callbackDispatched: false,
    },
  },
];
`,
    };

    @node({
        id: 'competition-notify-Scope',
        name: 'In-App Notification Boundary',
        type: 'n8n-nodes-base.stickyNote',
        version: 1,
        position: [240, -540],
    })
    InAppNotificationBoundary = {
        content: `## Recorded transition → participant inbox
The core starts this task with its standard invocation. Replay accepted events through the trigger using the pinned definition. Message facts come from that history, never caller input.
Native Data Table upsert stores one in-app message per taskInvocationId. A retry replaces the same row. The result confirms the actual saved row. No email, fabricated PIN, or domain-event callback.
Messages may arrive after the case advances; sequence identifies the historical transition. Final states have no notification task.`,
        width: 1050,
        height: 250,
    };

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.ReceiveTask.out(0).to(this.ValidateNotificationInvocation.in(0));
        this.ValidateNotificationInvocation.out(0).to(this.ReadCaseEvents.in(0));
        this.ReadCaseEvents.out(0).to(this.ReadMachineDefinitions.in(0));
        this.ReadMachineDefinitions.out(0).to(this.HydrateRecordedNotification.in(0));
        this.HydrateRecordedNotification.out(0).to(this.RouteNotificationState.in(0));
        this.ProgressUpdateMessage.out(0).to(this.ComposeNotificationRecord.in(0));
        this.InformationRequestMessage.out(0).to(this.ComposeNotificationRecord.in(0));
        this.InvitationMessage.out(0).to(this.ComposeNotificationRecord.in(0));
        this.PrizeAcceptanceMessage.out(0).to(this.ComposeNotificationRecord.in(0));
        this.ComposeNotificationRecord.out(0).to(this.UpsertInAppNotification.in(0));
        this.UpsertInAppNotification.out(0).to(this.ReturnStoredNotification.in(0));
        this.RouteNotificationState.out(0).to(this.ProgressUpdateMessage.in(0));
        this.RouteNotificationState.out(1).to(this.InformationRequestMessage.in(0));
        this.RouteNotificationState.out(2).to(this.InvitationMessage.in(0));
        this.RouteNotificationState.out(3).to(this.PrizeAcceptanceMessage.in(0));
    }
}
