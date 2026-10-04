import { readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { format, resolveConfig } from 'prettier';
import { TypeScriptParser, WorkflowBuilder } from '@n8n-as-code/transformer';

export const workflowPath = 'workflows/flow4gold/core-runtime.workflow.ts';
export async function compiledWorkflow(path = workflowPath) {
  return new WorkflowBuilder().build(await new TypeScriptParser().parseFile(path));
}

export async function buildSource() {
  const formatting = (await resolveConfig('scripts/build-core.mjs')) ?? {};
  // Explicit layout is the source of truth; a build never recaptures accidental canvas edits.
  const { positions } = JSON.parse(await readFile('runtime/core-layout.json', 'utf8'));
  const prepare = await readFile('runtime/prepare-event.js', 'utf8');
  const validator = (await readFile('shared/machine-validation.mjs', 'utf8')).replace(
    /export function /g,
    'function ',
  );
  const loadDefinitions =
    validator + '\n' + (await readFile('runtime/load-machine-definitions.js', 'utf8'));
  const plan = await readFile('runtime/plan-transition.js', 'utf8');
  const nodes = [];
  const routes = [];
  const node = (property, name, type, version, position, parameters, metadata = {}) => {
    if (type !== 'stickyNote' && !positions[name])
      throw new Error(`Missing saved layout for ${name}. Add it to runtime/core-layout.json.`);
    nodes.push({
      property,
      metadata: {
        id: `flow4gold-${property}`,
        name,
        type: `n8n-nodes-base.${type}`,
        version,
        position: type === 'stickyNote' ? position : positions[name],
        ...metadata,
      },
      parameters,
    });
  };
  const link = (from, to, output = 0) =>
    routes.push(`    this.${from}.out(${output}).to(this.${to}.in(0));`);
  const code = (property, name, x, y, jsCode) =>
    node(property, name, 'code', 2, [x, y], {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode,
    });
  const condition = (property, name, x, field, right) =>
    node(property, name, 'if', 2.3, [x, 0], {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 },
        conditions: [
          {
            id: property,
            leftValue: `={{ $json.${field} }}`,
            rightValue: right,
            operator: { type: typeof right, operation: 'equals' },
          },
        ],
        combinator: 'and',
      },
      options: {},
    });
  const eventsId = 'TjuB58skTvPRCwB3';
  const filter = (key, expression) => ({ keyName: key, condition: 'eq', keyValue: expression });
  const table = (property, name, x, y, tableId, operation, parameters, metadata = {}) =>
    node(
      property,
      name,
      'dataTable',
      1.1,
      [x, y],
      {
        resource: 'row',
        operation,
        dataTableId: { __rl: true, value: tableId, mode: 'id' },
        ...parameters,
      },
      metadata,
    );
  const columns = (record, names) => ({
    mappingMode: 'defineBelow',
    value: Object.fromEntries(
      names.map((name) => [name, `={{ $('Plan Transition').first().json.${record}.${name} }}`]),
    ),
    matchingColumns: [],
    schema: names.map((name) => ({
      id: name,
      displayName: name,
      required: false,
      defaultMatch: false,
      display: true,
      type: ['machineVersion', 'sequence'].includes(name) ? 'number' : 'string',
      readOnly: false,
      removed: false,
    })),
    attemptToConvertTypes: false,
    convertFieldsToString: false,
  });
  node(
    'ReceiveEvent',
    'Receive Event',
    'executeWorkflowTrigger',
    1.2,
    [0, 0],
    { inputSource: 'passthrough' },
    { id: 'e01d01ef-5f08-42d5-a8fb-5362c7986b62' },
  );
  code('PrepareEvent', 'Prepare Event', 240, 0, prepare);
  table(
    'ReadMachineDefinitions',
    'Read Machine Definitions',
    350,
    -180,
    'Lm8JZL9uCNqj14vE',
    'get',
    { returnAll: true },
    { alwaysOutputData: true, executeOnce: true },
  );
  code('LoadMachineDefinitions', 'Load Machine Definitions', 480, -180, loadDefinitions);
  table(
    'FindEvent',
    'Find Event',
    480,
    0,
    eventsId,
    'get',
    {
      matchType: 'anyCondition',
      filters: {
        conditions: [
          filter('caseId', "={{ $('Prepare Event').first().json.request.caseId }}"),
          filter('eventId', "={{ $('Prepare Event').first().json.request.eventId ?? '' }}"),
          filter('eventId', "={{ $('Prepare Event').first().json.request.causationId ?? '' }}"),
        ],
      },
      returnAll: true,
    },
    { alwaysOutputData: true },
  );
  code('PlanTransition', 'Plan Transition', 720, 0, plan);
  condition('ApplyTransition', 'Append Event?', 960, 'action', 'apply');
  table('AppendEvent', 'Append Event', 1200, -100, eventsId, 'insert', {
    columns: columns('eventRecord', [
      'eventId',
      'caseId',
      'sequence',
      'type',
      'payload',
      'causationId',
      'correlationId',
      'machine',
      'machineVersion',
      'taskInvocationId',
    ]),
    options: {},
  });
  condition('HasTask', 'Has Task?', 1680, 'hasTask', true);
  // Data Table insertion returns the stored row; restore dispatch intent from the pure plan.
  code(
    'AfterAppend',
    'After Append',
    1440,
    -100,
    "const plan = $('Plan Transition').first().json; return [{ json: { ...plan, hasTask: !!plan.taskInvocation } }];",
  );
  table(
    'FindTaskBinding',
    'Find Task Binding',
    1920,
    -100,
    'gYLwq6bG2pQQcF1w',
    'get',
    {
      matchType: 'allConditions',
      filters: {
        conditions: [
          filter('machine', "={{ $('Plan Transition').first().json.taskInvocation.machine }}"),
          filter(
            'machineVersion',
            "={{ $('Plan Transition').first().json.taskInvocation.machineVersion }}",
          ),
          filter('task', "={{ $('Plan Transition').first().json.taskInvocation.task }}"),
        ],
      },
      returnAll: true,
    },
    { alwaysOutputData: true },
  );
  code(
    'PrepareTaskDispatch',
    'Prepare Task Dispatch',
    2160,
    -100,
    `const invocation = $('Plan Transition').first().json.taskInvocation;
const bindings = $input.all().map(item => item.json).filter(row => row.task === invocation.task && row.machine === invocation.machine && row.machineVersion === invocation.machineVersion);
const available = bindings.length === 1 && typeof bindings[0].workflowId === 'string' && !!bindings[0].workflowId.trim();
return [{ json: { ...invocation, bindingAvailable: available, workflowId: available ? bindings[0].workflowId : '',
  dispatchReason: available ? '' : 'Task requires exactly one machine/version/task binding with a workflowId.' } }];`,
  );
  condition('BindingAvailable', 'Binding Available?', 2400, 'bindingAvailable', true);
  node('RunTask', 'Run Task', 'executeWorkflow', 1.3, [2640, -100], {
    source: 'database',
    workflowId: { __rl: true, value: '={{ $json.workflowId }}', mode: 'id' },
    mode: 'each',
    options: { waitForSubWorkflow: false },
  });
  code(
    'DispatchedResult',
    'Dispatched Result',
    2880,
    -100,
    "const task = $('Prepare Task Dispatch').first().json; return [{ json: { ...$('Plan Transition').first().json.result, dispatch: { status: 'started', task: task.task, taskInvocationId: task.taskInvocationId } } }];",
  );
  code(
    'DispatchUnavailable',
    'Dispatch Unavailable',
    2640,
    200,
    "const task = $('Prepare Task Dispatch').first().json; return [{ json: { ...$('Plan Transition').first().json.result, dispatch: { status: 'unavailable', task: task.task, taskInvocationId: task.taskInvocationId, reason: task.dispatchReason } } }];",
  );
  code(
    'AppliedResult',
    'Applied Result',
    1920,
    180,
    "return [{ json: $('Plan Transition').first().json.result }];",
  );
  code(
    'ExistingResult',
    'Existing Result',
    1200,
    160,
    "return [{ json: $('Plan Transition').first().json.result }];",
  );
  // Colored notes act as visible sections; executable nodes keep the saved user layout.
  node('Overview', 'Start Here — Generic Runtime', 'stickyNote', 1, [-608, -400], {
    content:
      '# Generic state-machine runtime\n\n## How it works\n1. The runtime rebuilds a case from accepted events and validates the next transition.\n2. It appends one fact, starts the entered state’s task asynchronously, and returns the saved state.\n\n## Setup\n- [ ] Connect **machine_definitions**, **case_event_stream**, and **task_bindings** Data Tables.\n- [ ] Bind tasks by machine + version + task and publish their workflows.\n\n## Try it\nCall from an adapter with caseId, eventId, type and payload. A new case also needs machine + machineVersion.\n\nRead without writing: `{ "caseId": "your-case", "operation": "inspect" }`.\n\n## Expected result\nApplied, duplicate, rejected, or inspected; with state, sequence and outcome. Replay never starts tasks.\n\n**PoC:** sequential requests; append and dispatch are separate, with no automatic retry.',
    width: 552,
    height: 880,
    color: 1,
  });
  node('InputSection', '1 · Input and catalog', 'stickyNote', 1, [176, -64], {
    content:
      '## 1 · Validate input and load definitions\nAccept one request. Read the trusted catalog; definitions stay pinned by machine and version.',
    width: 672,
    height: 352,
    color: 5,
  });
  node('ReplaySection', '2 · Replay and validate', 'stickyNote', 1, [864, -64], {
    content:
      '## 2 · Rebuild state and check the event\nReplay facts, check identity and task lineage, then choose append or a read-only result. Replay never runs tasks.',
    width: 640,
    height: 352,
    color: 4,
  });
  node('AppendSection', '3 · Append one fact', 'stickyNote', 1, [1536, -192], {
    content:
      '## 3 · Persist before dispatch\nOne accepted event = one row. Restore the plan after insertion. The lower branch returns inspection, duplicate or rejection without writing.',
    width: 656,
    height: 560,
    color: 3,
  });
  node('DispatchSection', '4 · Dispatch and return', 'stickyNote', 1, [2208, -400], {
    content:
      '## 4 · Start the task, then finish\nResolve exactly one machine/version/task binding. Start without waiting; its callback is a new event. Missing binding returns unavailable; no task returns the applied state.',
    width: 1104,
    height: 688,
    color: 6,
  });
  link('ReceiveEvent', 'PrepareEvent');
  link('PrepareEvent', 'ReadMachineDefinitions');
  link('ReadMachineDefinitions', 'LoadMachineDefinitions');
  link('LoadMachineDefinitions', 'FindEvent');
  link('FindEvent', 'PlanTransition');
  link('PlanTransition', 'ApplyTransition');
  link('ApplyTransition', 'AppendEvent');
  link('ApplyTransition', 'ExistingResult', 1);
  link('AppendEvent', 'AfterAppend');
  link('AfterAppend', 'HasTask');
  link('HasTask', 'FindTaskBinding');
  link('HasTask', 'AppliedResult', 1);
  link('FindTaskBinding', 'PrepareTaskDispatch');
  link('PrepareTaskDispatch', 'BindingAvailable');
  link('BindingAvailable', 'RunTask');
  link('BindingAvailable', 'DispatchUnavailable', 1);
  link('RunTask', 'DispatchedResult');
  const formattedNodes = await Promise.all(
    nodes.map(async ({ property, metadata, parameters }) => {
      const formattedParameters =
        metadata.type === 'n8n-nodes-base.code'
          ? {
              ...parameters,
              jsCode: await format(parameters.jsCode, { ...formatting, parser: 'babel' }),
            }
          : parameters;
      return `  @node(${JSON.stringify(metadata, null, 2)})\n  ${property} = ${JSON.stringify(formattedParameters, null, 2)};`;
    }),
  );
  return format(
    `// <workflow-map>
// Workflow: Flow4Gold - Core Runtime (event-sourced manual events)
// ReceiveEvent -> PrepareEvent -> ReadMachineDefinitions -> LoadMachineDefinitions -> FindEvent -> PlanTransition -> ApplyTransition
// ApplyTransition [true] -> AppendEvent -> AfterAppend -> HasTask
// HasTask [true] -> FindTaskBinding -> PrepareTaskDispatch -> BindingAvailable
// BindingAvailable [true] -> RunTask (async) -> DispatchedResult
// BindingAvailable [false] -> DispatchUnavailable
// HasTask [false] -> AppliedResult
// ApplyTransition [false] -> ExistingResult
// Overview, InputSection, ReplaySection, AppendSection, DispatchSection (sticky notes)
// </workflow-map>
// GENERATED by npm run build. Edit runtime/, runtime/core-layout.json or scripts/build-core.mjs; machine definitions live in the Data Table.
import { workflow, node, links } from '@n8n-as-code/transformer';
@workflow({ id: 'frF2jemAeCrcFPDe', name: 'Flow4Gold - Core Runtime', active: false,
  isArchived: false, projectId: '8d5DQtHZkgLco5Yr', settings: { executionOrder: 'v1' } })
export class Flow4goldCoreRuntimeWorkflow {
${formattedNodes.join('\n\n')}
  @links()
  defineRouting() {
${routes.join('\n')}
  }
}
`,
    { ...formatting, parser: 'typescript' },
  );
}

if (process.argv[1]?.endsWith('/build-core.mjs') && process.argv.includes('--capture-layout')) {
  const workflow = await compiledWorkflow();
  const executableNodes = workflow.nodes.filter(
    (node) => node.type !== 'n8n-nodes-base.stickyNote',
  );
  if (new Set(executableNodes.map((node) => node.name)).size !== executableNodes.length) {
    throw new Error('Cannot capture layout with duplicate node names.');
  }
  for (const node of executableNodes) {
    if (
      !Array.isArray(node.position) ||
      node.position.length !== 2 ||
      !node.position.every(Number.isFinite)
    ) {
      throw new Error(`Invalid position for ${node.name}.`);
    }
  }
  const positions = Object.fromEntries(executableNodes.map((node) => [node.name, node.position]));
  const formatting = (await resolveConfig('runtime/core-layout.json')) ?? {};
  await writeFile(
    'runtime/core-layout.json',
    await format(JSON.stringify({ positions }), { ...formatting, parser: 'json' }),
  );
  console.log(
    `Captured ${executableNodes.length} executable node positions. Run npm run build to apply the saved layout.`,
  );
} else if (process.argv[1]?.endsWith('/build-core.mjs')) {
  const source = await buildSource();
  if (process.argv.includes('--check')) {
    const expected = new WorkflowBuilder().build(await new TypeScriptParser().parseCode(source));
    const actual = await compiledWorkflow();
    // Sync may reformat TypeScript; compare the compiled workflow rather than text.
    // Activation is deployment state updated by n8nac, not generated runtime logic.
    for (const key of ['id', 'name', 'nodes', 'connections']) {
      if (!isDeepStrictEqual(actual[key], expected[key])) {
        throw new Error(
          `Generated core workflow differs (${key}). Run npm run build and review before pushing.`,
        );
      }
    }
    console.log('Core workflow matches its runtime and catalog validation source.');
  } else {
    await writeFile(workflowPath, source);
    console.log(`Built ${workflowPath}`);
  }
}
