const prepared = $('Prepare Jev Decision').first().json;
const response = $input.first().json;
const answer = response?.answers?.next_event;
const allowed = ['REFUND_RECOMMENDED', 'NEED_MORE_INFO', 'ESCALATE'];
const probability = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const valid = !response?.error && answer?.type === 'choice' && allowed.includes(answer.choice) &&
  probability(answer.confidence) && allowed.every(key => probability(answer.probabilities?.[key]));
let type = valid ? answer.choice : 'ESCALATE';
const decision = valid ? {
  model: typeof response.model === 'string' ? response.model : prepared.jev_request.model,
  choice: answer.choice, confidence: answer.confidence,
  probabilities: Object.fromEntries(allowed.map(key => [key, answer.probabilities[key]])),
  ...(typeof response.id === 'string' ? { requestId: response.id } : {}),
} : { model: prepared.jev_request.model, status: 'unavailable', reason: 'Decision service failed or returned an invalid bounded answer.' };
const order = prepared.order;
// Evidence guards outrank a model recommendation. Never take payment fields from model or customer text.
if (prepared.orderLookupIssue) {
  type = 'ESCALATE'; decision.guard = prepared.orderLookupIssue;
} else if (valid && type === 'REFUND_RECOMMENDED' && !order) {
  type = 'NEED_MORE_INFO'; decision.guard = 'A matching sample order is required before a proposal.';
} else if (valid && type === 'REFUND_RECOMMENDED' && order.duplicateCharge !== true) {
  type = 'ESCALATE'; decision.guard = 'The sample payment records do not show a duplicate charge.';
}
const evidence = { source: 'n8n:demo_orders', simulated: true, orderReference: prepared.orderReference || null,
  duplicateCharge: order?.duplicateCharge ?? null, ...(order ? {orderSnapshot: order} : {}) };
const reason = type === 'REFUND_RECOMMENDED' ? 'Duplicate charge confirmed in sample payment records' :
  type === 'NEED_MORE_INFO' ? 'More customer information is needed before a refund can be proposed.' :
  !valid ? decision.reason : 'This case needs human judgment under the sample refund policy.';
const payload = { reason, decision, evidence };
if (type === 'REFUND_RECOMMENDED') Object.assign(payload, { amount: order.amount, currency: order.currency, paymentReference: order.paymentReference, orderReference: order.orderReference });
if (type === 'NEED_MORE_INFO') payload.question = order ? 'Please describe what is wrong with the payment for order ' + order.orderReference + '.' : 'Please provide your order number and describe the payment issue. You can select a sample order in this chat.';
const invocation = prepared.invocation;
return [{ json: { caseId: invocation.caseId, eventId: invocation.taskInvocationId + ':result',
  taskInvocationId: invocation.taskInvocationId, causationId: invocation.triggerEventId,
  correlationId: invocation.correlationId, type, payload } }];
