// Validate the request before reading the trusted machine catalog.
const items = $input.all();
if (items.length !== 1) throw new Error('Submit exactly one request per execution.');
const input = items[0].json;
if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Input must be an object.');
const inspect = input.operation === 'inspect';
const allowed = inspect ? ['caseId', 'operation'] : ['caseId', 'eventId', 'type', 'payload', 'causationId', 'correlationId', 'taskInvocationId'];
if (Object.keys(input).some(key => !allowed.includes(key))) throw new Error('Unknown input field; state is reconstructed from events.');
for (const key of inspect ? ['caseId'] : ['caseId', 'eventId', 'type']) {
  if (typeof input[key] !== 'string' || !input[key].trim() || input[key] !== input[key].trim()) throw new Error(`${key} must be a nonempty string without surrounding whitespace.`);
}
if (inspect) return [{ json: { request: { caseId: input.caseId, operation: 'inspect' } } }];
for (const key of ['causationId', 'correlationId', 'taskInvocationId']) {
  if (input[key] !== undefined && (typeof input[key] !== 'string' || input[key] !== input[key].trim() || (key !== 'causationId' && !input[key]))) throw new Error(`${key} must be a string without surrounding whitespace; correlationId/taskInvocationId cannot be empty.`);
}
const payload = input.payload === undefined ? {} : input.payload;
if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('payload must be a JSON object.');
return [{ json: { request: { caseId: input.caseId, eventId: input.eventId, type: input.type, payload, causationId: input.causationId ?? '', taskInvocationId: input.taskInvocationId ?? '', ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }) } } }];
