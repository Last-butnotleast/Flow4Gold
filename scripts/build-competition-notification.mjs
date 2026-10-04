import { readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { format, resolveConfig } from 'prettier';
import {
  TypeScriptParser,
  WorkflowBuilder,
  JsonToAstParser,
  AstToTypeScriptGenerator,
} from '@n8n-as-code/transformer';

export const workflowPath = 'workflows/flow4gold/tasks/competition/notify-participant.workflow.ts';
export const notificationTableId = 'GgWLi8jtrmWP9gpi';
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
export async function buildSource() {
  const nodes = [],
    routes = [];
  const add = (property, name, type, version, position, parameters, metadata = {}) =>
    nodes.push(
      `@node(${JSON.stringify({ id: 'competition-notify-' + property, name, type: 'n8n-nodes-base.' + type, version, position, ...metadata }, null, 2)})\n${property} = ${JSON.stringify(parameters, null, 2)};`,
    );
  const code = (property, name, position, jsCode) =>
    add(property, name, 'code', 2, position, { mode: 'runOnceForAllItems', jsCode });
  const link = (from, to, output = 0) =>
    routes.push(`this.${from}.out(${output}).to(this.${to}.in(0));`);
  const validator = (await readFile('shared/machine-validation.mjs', 'utf8')).replace(
    /export function /g,
    'function ',
  );
  const replay = `function replayNotification(history, machineDefinition, caseId) {\nconst $input={all:()=>history.map(json=>({json}))};\nconst $=()=>({first:()=>({json:{request:{operation:'inspect',caseId},definitions:[machineDefinition]}})});\n${await readFile('runtime/plan-transition.js', 'utf8')}\n}\n`;
  add(
    'ReceiveTask',
    'Receive Task',
    'executeWorkflowTrigger',
    1.2,
    [0, 0],
    { inputSource: 'passthrough' },
    { id: '31cb1159-2639-46e2-957b-b801934e1f6a' },
  );
  code(
    'ValidateInvocation',
    'Validate Notification Invocation',
    [240, 0],
    await readFile('runtime/competition-notification-validate.js', 'utf8'),
  );
  add(
    'ReadCaseEvents',
    'Read Case Events',
    'dataTable',
    1.1,
    [480, 0],
    {
      resource: 'row',
      operation: 'get',
      dataTableId: { __rl: true, value: 'TjuB58skTvPRCwB3', mode: 'id' },
      filters: {
        conditions: [{ keyName: 'caseId', condition: 'eq', keyValue: '={{ $json.caseId }}' }],
      },
      returnAll: true,
    },
    { alwaysOutputData: true },
  );
  add(
    'ReadMachineDefinitions',
    'Read Machine Definitions',
    'dataTable',
    1.1,
    [720, 0],
    {
      resource: 'row',
      operation: 'get',
      dataTableId: { __rl: true, value: 'Lm8JZL9uCNqj14vE', mode: 'id' },
      returnAll: true,
    },
    { alwaysOutputData: true, executeOnce: true },
  );
  code(
    'HydrateNotification',
    'Hydrate Recorded Notification',
    [960, 0],
    validator +
      '\n' +
      replay +
      (await readFile('runtime/competition-notification-hydrate.js', 'utf8')),
  );
  add('RouteState', 'Route Notification State', 'switch', 3.4, [1200, 0], {
    mode: 'expression',
    numberOutputs: 4,
    output:
      '={{ ["WAITING_FOR_PUBLICATION", "ADMIN_REVIEW", "JUDGING"].includes($json.state) ? 0 : $json.state === "NEEDS_INFORMATION" ? 1 : ["INVITED", "CONFIRMED"].includes($json.state) ? 2 : $json.state === "AWAITING_PRIZE_ACCEPTANCE" ? 3 : -1 }}',
  });
  code(
    'ProgressMessage',
    'Progress Update Message',
    [1480, -300],
    `const x=$input.first().json;
const templates={
 WAITING_FOR_PUBLICATION:['Waiting for your published workflow','Your submission is recorded. When your workflow is published, provide its workflow ID in your entry.'],
 ADMIN_REVIEW:['Your entry is ready for review','The organizer can now review your published workflow and submission evidence.'],
 JUDGING:['Check-in recorded','Your check-in is recorded. The human jury will determine the competition result.'],
};
const template=templates[x.state];if(!template)throw new Error('Unknown progress state');
return [{json:{...x,subject:template[0],message:template[1]}}];`,
  );
  code(
    'QuestionMessage',
    'Information Request Message',
    [1480, -100],
    `const x=$input.first().json;
if(typeof x.question!=='string'||!x.question.trim())throw new Error('Recorded organizer question is required');
return [{json:{...x,subject:'The organizer needs more information',message:x.question.trim()}}];`,
  );
  code(
    'InvitationMessage',
    'Invitation Message',
    [1480, 100],
    `const x=$input.first().json;
if(typeof x.invitationDetails!=='string'||!x.invitationDetails.trim())throw new Error('Recorded invitation details are required');
return [{json:{...x,subject:x.state==='INVITED'?'You are invited as a finalist':'Participation confirmed',
 message:(x.state==='INVITED'?'The human jury selected your entry. Accept or decline this invitation in your entry. ':'Your participation is confirmed. ')+x.invitationDetails.trim()}}];`,
  );
  code(
    'PrizeMessage',
    'Prize Acceptance Message',
    [1480, 300],
    `const x=$input.first().json;
const deadline=typeof x.acceptanceDeadline==='string'&&x.acceptanceDeadline.trim()?' Recorded acceptance deadline: '+x.acceptanceDeadline.trim()+'.':'';
return [{json:{...x,subject:'Please accept your prize',message:'The human jury selected your entry as the winner. Accept or decline the prize in your entry. Acceptance does not confirm prize delivery.'+deadline}}];`,
  );
  code(
    'ComposeRecord',
    'Compose Notification Record',
    [1800, 0],
    `const x=$input.first().json;
const fields=${JSON.stringify(fields)};
if(typeof x.subject!=='string'||!x.subject.trim()||typeof x.message!=='string'||!x.message.trim())throw new Error('Notification subject and message are required');
return [{json:Object.fromEntries(fields.map(field=>[field,x[field]]))}];`,
  );
  add('StoreNotification', 'Upsert In-App Notification', 'dataTable', 1.1, [2040, 0], {
    resource: 'row',
    operation: 'upsert',
    dataTableId: { __rl: true, value: notificationTableId, mode: 'id' },
    matchType: 'allConditions',
    filters: {
      conditions: [
        { keyName: 'taskInvocationId', condition: 'eq', keyValue: '={{ $json.taskInvocationId }}' },
      ],
    },
    columns: {
      mappingMode: 'defineBelow',
      value: Object.fromEntries(fields.map((field) => [field, `={{ $json.${field} }}`])),
      matchingColumns: [],
      schema: fields.map((field) => ({
        id: field,
        displayName: field,
        required: false,
        defaultMatch: false,
        display: true,
        type: ['machineVersion', 'sequence'].includes(field) ? 'number' : 'string',
        readOnly: false,
        removed: false,
      })),
      attemptToConvertTypes: false,
      convertFieldsToString: false,
    },
    options: { dryRun: false },
  });
  code(
    'ReturnStored',
    'Return Stored Notification',
    [2280, 0],
    await readFile('runtime/competition-notification-stored.js', 'utf8'),
  );
  add('Scope', 'In-App Notification Boundary', 'stickyNote', 1, [240, -540], {
    content:
      '## Recorded transition → participant inbox\nThe core starts this task with its standard invocation. Replay accepted events through the trigger using the pinned definition. Message facts come from that history, never caller input.\nNative Data Table upsert stores one in-app message per taskInvocationId. A retry replaces the same row. The result confirms the actual saved row. No email, fabricated PIN, or domain-event callback.\nMessages may arrive after the case advances; sequence identifies the historical transition. Final states have no notification task.',
    width: 1050,
    height: 250,
  });
  for (const [from, to] of [
    ['ReceiveTask', 'ValidateInvocation'],
    ['ValidateInvocation', 'ReadCaseEvents'],
    ['ReadCaseEvents', 'ReadMachineDefinitions'],
    ['ReadMachineDefinitions', 'HydrateNotification'],
    ['HydrateNotification', 'RouteState'],
    ['ProgressMessage', 'ComposeRecord'],
    ['QuestionMessage', 'ComposeRecord'],
    ['InvitationMessage', 'ComposeRecord'],
    ['PrizeMessage', 'ComposeRecord'],
    ['ComposeRecord', 'StoreNotification'],
    ['StoreNotification', 'ReturnStored'],
  ])
    link(from, to);
  ['ProgressMessage', 'QuestionMessage', 'InvitationMessage', 'PrizeMessage'].forEach(
    (name, index) => link('RouteState', name, index),
  );
  const source = `import {workflow,node,links} from '@n8n-as-code/transformer';\n@workflow({id:'u98rBfeXu4I66zMP',name:'Flow4Gold Competition - Notify Participant',active:false,isArchived:false,settings:{executionOrder:'v1'}})\nexport class CompetitionNotifyParticipantWorkflow {\n${nodes.join('\n\n')}\n@links() defineRouting(){\n${routes.join('\n')}\n}\n}\n`;
  const compiled = new WorkflowBuilder().build(await new TypeScriptParser().parseCode(source));
  const formatting = (await resolveConfig('scripts/build-competition-notification.mjs')) ?? {};
  for (const node of compiled.nodes) {
    if (node.type === 'n8n-nodes-base.code')
      node.parameters.jsCode = await format(node.parameters.jsCode, {
        ...formatting,
        parser: 'babel',
      });
  }
  return new AstToTypeScriptGenerator().generate(new JsonToAstParser().parse(compiled));
}
if (process.argv[1]?.endsWith('/build-competition-notification.mjs')) {
  const source = await buildSource();
  if (process.argv.includes('--check')) {
    const parser = new TypeScriptParser(),
      builder = new WorkflowBuilder();
    const actual = builder.build(await parser.parseFile(workflowPath)),
      expected = builder.build(await parser.parseCode(source));
    for (const key of ['id', 'name', 'nodes', 'connections'])
      if (!isDeepStrictEqual(actual[key], expected[key]))
        throw new Error(`Competition notification differs (${key}); rebuild.`);
    console.log('Competition notification matches source.');
  } else {
    await writeFile(workflowPath, source);
    console.log('Built ' + workflowPath);
  }
}
