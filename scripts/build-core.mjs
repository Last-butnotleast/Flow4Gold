import { readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { TypeScriptParser, WorkflowBuilder } from '@n8n-as-code/transformer';

export const workflowPath = 'workflows/flow4gold/core-runtime.workflow.ts';
export async function compiledWorkflow(path = workflowPath) {
  return new WorkflowBuilder().build(await new TypeScriptParser().parseFile(path));
}

export async function buildSource() {
  const prepare = await readFile('runtime/prepare-event.js', 'utf8');
  const validator = (await readFile('shared/machine-validation.mjs', 'utf8')).replace(/export function /g, 'function ');
  const loadDefinitions = validator + '\n' + await readFile('runtime/load-machine-definitions.js','utf8');
  const plan = await readFile('runtime/plan-transition.js', 'utf8');
  const nodes = [];
  const routes = [];
  const node = (property, name, type, version, position, parameters, metadata = {}) => {
    nodes.push(`  @node(${JSON.stringify({ id: `flow4gold-${property}`, name, type: `n8n-nodes-base.${type}`, version, position, ...metadata }, null, 2)})\n  ${property} = ${JSON.stringify(parameters, null, 2)};`);
  };
  const link = (from, to, output = 0) => routes.push(`    this.${from}.out(${output}).to(this.${to}.in(0));`);
  const code = (property, name, x, y, jsCode) => node(property, name, 'code', 2, [x, y], { mode: 'runOnceForAllItems', language: 'javaScript', jsCode });
  const condition = (property, name, x, field, right) => node(property, name, 'if', 2.3, [x, 0], {
    conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 }, conditions: [
      { id: property, leftValue: `={{ $json.${field} }}`, rightValue: right, operator: { type: typeof right, operation: 'equals' } },
    ], combinator: 'and' }, options: {},
  });
  const eventsId = 'TjuB58skTvPRCwB3';
  const filter = (key, expression) => ({ keyName: key, condition: 'eq', keyValue: expression });
  const table = (property, name, x, y, tableId, operation, parameters, metadata = {}) => node(property, name, 'dataTable', 1.1, [x, y], {
    resource: 'row', operation, dataTableId: { __rl: true, value: tableId, mode: 'id' }, ...parameters,
  }, metadata);
  const columns = (record, names) => ({ mappingMode: 'defineBelow', value: Object.fromEntries(names.map(name => [name, `={{ $('Plan Transition').first().json.${record}.${name} }}`])), matchingColumns: [], schema: names.map(name => ({ id: name, displayName: name, required: false, defaultMatch: false, display: true, type: ['machineVersion', 'sequence'].includes(name) ? 'number' : 'string', readOnly: false, removed: false })), attemptToConvertTypes: false, convertFieldsToString: false });
  node('ReceiveEvent', 'Receive Event', 'executeWorkflowTrigger', 1.2, [0, 0], { inputSource: 'passthrough' }, { id: 'e01d01ef-5f08-42d5-a8fb-5362c7986b62' });
  code('PrepareEvent', 'Prepare Event', 240, 0, prepare);
  table('ReadMachineDefinitions', 'Read Machine Definitions', 350, -180, 'Lm8JZL9uCNqj14vE', 'get', { returnAll: true }, { alwaysOutputData: true, executeOnce: true });
  code('LoadMachineDefinitions', 'Load Machine Definitions', 480, -180, loadDefinitions);
  table('FindEvent', 'Find Event', 480, 0, eventsId, 'get', { matchType: 'anyCondition', filters: { conditions: [filter('caseId', "={{ $('Prepare Event').first().json.request.caseId }}"), filter('eventId', "={{ $('Prepare Event').first().json.request.eventId ?? '' }}"), filter('eventId', "={{ $('Prepare Event').first().json.request.causationId ?? '' }}")] }, returnAll: true }, { alwaysOutputData: true });
  code('PlanTransition', 'Plan Transition', 720, 0, plan);
  condition('ApplyTransition', 'Append Event?', 960, 'action', 'apply');
  table('AppendEvent', 'Append Event', 1200, -100, eventsId, 'insert', { columns: columns('eventRecord', ['eventId', 'caseId', 'sequence', 'type', 'payload', 'causationId', 'correlationId', 'machine', 'machineVersion', 'taskInvocationId']), options: {} });
  condition('HasTask', 'Has Task?', 1680, 'hasTask', true);
  // Data Table insertion returns the stored row; restore dispatch intent from the pure plan.
  code('AfterAppend', 'After Append', 1440, -100, "const plan = $('Plan Transition').first().json; return [{ json: { ...plan, hasTask: !!plan.taskInvocation } }];");
  table('FindTaskBinding', 'Find Task Binding', 1920, -100, 'gYLwq6bG2pQQcF1w', 'get', { matchType: 'allConditions', filters: { conditions: [filter('machine', "={{ $('Plan Transition').first().json.taskInvocation.machine }}"), filter('machineVersion', "={{ $('Plan Transition').first().json.taskInvocation.machineVersion }}"), filter('task', "={{ $('Plan Transition').first().json.taskInvocation.task }}")] }, returnAll: true }, { alwaysOutputData: true });
  code('PrepareTaskDispatch', 'Prepare Task Dispatch', 2160, -100, `const invocation = $('Plan Transition').first().json.taskInvocation;
const bindings = $input.all().map(item => item.json).filter(row => row.task === invocation.task && row.machine === invocation.machine && row.machineVersion === invocation.machineVersion);
const available = bindings.length === 1 && typeof bindings[0].workflowId === 'string' && !!bindings[0].workflowId.trim();
return [{ json: { ...invocation, bindingAvailable: available, workflowId: available ? bindings[0].workflowId : '',
  dispatchReason: available ? '' : 'Task requires exactly one machine/version/task binding with a workflowId.' } }];`);
  condition('BindingAvailable', 'Binding Available?', 2400, 'bindingAvailable', true);
  node('RunTask', 'Run Task', 'executeWorkflow', 1.3, [2640, -100], { source: 'database', workflowId: { __rl: true, value: '={{ $json.workflowId }}', mode: 'id' }, mode: 'each', options: { waitForSubWorkflow: false } });
  code('DispatchedResult', 'Dispatched Result', 2880, -100, "const task = $('Prepare Task Dispatch').first().json; return [{ json: { ...$('Plan Transition').first().json.result, dispatch: { status: 'started', task: task.task, taskInvocationId: task.taskInvocationId } } }];");
  code('DispatchUnavailable', 'Dispatch Unavailable', 2640, 200, "const task = $('Prepare Task Dispatch').first().json; return [{ json: { ...$('Plan Transition').first().json.result, dispatch: { status: 'unavailable', task: task.task, taskInvocationId: task.taskInvocationId, reason: task.dispatchReason } } }];");
  code('AppliedResult', 'Applied Result', 1920, 180, "return [{ json: $('Plan Transition').first().json.result }];");
  code('ExistingResult', 'Existing Result', 1200, 160, "return [{ json: $('Plan Transition').first().json.result }];");
  node('Scope', 'Event Stream Breakpoint', 'stickyNote', 1, [240, -360], { content: '## Generic event-stream runtime\nNew cases require machine + machineVersion. Existing streams pin that identity. Read validated definitions → replay → validate event → append one row → dispatch one task asynchronously. Initial states are passive; any legal initial event can start a case.\nTransitions marked taskResult: true require the current task invocation, cause and stable result ID. Domain payload validation belongs in task adapters. Bindings are scoped by machine/version/task. Replay never executes tasks.\nSequential requests only; append/dispatch retain a recovery gap. Definitions are immutable after use. No timers, nested states, parallel tasks, or automatic retries.', width: 1040, height: 240 });
  link('ReceiveEvent', 'PrepareEvent'); link('PrepareEvent', 'ReadMachineDefinitions'); link('ReadMachineDefinitions', 'LoadMachineDefinitions'); link('LoadMachineDefinitions', 'FindEvent'); link('FindEvent', 'PlanTransition');
  link('PlanTransition', 'ApplyTransition'); link('ApplyTransition', 'AppendEvent'); link('ApplyTransition', 'ExistingResult', 1);
  link('AppendEvent', 'AfterAppend'); link('AfterAppend', 'HasTask');
  link('HasTask', 'FindTaskBinding'); link('HasTask', 'AppliedResult', 1);
  link('FindTaskBinding', 'PrepareTaskDispatch'); link('PrepareTaskDispatch', 'BindingAvailable');
  link('BindingAvailable', 'RunTask'); link('BindingAvailable', 'DispatchUnavailable', 1);
  link('RunTask', 'DispatchedResult');
  return `// <workflow-map>
// Workflow: Flow4Gold - Core Runtime (event-sourced manual events)
// ReceiveEvent -> PrepareEvent -> ReadMachineDefinitions -> LoadMachineDefinitions -> FindEvent -> PlanTransition -> ApplyTransition
// ApplyTransition [true] -> AppendEvent -> AfterAppend -> HasTask
// HasTask [true] -> FindTaskBinding -> PrepareTaskDispatch -> BindingAvailable
// BindingAvailable [true] -> RunTask (async) -> DispatchedResult
// BindingAvailable [false] -> DispatchUnavailable
// HasTask [false] -> AppliedResult
// ApplyTransition [false] -> ExistingResult
// Scope (stickyNote)
// </workflow-map>
// GENERATED by npm run build. Edit runtime/ or scripts/build-core.mjs; machine definitions live in the Data Table.
import { workflow, node, links } from '@n8n-as-code/transformer';
@workflow({ id: 'frF2jemAeCrcFPDe', name: 'Flow4Gold - Core Runtime', active: false,
  isArchived: false, projectId: '8d5DQtHZkgLco5Yr', settings: { executionOrder: 'v1' } })
export class Flow4goldCoreRuntimeWorkflow {
${nodes.join('\n\n')}
  @links()
  defineRouting() {
${routes.join('\n')}
  }
}
`;
}

if (process.argv[1]?.endsWith('/build-core.mjs')) {
  const source = await buildSource();
  if (process.argv.includes('--check')) {
    const expected = new WorkflowBuilder().build(await new TypeScriptParser().parseCode(source));
    const actual = await compiledWorkflow();
    // Sync may reformat TypeScript; compare the compiled workflow rather than text.
    // Activation is deployment state updated by n8nac, not generated runtime logic.
    for (const key of ['id', 'name', 'nodes', 'connections']) {
      if (!isDeepStrictEqual(actual[key], expected[key])) {
        throw new Error(`Generated core workflow differs (${key}). Run npm run build and review before pushing.`);
      }
    }
    console.log('Core workflow matches its runtime and catalog validation source.');
  } else {
    await writeFile(workflowPath, source);
    console.log(`Built ${workflowPath}`);
  }
}
