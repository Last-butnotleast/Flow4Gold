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
