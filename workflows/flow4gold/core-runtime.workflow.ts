import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : Flow4Gold - Core Runtime
// Nodes   : 19  |  Connections: 17
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// ReceiveEvent                       executeWorkflowTrigger
// PrepareEvent                       code
// ReadMachineDefinitions             dataTable                  [alwaysOutput] [executeOnce]
// LoadMachineDefinitions             code
// FindEvent                          dataTable                  [alwaysOutput]
// PlanTransition                     code
// AppendEvent                        if
// AppendEvent1                       dataTable
// HasTask                            if
// AfterAppend                        code
// FindTaskBinding                    dataTable                  [alwaysOutput]
// PrepareTaskDispatch                code
// BindingAvailable                   if
// RunTask                            executeWorkflow
// DispatchedResult                   code
// DispatchUnavailable                code
// AppliedResult                      code
// ExistingResult                     code
// EventStreamBreakpoint              stickyNote
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// ReceiveEvent
//    → PrepareEvent
//      → ReadMachineDefinitions
//        → LoadMachineDefinitions
//          → FindEvent
//            → PlanTransition
//              → AppendEvent
//                → AppendEvent1
//                  → AfterAppend
//                    → HasTask
//                      → FindTaskBinding
//                        → PrepareTaskDispatch
//                          → BindingAvailable
//                            → RunTask
//                              → DispatchedResult
//                           .out(1) → DispatchUnavailable
//                     .out(1) → AppliedResult
//               .out(1) → ExistingResult
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'frF2jemAeCrcFPDe',
    name: 'Flow4Gold - Core Runtime',
    active: true,
    isArchived: false,
    settings: { executionOrder: 'v1', binaryMode: 'separate' },
})
export class Flow4goldCoreRuntimeWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: 'e01d01ef-5f08-42d5-a8fb-5362c7986b62',
        name: 'Receive Event',
        type: 'n8n-nodes-base.executeWorkflowTrigger',
        version: 1.2,
        position: [0, 0],
    })
    ReceiveEvent = {
        inputSource: 'passthrough',
    };

    @node({
        id: 'flow4gold-PrepareEvent',
        name: 'Prepare Event',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [240, 0],
    })
    PrepareEvent = {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `// Validate the request before reading the trusted machine catalog.
const items = $input.all();
if (items.length !== 1) throw new Error('Submit exactly one request per execution.');
const input = items[0].json;
if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Input must be an object.');
const inspect = input.operation === 'inspect';
const allowed = inspect ? ['caseId', 'operation'] : ['caseId', 'eventId', 'type', 'payload', 'causationId', 'correlationId', 'taskInvocationId'];
if (Object.keys(input).some(key => !allowed.includes(key))) throw new Error('Unknown input field; state is reconstructed from events.');
for (const key of inspect ? ['caseId'] : ['caseId', 'eventId', 'type']) {
  if (typeof input[key] !== 'string' || !input[key].trim() || input[key] !== input[key].trim()) throw new Error(\`\${key} must be a nonempty string without surrounding whitespace.\`);
}
if (inspect) return [{ json: { request: { caseId: input.caseId, operation: 'inspect' } } }];
for (const key of ['causationId', 'correlationId', 'taskInvocationId']) {
  if (input[key] !== undefined && (typeof input[key] !== 'string' || input[key] !== input[key].trim() || (key !== 'causationId' && !input[key]))) throw new Error(\`\${key} must be a string without surrounding whitespace; correlationId/taskInvocationId cannot be empty.\`);
}
const payload = input.payload === undefined ? {} : input.payload;
if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('payload must be a JSON object.');
return [{ json: { request: { caseId: input.caseId, eventId: input.eventId, type: input.type, payload, causationId: input.causationId ?? '', taskInvocationId: input.taskInvocationId ?? '', ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }) } } }];
`,
    };

    @node({
        id: 'flow4gold-ReadMachineDefinitions',
        name: 'Read Machine Definitions',
        type: 'n8n-nodes-base.dataTable',
        version: 1.1,
        position: [350, -180],
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
        id: 'flow4gold-LoadMachineDefinitions',
        name: 'Load Machine Definitions',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [480, -180],
    })
    LoadMachineDefinitions = {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `const object = (value, path) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(\`\${path} must be an object.\`);
  return value;
};
const string = (value, path) => {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) throw new Error(\`\${path} must be a non-empty string without surrounding whitespace.\`);
  return value;
};
const optionalString = (value, path) => {
  if (value !== undefined && typeof value !== 'string') throw new Error(\`\${path} must be a string.\`);
};
/** Validate executable graph structure; preserve additional JSON metadata unchanged. */
function parseMachine(input) {
  const root = object(input, 'Machine');
  const unsupported = (value, path, keys) => { for (const key of keys) if (Object.hasOwn(value, key)) throw new Error(\`\${path}.\${key} is unsupported by this runtime.\`); };
  unsupported(root, 'Machine', ['invoke', 'actions', 'guards', 'entry', 'exit']);
  string(root.machine, 'machine');
  if (!Number.isSafeInteger(root.version) || root.version < 1) throw new Error('version must be a positive integer.');
  const initial = string(root.initial, 'initial');
  const states = object(root.states, 'states');
  if (!Object.keys(states).length) throw new Error('states must contain at least one state.');
  if (!Object.hasOwn(states, initial)) throw new Error(\`Initial state "\${initial}" does not exist.\`);
  for (const [id, raw] of Object.entries(states)) {
    string(id, 'State name');
    const state = object(raw, \`states.\${id}\`);
    unsupported(state, \`states.\${id}\`, ['states', 'initial', 'type', 'entry', 'exit', 'invoke', 'actions', 'guards', 'always', 'after', 'onDone']);
    if (state.final !== undefined && typeof state.final !== 'boolean') throw new Error(\`states.\${id}.final must be a boolean.\`);
    optionalString(state.description, \`states.\${id}.description\`);
    if (state.tasks !== undefined) {
      if (!Array.isArray(state.tasks)) throw new Error(\`states.\${id}.tasks must be an array of strings.\`);
      if (state.tasks.length > 1) throw new Error(\`states.\${id} supports only one task per entered state.\`);
      state.tasks.forEach((task, index) => string(task, \`states.\${id}.tasks[\${index}]\`));
    }
    const events = new Set();
    for (const kind of ['on', 'decide']) {
      if (state[kind] === undefined) continue;
      for (const [event, rawTransition] of Object.entries(object(state[kind], \`states.\${id}.\${kind}\`))) {
        string(event, \`Event name in states.\${id}.\${kind}\`);
        if (events.has(event)) throw new Error(\`states.\${id} declares event "\${event}" in both on and decide.\`);
        events.add(event);
        const path = \`states.\${id}.\${kind}.\${event}\`;
        const transition = object(rawTransition, path);
        unsupported(transition, path, ['guard', 'guards', 'cond', 'actions', 'action', 'internal', 'reenter']);
        const target = string(transition.target, \`\${path}.target\`);
        if (!Object.hasOwn(states, target)) throw new Error(\`\${path} targets unknown state "\${target}".\`);
        optionalString(transition.description, \`\${path}.description\`);
        optionalString(transition.outcome, \`\${path}.outcome\`);
      }
    }
    if (state.final && (events.size || state.tasks?.length)) throw new Error(\`Final state "\${id}" cannot have outgoing transitions or tasks.\`);
  }
  return input;
}
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return \`[\${value.map(canonicalJson).join(',')}]\`;
  return \`{\${Object.keys(value).sort().map(key => \`\${JSON.stringify(key)}:\${canonicalJson(value[key])}\`).join(',')}}\`;
}
/** Stored catalog has one default and immutable, unique machine/version identities. */
function parseMachineCatalog(rows) {
  if (!Array.isArray(rows)) throw new Error('Machine catalog rows must be an array.');
  const identities = new Set();
  const machines = rows.map(row => {
    object(row, 'Machine catalog row');
    if (typeof row.definition !== 'string') throw new Error('Stored machine definition must be JSON text.');
    let definition;
    try { definition = parseMachine(JSON.parse(row.definition)); }
    catch (error) { throw new Error(\`Invalid stored machine definition: \${error.message}\`); }
    if (row.machine !== definition.machine || row.version !== definition.version || typeof row.isDefault !== 'boolean') throw new Error('Machine catalog identity or default flag does not match its definition.');
    const identity = JSON.stringify([row.machine, row.version]);
    if (identities.has(identity)) throw new Error('Duplicate machine/version catalog rows require correction.');
    identities.add(identity);
    return {machine:row.machine, version:row.version, definition, isDefault:row.isDefault};
  });
  const defaults = machines.filter(machine => machine.isDefault);
  if (defaults.length !== 1) throw new Error('Machine catalog must contain exactly one default definition.');
  return {machines, default:{machine:defaults[0].machine,version:defaults[0].version}};
}

// Shared validator is bundled as code; definitions come exclusively from the Data Table.
const catalog = parseMachineCatalog($input.all().map(item => item.json));
const definitions = catalog.machines.map(item => item.definition);
const definition = catalog.machines.find(item => item.isDefault).definition;
return [{ json: { ...$('Prepare Event').first().json, definition, definitions } }];
`,
    };

    @node({
        id: 'flow4gold-FindEvent',
        name: 'Find Event',
        type: 'n8n-nodes-base.dataTable',
        version: 1.1,
        position: [480, 0],
        alwaysOutputData: true,
    })
    FindEvent = {
        resource: 'row',
        operation: 'get',
        dataTableId: {
            __rl: true,
            value: 'TjuB58skTvPRCwB3',
            mode: 'id',
        },
        matchType: 'anyCondition',
        filters: {
            conditions: [
                {
                    keyName: 'caseId',
                    condition: 'eq',
                    keyValue: "={{ $('Prepare Event').first().json.request.caseId }}",
                },
                {
                    keyName: 'eventId',
                    condition: 'eq',
                    keyValue: "={{ $('Prepare Event').first().json.request.eventId ?? '' }}",
                },
                {
                    keyName: 'eventId',
                    condition: 'eq',
                    keyValue: "={{ $('Prepare Event').first().json.request.causationId ?? '' }}",
                },
            ],
        },
        returnAll: true,
    };

    @node({
        id: 'flow4gold-PlanTransition',
        name: 'Plan Transition',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [720, 0],
    })
    PlanTransition = {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `// Pure replay and planning. Only the downstream Append Event node writes.
const { request, definition: defaultDefinition, definitions } = $('Load Machine Definitions').first().json;
// Empty query placeholders must not include unrelated malformed rows.
const rows = $input.all().map(item => item.json).filter(row => row.caseId === request.caseId
  || (request.eventId && row.eventId === request.eventId)
  || (request.causationId && row.eventId === request.causationId));
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const canonical = value => JSON.stringify(value === null || typeof value !== 'object' ? value
  : Array.isArray(value) ? value.map(value => JSON.parse(canonical(value)))
  : Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))])));
const isId = value => typeof value === 'string' && value.length > 0 && value.trim() === value;
const stream = rows.filter(row => row.caseId === request.caseId).sort((a, b) => a.sequence - b.sequence);
const definition = stream.length
  ? definitions.find(item => item.machine === stream[0].machine && item.version === stream[0].machineVersion)
  : defaultDefinition;
if (!definition) return [{ json: { action: 'return', result: { caseId: request.caseId, eventId: request.eventId ?? null, status: 'rejected', reason: 'Unsupported persisted machine version.' } } }];
let currentState = definition.initial, outcome = null, sequence = 0;
let correlationId = request.correlationId ?? stream[0]?.correlationId ?? request.caseId;
const output = (result, extra = {}) => [{ json: { action: 'return', result: {
  caseId: request.caseId, eventId: request.eventId ?? null, currentState: stream.length ? currentState : null,
  outcome, sequence, correlationId, causationId: request.causationId ?? '', ...result,
}, ...extra } }];
const reject = reason => output({ status: 'rejected', reason });
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
  if (!isId(event.eventId) || !isId(event.caseId) || !isId(event.type) || !isId(event.correlationId)
    || typeof event.causationId !== 'string' || event.causationId.trim() !== event.causationId
    || (event.taskInvocationId != null && (typeof event.taskInvocationId !== 'string' || event.taskInvocationId.trim() !== event.taskInvocationId))
    || event.causationId === event.eventId || !Number.isSafeInteger(event.sequence) || event.sequence < 1
    || !isId(event.machine) || !Number.isSafeInteger(event.machineVersion) || event.machineVersion < 1
    || (event.caseId === request.caseId && (event.machine !== definition.machine || event.machineVersion !== definition.version))) return reject('Invalid persisted event identity, sequence, or machine version.');
  if (ids.has(event.eventId)) return reject('Multiple rows share an eventId; manual reconciliation required.');
  ids.add(event.eventId);
  try {
    const payload = JSON.parse(event.payload);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return reject('Invalid persisted event payload.');
  } catch { return reject('Invalid persisted event payload.'); }
}
const seen = new Set();
let previousEvent;
const validInvocation = (event, state, trigger) => {
  const invocationId = event.taskInvocationId ?? '';
  const approval = definition.version >= 2 && state === 'AWAITING_APPROVAL'
    && ['APPROVED', 'REJECTED'].includes(event.type);
  if (approval) {
    const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
    if (!invocationId || !trigger || trigger.type !== 'REFUND_RECOMMENDED'
      || !payload || Object.keys(payload).length !== 1 || payload.proposalEventId !== trigger.eventId) return false;
  }
  const review = definition.version >= 3 && state === 'HUMAN_REVIEW';
  if (review) {
    const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
    const approved = event.type === 'REVIEW_APPROVED';
    if (!['REVIEW_APPROVED', 'REJECTED', 'NEED_MORE_INFO'].includes(event.type)
      || !invocationId || !trigger || trigger.type !== 'ESCALATE'
      || !payload || payload.reviewEventId !== trigger.eventId
      || !isId(payload.message) || payload.message.length > 4000
      || Object.keys(payload).length !== (approved ? 3 : 2)) return false;
    if (approved) {
      const proposal = payload.proposal;
      const keys = ['amount', 'currency', 'paymentReference', 'orderReference', 'reason', 'simulation'];
      if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)
        || Object.keys(proposal).length !== keys.length || keys.some(key => !has(proposal, key))
        || !Number.isFinite(proposal.amount) || proposal.amount <= 0
        || !/^[A-Z]{3}$/.test(proposal.currency) || !isId(proposal.paymentReference)
        || !isId(proposal.orderReference) || proposal.reason !== payload.message
        || proposal.simulation !== true) return false;
    }
  }
  if (!invocationId) return true;
  const tasks = definition.states[state].tasks || [];
  return tasks.length === 1 && trigger && event.causationId === trigger.eventId
    && invocationId === \`\${trigger.eventId}:\${tasks[0]}\` && event.eventId === \`\${invocationId}:result\`;
};
for (const event of stream) {
  if (event.sequence !== sequence + 1) return reject('Event stream sequence must be contiguous from 1.');
  if (event.correlationId !== stream[0].correlationId) return reject('Event stream correlationId changed.');
  const localCause = stream.find(candidate => candidate.eventId === event.causationId);
  if (localCause && !seen.has(localCause.eventId)) return reject('Event stream has a forward causation reference.');
  if (sequence === 0 && event.type !== 'RECEIVED') return reject('Event stream must begin with RECEIVED.');
  if (!validInvocation(event, currentState, previousEvent)) return reject('Event stream contains an invalid task invocation.');
  const edge = transition(currentState, event.type);
  if (!edge) return reject('Event stream contains an illegal transition.');
  currentState = edge.target;
  outcome = edge.outcome ?? outcome;
  sequence = event.sequence;
  seen.add(event.eventId);
  previousEvent = event;
}
if (request.operation === 'inspect') return output({ status: stream.length ? 'inspected' : 'not_found' });
if (request.causationId === request.eventId) return reject('An event cannot cause itself.');
const cause = request.causationId ? rows.find(event => event.eventId === request.causationId) : undefined;
if (request.causationId && !cause) return reject('causationId must reference an existing event.');
correlationId = request.correlationId ?? stream[0]?.correlationId ?? cause?.correlationId ?? request.caseId;
if ((stream.length && correlationId !== stream[0].correlationId) || (cause && correlationId !== cause.correlationId)) return reject('correlationId must agree with the case stream and cause.');
if (request.taskInvocationId && request.eventId !== \`\${request.taskInvocationId}:result\`) return reject('Task result eventId must match taskInvocationId.');
const duplicate = rows.find(event => event.eventId === request.eventId);
if (duplicate) {
  if (duplicate.caseId !== request.caseId || duplicate.type !== request.type
    || canonical(JSON.parse(duplicate.payload)) !== canonical(request.payload)
    || (duplicate.taskInvocationId ?? '') !== (request.taskInvocationId ?? '')
    || duplicate.causationId !== request.causationId || duplicate.correlationId !== correlationId) return reject('eventId already belongs to a different event.');
  return output({ status: 'duplicate' });
}
if (!validInvocation(request, currentState, stream.at(-1))) return reject('Task result does not match the current task invocation.');
if (!stream.length && request.type !== 'RECEIVED') return reject('A new case requires RECEIVED.');
const edge = transition(currentState, request.type);
if (!edge) return reject('Event is not enabled in the current state.');
const tasks = definition.states[edge.target].tasks || [];
if (tasks.length > 1) return reject('Only one task per entered state is supported.');
const taskInvocation = tasks.length ? {
  caseId: request.caseId, task: tasks[0], taskInvocationId: \`\${request.eventId}:\${tasks[0]}\`,
  triggerEventId: request.eventId, correlationId, state: edge.target, machine: definition.machine, machineVersion: definition.version, input: request.payload,
} : null;
const from = currentState;
const eventRecord = { eventId: request.eventId, caseId: request.caseId, sequence: sequence + 1, type: request.type,
  taskInvocationId: request.taskInvocationId ?? '', payload: canonical(request.payload), causationId: request.causationId, correlationId, machine: definition.machine, machineVersion: definition.version };
return output({ status: 'applied', currentState: edge.target, sequence: eventRecord.sequence, outcome: edge.outcome ?? outcome,
  transition: { from, target: edge.target, event: request.type, kind: edge.kind } }, { action: 'apply', eventRecord, taskInvocation });
`,
    };

    @node({
        id: 'flow4gold-ApplyTransition',
        name: 'Append Event?',
        type: 'n8n-nodes-base.if',
        version: 2.3,
        position: [960, 0],
    })
    AppendEvent = {
        conditions: {
            options: {
                caseSensitive: true,
                leftValue: '',
                typeValidation: 'strict',
                version: 3,
            },
            conditions: [
                {
                    id: 'ApplyTransition',
                    leftValue: '={{ $json.action }}',
                    rightValue: 'apply',
                    operator: {
                        type: 'string',
                        operation: 'equals',
                    },
                },
            ],
            combinator: 'and',
        },
        options: {},
    };

    @node({
        id: 'flow4gold-AppendEvent',
        name: 'Append Event',
        type: 'n8n-nodes-base.dataTable',
        version: 1.1,
        position: [1200, -100],
    })
    AppendEvent1 = {
        resource: 'row',
        operation: 'insert',
        dataTableId: {
            __rl: true,
            value: 'TjuB58skTvPRCwB3',
            mode: 'id',
        },
        columns: {
            mappingMode: 'defineBelow',
            value: {
                eventId: "={{ $('Plan Transition').first().json.eventRecord.eventId }}",
                caseId: "={{ $('Plan Transition').first().json.eventRecord.caseId }}",
                sequence: "={{ $('Plan Transition').first().json.eventRecord.sequence }}",
                type: "={{ $('Plan Transition').first().json.eventRecord.type }}",
                payload: "={{ $('Plan Transition').first().json.eventRecord.payload }}",
                causationId: "={{ $('Plan Transition').first().json.eventRecord.causationId }}",
                correlationId: "={{ $('Plan Transition').first().json.eventRecord.correlationId }}",
                machine: "={{ $('Plan Transition').first().json.eventRecord.machine }}",
                machineVersion: "={{ $('Plan Transition').first().json.eventRecord.machineVersion }}",
                taskInvocationId: "={{ $('Plan Transition').first().json.eventRecord.taskInvocationId }}",
            },
            matchingColumns: [],
            schema: [
                {
                    id: 'eventId',
                    displayName: 'eventId',
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
                    id: 'type',
                    displayName: 'type',
                    required: false,
                    defaultMatch: false,
                    display: true,
                    type: 'string',
                    readOnly: false,
                    removed: false,
                },
                {
                    id: 'payload',
                    displayName: 'payload',
                    required: false,
                    defaultMatch: false,
                    display: true,
                    type: 'string',
                    readOnly: false,
                    removed: false,
                },
                {
                    id: 'causationId',
                    displayName: 'causationId',
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
                    id: 'taskInvocationId',
                    displayName: 'taskInvocationId',
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
        options: {},
    };

    @node({
        id: 'flow4gold-HasTask',
        name: 'Has Task?',
        type: 'n8n-nodes-base.if',
        version: 2.3,
        position: [1680, 0],
    })
    HasTask = {
        conditions: {
            options: {
                caseSensitive: true,
                leftValue: '',
                typeValidation: 'strict',
                version: 3,
            },
            conditions: [
                {
                    id: 'HasTask',
                    leftValue: '={{ $json.hasTask }}',
                    rightValue: true,
                    operator: {
                        type: 'boolean',
                        operation: 'equals',
                    },
                },
            ],
            combinator: 'and',
        },
        options: {},
    };

    @node({
        id: 'flow4gold-AfterAppend',
        name: 'After Append',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1440, -100],
    })
    AfterAppend = {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: "const plan = $('Plan Transition').first().json; return [{ json: { ...plan, hasTask: !!plan.taskInvocation } }];",
    };

    @node({
        id: 'flow4gold-FindTaskBinding',
        name: 'Find Task Binding',
        type: 'n8n-nodes-base.dataTable',
        version: 1.1,
        position: [1920, -100],
        alwaysOutputData: true,
    })
    FindTaskBinding = {
        resource: 'row',
        operation: 'get',
        dataTableId: {
            __rl: true,
            value: 'gYLwq6bG2pQQcF1w',
            mode: 'id',
        },
        filters: {
            conditions: [
                {
                    keyName: 'task',
                    condition: 'eq',
                    keyValue: "={{ $('Plan Transition').first().json.taskInvocation.task }}",
                },
            ],
        },
        returnAll: true,
    };

    @node({
        id: 'flow4gold-PrepareTaskDispatch',
        name: 'Prepare Task Dispatch',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [2160, -100],
    })
    PrepareTaskDispatch = {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: `const invocation = $('Plan Transition').first().json.taskInvocation;
const bindings = $input.all().map(item => item.json).filter(row => row.task === invocation.task);
const available = bindings.length === 1 && typeof bindings[0].workflowId === 'string' && !!bindings[0].workflowId.trim();
return [{ json: { ...invocation, bindingAvailable: available, workflowId: available ? bindings[0].workflowId : '',
  dispatchReason: available ? '' : 'Task requires exactly one binding with a workflowId.' } }];`,
    };

    @node({
        id: 'flow4gold-BindingAvailable',
        name: 'Binding Available?',
        type: 'n8n-nodes-base.if',
        version: 2.3,
        position: [2400, 0],
    })
    BindingAvailable = {
        conditions: {
            options: {
                caseSensitive: true,
                leftValue: '',
                typeValidation: 'strict',
                version: 3,
            },
            conditions: [
                {
                    id: 'BindingAvailable',
                    leftValue: '={{ $json.bindingAvailable }}',
                    rightValue: true,
                    operator: {
                        type: 'boolean',
                        operation: 'equals',
                    },
                },
            ],
            combinator: 'and',
        },
        options: {},
    };

    @node({
        id: 'flow4gold-RunTask',
        name: 'Run Task',
        type: 'n8n-nodes-base.executeWorkflow',
        version: 1.3,
        position: [2640, -100],
    })
    RunTask = {
        source: 'database',
        workflowId: {
            __rl: true,
            value: '={{ $json.workflowId }}',
            mode: 'id',
        },
        mode: 'each',
        options: {
            waitForSubWorkflow: false,
        },
    };

    @node({
        id: 'flow4gold-DispatchedResult',
        name: 'Dispatched Result',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [2880, -100],
    })
    DispatchedResult = {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: "const task = $('Prepare Task Dispatch').first().json; return [{ json: { ...$('Plan Transition').first().json.result, dispatch: { status: 'started', task: task.task, taskInvocationId: task.taskInvocationId } } }];",
    };

    @node({
        id: 'flow4gold-DispatchUnavailable',
        name: 'Dispatch Unavailable',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [2640, 200],
    })
    DispatchUnavailable = {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: "const task = $('Prepare Task Dispatch').first().json; return [{ json: { ...$('Plan Transition').first().json.result, dispatch: { status: 'unavailable', task: task.task, taskInvocationId: task.taskInvocationId, reason: task.dispatchReason } } }];",
    };

    @node({
        id: 'flow4gold-AppliedResult',
        name: 'Applied Result',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1920, 180],
    })
    AppliedResult = {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: "return [{ json: $('Plan Transition').first().json.result }];",
    };

    @node({
        id: 'flow4gold-ExistingResult',
        name: 'Existing Result',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [1200, 160],
    })
    ExistingResult = {
        mode: 'runOnceForAllItems',
        language: 'javaScript',
        jsCode: "return [{ json: $('Plan Transition').first().json.result }];",
    };

    @node({
        id: 'flow4gold-Scope',
        name: 'Event Stream Breakpoint',
        type: 'n8n-nodes-base.stickyNote',
        version: 1,
        position: [240, -360],
    })
    EventStreamBreakpoint = {
        content: `## Event stream is the source of truth
Read → replay → validate → append ONE accepted event. Inspect replays without writing. No case projection. Replay never executes tasks. Newly appended events dispatch one task asynchronously; callback is another event.
Sequential requests only; append/dispatch have a recovery gap: Data Tables do not enforce unique IDs/sequences or protect concurrent appends. Correlation and causation are trace links, not authorization.
Tasks perform bounded AI diagnosis and simulated payment actions. V3 human review binds a proposal, rejection, or customer question to the expected review invocation. V2 approval binds to the recorded proposal and expected task invocation; links are bearer access, not verified Discord identities. Keep recorded machine versions immutable. Machine definitions loaded from the machine_definitions Data Table; runtime logic generated from runtime/.`,
        width: 1040,
        height: 240,
    };

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.ReceiveEvent.out(0).to(this.PrepareEvent.in(0));
        this.PrepareEvent.out(0).to(this.ReadMachineDefinitions.in(0));
        this.ReadMachineDefinitions.out(0).to(this.LoadMachineDefinitions.in(0));
        this.LoadMachineDefinitions.out(0).to(this.FindEvent.in(0));
        this.FindEvent.out(0).to(this.PlanTransition.in(0));
        this.PlanTransition.out(0).to(this.AppendEvent.in(0));
        this.AppendEvent.out(0).to(this.AppendEvent1.in(0));
        this.AppendEvent.out(1).to(this.ExistingResult.in(0));
        this.AppendEvent1.out(0).to(this.AfterAppend.in(0));
        this.AfterAppend.out(0).to(this.HasTask.in(0));
        this.HasTask.out(0).to(this.FindTaskBinding.in(0));
        this.HasTask.out(1).to(this.AppliedResult.in(0));
        this.FindTaskBinding.out(0).to(this.PrepareTaskDispatch.in(0));
        this.PrepareTaskDispatch.out(0).to(this.BindingAvailable.in(0));
        this.BindingAvailable.out(0).to(this.RunTask.in(0));
        this.BindingAvailable.out(1).to(this.DispatchUnavailable.in(0));
        this.RunTask.out(0).to(this.DispatchedResult.in(0));
    }
}
