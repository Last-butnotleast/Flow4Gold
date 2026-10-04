const invocation = $('Receive Task').first().json;
for (const key of ['caseId', 'triggerEventId', 'taskInvocationId', 'correlationId']) {
  if (typeof invocation[key] !== 'string' || !invocation[key].trim()) throw new Error('Missing review invocation field: ' + key);
}
if (invocation.task !== 'human_review' || invocation.machine !== 'customer-refund' || invocation.machineVersion !== 3 ||
    invocation.state !== 'HUMAN_REVIEW' || invocation.taskInvocationId !== invocation.triggerEventId + ':human_review') throw new Error('Unexpected human review invocation');
const rows = $('Read Case Events').all().map(item => item.json).filter(row => row.caseId === invocation.caseId).sort((a,b) => a.sequence-b.sequence);
const matches = rows.filter(row => row.eventId === invocation.triggerEventId);
if (matches.length !== 1 || matches[0].type !== 'ESCALATE' || matches[0].machineVersion !== 3 || matches[0].correlationId !== invocation.correlationId) throw new Error('Missing recorded escalation');
const trigger = matches[0];
const events = rows.filter(row => row.sequence <= trigger.sequence).map(row => ({ ...row, data: JSON.parse(row.payload) }));
let orderReference = '';
const conversation = [];
for (const entry of events) {
  if (['RECEIVED','CUSTOMER_REPLIED'].includes(entry.type)) {
    const message = typeof entry.data.message === 'string' ? entry.data.message.slice(0,4000) : '';
    const reference = typeof entry.data.orderReference === 'string' && entry.data.orderReference.trim() || message.match(/\border\s*(?:is\s+)?#?\s*([a-z0-9][a-z0-9-]*)\b/i)?.[1];
    if (reference) orderReference = reference;
    conversation.push(['Customer',message]);
  } else if (entry.type === 'NEED_MORE_INFO') {
    conversation.push(['Support',entry.data.message || entry.data.question || 'Please provide more information.']);
  }
}
const { order, orderLookupIssue } = lookupDemoOrder(orderReference);
const escapeHtml = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const escalation = JSON.parse(trigger.payload);
const reason = escalation.reason || escalation.message || 'Investigation requires human judgment.';
const formDescription = '<p>SIMULATED refund review. Your approval executes the exact sample payment shown below, without another approval round. Ask customer posts your message in chat and waits for their reply.</p>' +
  '<p><strong>Case:</strong> ' + escapeHtml(invocation.caseId) + '</p><p><strong>Escalation:</strong> ' + escapeHtml(reason) + '</p>' +
  (order ? '<p><strong>Recorded sample payment:</strong> Order ' + escapeHtml(order.orderReference) + ' — ' + escapeHtml(order.itemName) + '; ' + escapeHtml(order.currency) + ' ' + order.amount + '; ' + escapeHtml(order.paymentReference) + '; duplicate charge: ' + order.duplicateCharge + '.</p><p>Approve refund explicitly authorizes this amount. Explain your judgment in Message.</p>' : '<p>' + escapeHtml(orderLookupIssue || 'No matching sample payment.') + '</p><p><strong>No usable sample payment.</strong> Approval is unavailable. Ask for an order reference or reject the request.</p>') +
  '<h3>Conversation</h3>' + conversation.map(([actor,message])=>'<p><strong>' + actor + ':</strong> ' + escapeHtml(message) + '</p>').join('');
const plain = value => String(value).replace(/@/g,'@\u200b').replace(/[\r\n`*_~|<>]/g,' ').slice(0,450);
const discordSummary = 'Flow4Gold — HUMAN REVIEW (simulated)\nCase: ' + plain(invocation.caseId) + '\nReason: ' + plain(reason) + '\n' +
  (order ? 'Review refund: ' + order.currency + ' ' + order.amount + ', order ' + order.orderReference : 'No matching payment — ask customer or reject') + '\nRead the conversation and choose your next action in the form.';
return [{json:{...invocation,order,orderLookupIssue,formDescription,discordSummary}}];
