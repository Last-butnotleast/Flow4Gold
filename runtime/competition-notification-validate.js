const items = $input.all();
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
