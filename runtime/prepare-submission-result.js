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
    throw new Error(`Invalid recorded ${field}.`);
  return value.trim();
};
if (!submission || typeof submission !== 'object' || Array.isArray(submission))
  throw new Error('Recorded submission is missing.');
const actorId = text(payload.actorId, 'actorId');
for (const key of ['contestantName', 'email', 'title', 'videoUrl'])
  text(submission[key], key, 2000);
for (const key of ['templateSubmitted', 'ticketConfirmed', 'privacyConsent', 'recordingConsent'])
  if (submission[key] !== true) throw new Error(`Recorded registration lacks ${key}.`);
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
    !new RegExp('^https://n8n\\.io/workflows/' + id + '(?:[-/?#]|$)').test(url)
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
      eventId: `${invocation.taskInvocationId}:result`,
      taskInvocationId: invocation.taskInvocationId,
      causationId: trigger.eventId,
      correlationId: invocation.correlationId,
      type,
      payload: resultPayload,
    },
  },
];
