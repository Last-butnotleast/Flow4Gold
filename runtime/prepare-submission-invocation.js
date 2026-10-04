const items = $input.all();
if (items.length !== 1) throw new Error('One prepare_submission invocation is required.');
const invocation = items[0].json;
for (const key of ['caseId', 'triggerEventId', 'taskInvocationId', 'correlationId']) {
  if (
    typeof invocation[key] !== 'string' ||
    !invocation[key].trim() ||
    invocation[key] !== invocation[key].trim()
  )
    throw new Error(`Invalid ${key}.`);
}
if (
  invocation.machine !== 'flow4gold-submission' ||
  invocation.machineVersion !== 1 ||
  invocation.task !== 'prepare_submission' ||
  invocation.state !== 'REGISTERED' ||
  invocation.taskInvocationId !== `${invocation.triggerEventId}:prepare_submission`
)
  throw new Error('Unexpected submission preparation invocation.');
return [{ json: invocation }];
