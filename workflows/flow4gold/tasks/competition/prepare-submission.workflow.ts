import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : Flow4Gold - Competition - Prepare Submission
// Nodes   : 7  |  Connections: 5
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// ReceiveTaskInvocation              executeWorkflowTrigger
// ValidateInvocation                 code
// ReadCaseEvents                     dataTable                  [alwaysOutput]
// ReadPinnedDefinition               dataTable                  [alwaysOutput] [executeOnce]
// BuildPreparationResult             code
// ReturnDomainEvent                  executeWorkflow
// PrepareRecordedSubmission          stickyNote
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// ReceiveTaskInvocation
//    → ValidateInvocation
//      → ReadCaseEvents
//        → ReadPinnedDefinition
//          → BuildPreparationResult
//            → ReturnDomainEvent
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'zky8Y5DQHN5PFTlF',
    name: 'Flow4Gold - Competition - Prepare Submission',
    active: false,
    isArchived: false,
    settings: { executionOrder: 'v1' },
})
export class Flow4goldCompetitionPrepareSubmissionWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: 'prepare-submission-ReceiveInvocation',
        name: 'Receive Task Invocation',
        type: 'n8n-nodes-base.executeWorkflowTrigger',
        version: 1.2,
        position: [0, 0],
    })
    ReceiveTaskInvocation = {
        inputSource: 'passthrough',
    };

    @node({
        id: 'prepare-submission-ValidateInvocation',
        name: 'Validate Invocation',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [240, 0],
    })
    ValidateInvocation = {
        mode: 'runOnceForAllItems',
        jsCode: `const items = $input.all();
if (items.length !== 1) throw new Error('One prepare_submission invocation is required.');
const invocation = items[0].json;
for (const key of ['caseId', 'triggerEventId', 'taskInvocationId', 'correlationId']) {
  if (
    typeof invocation[key] !== 'string' ||
    !invocation[key].trim() ||
    invocation[key] !== invocation[key].trim()
  )
    throw new Error(\`Invalid \${key}.\`);
}
if (
  invocation.machine !== 'flow4gold-submission' ||
  invocation.machineVersion !== 1 ||
  invocation.task !== 'prepare_submission' ||
  invocation.state !== 'REGISTERED' ||
  invocation.taskInvocationId !== \`\${invocation.triggerEventId}:prepare_submission\`
)
  throw new Error('Unexpected submission preparation invocation.');
return [{ json: invocation }];
`,
    };

    @node({
        id: 'prepare-submission-ReadCaseEvents',
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
                    keyValue: "={{ $('Validate Invocation').first().json.caseId }}",
                },
            ],
        },
        returnAll: true,
    };

    @node({
        id: 'prepare-submission-ReadDefinition',
        name: 'Read Pinned Definition',
        type: 'n8n-nodes-base.dataTable',
        version: 1.1,
        position: [720, 0],
        alwaysOutputData: true,
        executeOnce: true,
    })
    ReadPinnedDefinition = {
        resource: 'row',
        operation: 'get',
        dataTableId: {
            __rl: true,
            value: 'Lm8JZL9uCNqj14vE',
            mode: 'id',
        },
        matchType: 'allConditions',
        filters: {
            conditions: [
                {
                    keyName: 'machine',
                    condition: 'eq',
                    keyValue: "={{ $('Validate Invocation').first().json.machine }}",
                },
                {
                    keyName: 'version',
                    condition: 'eq',
                    keyValue: "={{ $('Validate Invocation').first().json.machineVersion }}",
                },
            ],
        },
        returnAll: true,
    };

    @node({
        id: 'prepare-submission-BuildResult',
        name: 'Build Preparation Result',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [960, 0],
    })
    BuildPreparationResult = {
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

const invocation = $('Validate Invocation').first().json;
const definitions = $input.all().map((item) => item.json);
if (
  definitions.length !== 1 ||
  definitions[0].machine !== invocation.machine ||
  definitions[0].version !== invocation.machineVersion
)
  throw new Error('Exactly one pinned machine definition is required.');
const definition = parseMachine(JSON.parse(definitions[0].definition));
if (
  definition.machine !== invocation.machine ||
  definition.version !== invocation.machineVersion ||
  definition.states.REGISTERED?.tasks?.[0] !== 'prepare_submission'
)
  throw new Error('Stored definition does not declare this preparation task.');
const rows = $('Read Case Events')
  .all()
  .map((item) => item.json);
const triggers = rows.filter((row) => row.eventId === invocation.triggerEventId);
if (triggers.length !== 1) throw new Error('Exactly one stored registration event is required.');
const trigger = triggers[0];
if (
  trigger.caseId !== invocation.caseId ||
  trigger.machine !== invocation.machine ||
  trigger.machineVersion !== invocation.machineVersion ||
  trigger.correlationId !== invocation.correlationId ||
  trigger.type !== 'SUBMISSION_RECEIVED' ||
  trigger.sequence !== 1 ||
  rows.some((row) => row.caseId !== invocation.caseId)
)
  throw new Error('Registration identity or stream does not match the invocation.');
if (definition.states[definition.initial]?.on?.[trigger.type]?.target !== 'REGISTERED')
  throw new Error('Registration does not enter the expected state.');
// Stored evidence, not the supplied invocation payload, determines the result.
const payload = JSON.parse(trigger.payload);
const submission = payload?.submission;
const text = (value, field, max = 1000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new Error(\`Invalid recorded \${field}.\`);
  return value.trim();
};
if (!submission || typeof submission !== 'object' || Array.isArray(submission))
  throw new Error('Recorded submission is missing.');
const actorId = text(payload.actorId, 'actorId');
for (const key of ['contestantName', 'email', 'title', 'videoUrl'])
  text(submission[key], key, 2000);
for (const key of ['templateSubmitted', 'ticketConfirmed', 'privacyConsent', 'recordingConsent'])
  if (submission[key] !== true) throw new Error(\`Recorded registration lacks \${key}.\`);
let type = 'PUBLICATION_PENDING';
let resultPayload = { actorId };
if (submission.publishedWorkflow !== undefined) {
  const evidence = submission.publishedWorkflow;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence))
    throw new Error('Invalid recorded published workflow.');
  const id = text(evidence.id, 'workflow.id', 30);
  const url = text(evidence.url, 'workflow.url', 2000);
  if (
    !/^[1-9][0-9]*$/.test(id) ||
    !new RegExp('^https://n8n\\\\.io/workflows/' + id + '(?:[-/?#]|$)').test(url)
  )
    throw new Error('Recorded workflow URL does not match its published ID.');
  const workflow = {
    id,
    url,
    verificationReference: text(evidence.verificationReference, 'workflow.verificationReference'),
  };
  type = 'WORKFLOW_LINKED';
  resultPayload = { workflow, actorId };
}
if (definition.states.REGISTERED.on?.[type]?.taskResult !== true)
  throw new Error('Preparation result is not a declared task-result edge.');
return [
  {
    json: {
      caseId: invocation.caseId,
      eventId: \`\${invocation.taskInvocationId}:result\`,
      taskInvocationId: invocation.taskInvocationId,
      causationId: trigger.eventId,
      correlationId: invocation.correlationId,
      type,
      payload: resultPayload,
    },
  },
];
`,
    };

    @node({
        id: 'prepare-submission-ReturnEvent',
        name: 'Return Domain Event',
        type: 'n8n-nodes-base.executeWorkflow',
        version: 1.3,
        position: [1200, 0],
    })
    ReturnDomainEvent = {
        source: 'database',
        workflowId: {
            __rl: true,
            value: 'frF2jemAeCrcFPDe',
            mode: 'id',
        },
        mode: 'each',
        options: {
            waitForSubWorkflow: false,
        },
    };

    @node({
        id: 'prepare-submission-Overview',
        name: 'Prepare recorded submission',
        type: 'n8n-nodes-base.stickyNote',
        version: 1,
        position: [200, -330],
    })
    PrepareRecordedSubmission = {
        content: `## Prepare a recorded submission
The REGISTERED state starts this task through task_bindings. Read the exact registration event and its pinned machine. Stored published-workflow evidence produces WORKFLOW_LINKED; otherwise PUBLICATION_PENDING.
Return one domain event asynchronously to the same generic core, with stable invocation/result IDs. The task never chooses a jury outcome, sends email or issues a PIN. The core rejects results if the case has moved on.`,
        width: 1240,
        height: 240,
        color: 5,
    };

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.ReceiveTaskInvocation.out(0).to(this.ValidateInvocation.in(0));
        this.ValidateInvocation.out(0).to(this.ReadCaseEvents.in(0));
        this.ReadCaseEvents.out(0).to(this.ReadPinnedDefinition.in(0));
        this.ReadPinnedDefinition.out(0).to(this.BuildPreparationResult.in(0));
        this.BuildPreparationResult.out(0).to(this.ReturnDomainEvent.in(0));
    }
}
