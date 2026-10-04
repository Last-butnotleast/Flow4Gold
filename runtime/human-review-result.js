const invocation = $('Prepare Review').first().json;
const form = $input.first().json;
const decision = form.Decision;
if (!['Approve refund','Reject','Ask customer'].includes(decision)) throw new Error('An explicit review decision is required');
const message = typeof form.Message === 'string' ? form.Message.trim() : '';
if (!message || message.length > 4000) throw new Error('A message of 1–4000 characters is required');
const payload = {reviewEventId:invocation.triggerEventId,message};
let type = 'REJECTED';
if (decision === 'Approve refund') {
  const order = invocation.order;
  if (!order) throw new Error('Cannot approve without a recorded sample payment; ask customer for the order reference');
  payload.proposal = {orderReference:order.orderReference,amount:order.amount,currency:order.currency,paymentReference:order.paymentReference,reason:message,simulation:true};
  type = 'REVIEW_APPROVED';
} else if (decision === 'Ask customer') type = 'NEED_MORE_INFO';
return [{json:{caseId:invocation.caseId,eventId:invocation.taskInvocationId+':result',taskInvocationId:invocation.taskInvocationId,
  causationId:invocation.triggerEventId,correlationId:invocation.correlationId,type,payload}}];
