import { describe, expect, it, vi, afterEach } from 'vitest';
import { api, casePath, type CaseEvent } from './live';
import { parseMachine } from './machine';
import v2 from '../../machines/customer-refund.v2.json';
const machine = parseMachine(v2);
const events = (types: string[]): CaseEvent[] => types.map((type,index) => ({eventId:`event-${index}`,type,sequence:index+1,payload:{}}));
afterEach(()=>vi.unstubAllGlobals());
describe('live event graph',()=>{
  it('follows accepted events in sequence using the case machine',()=>{
    const history = events(['RECEIVED','REFUND_RECOMMENDED','APPROVED','ACTION_COMPLETED','REFUND_CONFIRMED']);
    const path = casePath(machine,[...history].reverse());
    expect(path.state).toBe('CLOSED');
    expect(path.visited.has('WAITING_CUSTOMER')).toBe(false);
    expect(path.transitions.has('AWAITING_APPROVAL:APPROVED:EXECUTING')).toBe(true);
    expect(history[0].type).toBe('RECEIVED');
  });
  it('retains both customer clarification passes in the traveled path',()=>{
    const path=casePath(machine,events(['RECEIVED','NEED_MORE_INFO','CUSTOMER_REPLIED','REFUND_RECOMMENDED']));
    expect(path.state).toBe('AWAITING_APPROVAL');
    expect(path.transitions.has('WAITING_CUSTOMER:CUSTOMER_REPLIED:INVESTIGATING')).toBe(true);
    expect(path.visited.has('WAITING_CUSTOMER')).toBe(true);
  });
  it('does not invent a path for invalid history',()=>{
    expect(()=>casePath(machine,events(['APPROVED']))).toThrow('Cannot display event');
  });
});
describe('browser bridge',()=>{
  it('submits only to the local API without instance credentials',async()=>{
    const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({caseId:'demo'})});vi.stubGlobal('fetch',fetcher);
    await expect(api('/api/cases',{message:'hello'})).resolves.toEqual({caseId:'demo'});
    expect(fetcher).toHaveBeenCalledWith('/api/cases',expect.objectContaining({method:'POST',headers:{'Content-Type':'application/json'},body:'{"message":"hello"}'}));
  });
  it('shows bridge errors rather than accepting rejected requests',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:400,json:async()=>({error:'Message is required'})}));
    await expect(api('/api/cases',{})).rejects.toThrow('Message is required');
  });
});
