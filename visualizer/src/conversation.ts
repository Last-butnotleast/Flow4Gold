import type { CaseEvent, LiveCase } from './live';
export interface ConversationEntry {
  id: string; actor: 'customer' | 'support' | 'team' | 'system'; text: string;
  facts?: Record<string, unknown>; title?: string;
}
const text = (value: unknown) => typeof value === 'string' ? value : '';
export function conversationEntries(events: CaseEvent[]): ConversationEntry[] {
  return [...events].sort((a,b) => a.sequence-b.sequence).flatMap<ConversationEntry>(event => {
    const base = { id: event.eventId };
    const payload = event.payload;
    switch (event.type) {
      case 'RECEIVED': case 'CUSTOMER_REPLIED':
        return [{ ...base, actor: 'customer' as const, text: text(payload.message) || 'Payment support requested.', ...(payload.orderReference ? { facts: {orderReference: payload.orderReference} } : {}) }];
      case 'NEED_MORE_INFO':
        return [{ ...base, actor: event.taskInvocationId?.endsWith(':human_review') ? 'team' as const : 'support' as const, text: text(payload.question) || (event.taskInvocationId?.endsWith(':human_review') ? text(payload.message) : '') || 'Could you share your order reference and a little more about the payment problem?' }];
      case 'REFUND_RECOMMENDED':
        return [{ ...base, actor: 'support' as const, text: 'A refund has been proposed. It needs a team member’s approval before we can continue.', title: 'Refund proposal', facts: payload }];
      case 'REVIEW_APPROVED':
        return [{ ...base, actor: 'team' as const, text: text(payload.message) || 'The team reviewed this request and approved the refund shown below. Processing the simulated refund.', title: 'Refund approved by the team', facts: typeof payload.proposal === 'object' && payload.proposal !== null ? payload.proposal as Record<string, unknown> : {} }];
      case 'APPROVED':
        return [{ ...base, actor: 'system' as const, text: 'The team approved this proposal. Processing the simulated refund.' }];
      case 'REJECTED':
        return [{ ...base, actor: event.taskInvocationId?.endsWith(':human_review') ? 'team' as const : 'system' as const, text: 'The team declined this refund request. This conversation is closed.' + (event.taskInvocationId?.endsWith(':human_review') && text(payload.message) ? ' ' + text(payload.message) : '') }];
      case 'REFUND_CONFIRMED':
        return [{ ...base, actor: 'support' as const, text: 'Your simulated refund is confirmed. No money moved in this demo.', title: 'Refund confirmed', facts: payload }];
      case 'ESCALATE':
        return [{ ...base, actor: 'support' as const, text: 'A team member needs to review this request before we can continue.' }];
      case 'ACTION_FAILED': case 'REFUND_UNCONFIRMED':
        return [{ ...base, actor: 'system' as const, text: 'We could not confirm the refund. The case needs review before any further action.' }];
      default: return [];
    }
  });
}
export function conversationStatus(current: LiveCase | null): { title: string; hint: string } {
  switch (current?.state) {
    case 'OPEN': case 'INVESTIGATING': return { title: 'Reviewing your request', hint: 'Checking the sample payment records. You do not need to send another message.' };
    case 'WAITING_CUSTOMER': return { title: 'Waiting for your reply', hint: 'Reply to the question above to continue.' };
    case 'AWAITING_APPROVAL': return { title: 'Waiting for team approval', hint: 'The support team is reviewing the proposed refund. This conversation will update after their decision.' };
    case 'EXECUTING': return { title: 'Processing refund', hint: 'The approved refund is being simulated.' };
    case 'VERIFYING': return { title: 'Confirming refund', hint: 'Checking the simulated payment receipt.' };
    case 'HUMAN_REVIEW': return !current?.machine?.states.HUMAN_REVIEW?.tasks?.includes('human_review') ? { title: 'Needs team review', hint: 'This older case waits for manual review. No automated review task is attached to its machine version.' } : { title: 'Waiting for team review', hint: 'The support team will approve a refund, ask a follow-up question, or close the request. This conversation will update after their decision.' };
    case 'RECONCILING': return { title: 'Checking payment status', hint: 'The result needs review. We will not automatically issue another refund.' };
    case 'CLOSED': return { title: current?.outcome === 'REFUNDED' ? 'Refund confirmed' : 'Conversation closed', hint: current?.outcome === 'REFUNDED' ? 'Demo complete. No real money moved.' : 'This case is closed. Start a new conversation for another request.' };
    default: return { title: 'Payment support', hint: 'Tell us what happened with your payment.' };
  }
}
