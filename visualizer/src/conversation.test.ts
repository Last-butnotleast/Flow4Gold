import { describe, it, expect } from 'vitest';
import { conversationEntries, conversationStatus } from './conversation';
import type { CaseEvent, LiveCase } from './live';
const event = (type:string, payload:Record<string,unknown>, sequence=1): CaseEvent => ({eventId:`e-${sequence}`,type,payload,sequence});
describe('customer conversation from recorded facts',()=>{
  it('shows messages in order and the actual follow-up question',()=>{
    const entries = conversationEntries([event('CUSTOMER_REPLIED',{message:'Order 1042'},3),event('RECEIVED',{message:'Help with my payment'},1),event('NEED_MORE_INFO',{question:'Which order was charged twice?'},2)]);
    expect(entries.map(e=>[e.actor,e.text])).toEqual([['customer','Help with my payment'],['support','Which order was charged twice?'],['customer','Order 1042']]);
  });
  it('does not claim Discord delivery or successful payment on proposal/approval',()=>{
    const entries=conversationEntries([event('REFUND_RECOMMENDED',{amount:25,currency:'EUR'}),event('APPROVED',{},2),event('ACTION_COMPLETED',{},3)]);
    expect(entries).toHaveLength(2);
    expect(entries[0].facts?.amount).toBe(25);
    expect(entries.map(e=>e.text).join(' ')).not.toMatch(/sent|confirmed/);
  });
  it('labels confirmation as simulated and distinguishes rejected closure',()=>{
    expect(conversationEntries([event('REFUND_CONFIRMED',{})])[0].text).toContain('No money moved');
    expect(conversationEntries([event('REJECTED',{})])[0].text).toContain('declined');
    expect(conversationStatus({state:'CLOSED',outcome:'REJECTED'} as LiveCase).title).toBe('Conversation closed');
  });
  it('keeps customer and approval roles distinct',()=>{
    expect(conversationStatus({state:'AWAITING_APPROVAL'} as LiveCase).hint).toContain('support team');
    expect(conversationStatus({state:'AWAITING_APPROVAL'} as LiveCase).hint).not.toContain('Discord');
    expect(conversationEntries([event('ESCALATE',{reason:'Internal service error'})])[0].text).not.toContain('service error');
  });
});
describe('human review conversation',()=>{
  it('shows the real reviewer question as the support team without inventing an identity',()=>{
    const question={...event('NEED_MORE_INFO',{reviewEventId:'review-1',message:'Was the charge settled?'},3),taskInvocationId:'review-1:human_review'};
    expect(conversationEntries([question])[0]).toMatchObject({actor:'team',text:'Was the charge settled?'});
    expect(conversationEntries([event('NEED_MORE_INFO',{question:'Which order?'})])[0].actor).toBe('support');
  });
  it('shows the specific reviewer-approved proposal and records a waiting review as actionable',()=>{
    const proposal={amount:25,currency:'EUR',paymentReference:'demo-payment-1042'};
    const entry=conversationEntries([event('REVIEW_APPROVED',{reviewEventId:'review-1',proposal,message:'We reviewed the duplicate charge.'})])[0];
    expect(entry).toMatchObject({actor:'team',facts:proposal,text:'We reviewed the duplicate charge.'});
    expect(conversationStatus({state:'HUMAN_REVIEW',machine:{states:{HUMAN_REVIEW:{tasks:['human_review']}}}} as unknown as LiveCase).hint).not.toContain('pauses');
    expect(conversationStatus({state:'HUMAN_REVIEW',machine:{states:{HUMAN_REVIEW:{tasks:['human_review']}}}} as unknown as LiveCase).hint).toContain('follow-up question');
  });
});
