// Narrow ingress: never accept arbitrary domain events or approval payloads.
const body = $json.body;
if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('JSON object required.');
const inspect = body.operation === 'inspect';
const keys = inspect ? ['operation', 'caseId'] : ['caseId', 'eventId', 'type', 'payload'];
if (Object.keys(body).some(key => !keys.includes(key))) throw new Error('Unknown field.');
if (typeof body.caseId !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(body.caseId)) throw new Error('Invalid case ID.');
if (inspect) return [{json: {caseId: body.caseId, operation: 'inspect'}}];
if (!['RECEIVED', 'CUSTOMER_REPLIED'].includes(body.type)) throw new Error('Only customer intake and replies are permitted.');
if (typeof body.eventId !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(body.eventId)) throw new Error('Invalid event ID.');
const payload = body.payload;
if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(key => !['message', 'orderReference'].includes(key))) throw new Error('Invalid customer payload.');
if (typeof payload.message !== 'string' || !payload.message.trim() || payload.message.length > 4000) throw new Error('Message must contain 1–4000 characters.');
if (payload.orderReference !== undefined && (typeof payload.orderReference !== 'string' || payload.orderReference.length > 80)) throw new Error('Invalid order reference.');
return [{json: {caseId: body.caseId, eventId: body.eventId, type: body.type, payload: {message: payload.message.trim(), ...(payload.orderReference?.trim() ? {orderReference: payload.orderReference.trim()} : {})}}}];
