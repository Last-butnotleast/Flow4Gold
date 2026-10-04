import {describe,it,expect} from 'vitest';
import {screenFromSearch,addRecentCase,attachToNewDraft} from './workspace';
import {graphBounds} from './graphViewport';
import type {StateFlowNode,EventFlowEdge} from './graph';
describe('workspace navigation and drafts',()=>{
  it('defaults to the demo and preserves old live-link behavior',()=>{expect(screenFromSearch('')).toBe('demo');expect(screenFromSearch('?mode=live&case=abc')).toBe('demo');expect(screenFromSearch('?view=explorer')).toBe('explorer');expect(screenFromSearch('?view=orders')).toBe('orders');expect(screenFromSearch('?view=contestant')).toBe('contestant');expect(screenFromSearch('?view=admin')).toBe('admin');});
  it('attaches an order to the existing unsent draft without changing text',()=>{const draft={message:'Please help with my payment',orderReference:'old'};expect(attachToNewDraft(draft,'new')).toEqual({message:draft.message,orderReference:'new'});expect(draft.orderReference).toBe('old');});
  it('creates an empty draft when there was none',()=>{expect(attachToNewDraft(undefined,'1042')).toEqual({message:'',orderReference:'1042'});});
  it('keeps browser recent cases bounded and moves existing case to the front',()=>{const prior=Array.from({length:12},(_,i)=>({caseId:`case-${i}`}));const next=addRecentCase(prior,{caseId:'case-6',state:'CLOSED'});expect(next).toHaveLength(12);expect(next[0]).toEqual({caseId:'case-6',state:'CLOSED'});expect(next.filter(item=>item.caseId==='case-6')).toHaveLength(1);expect(addRecentCase(next,{caseId:'new'})).toHaveLength(12);});
});
describe('graph viewport includes complete event routes',()=>{
  it('fits return edges and long labels outside the node bounds',()=>{
    const nodes=[{id:'n',position:{x:100,y:100},width:216,height:80,data:{}}] as StateFlowNode[];
    const edges=[{id:'e',source:'n',target:'n',data:{event:'CUSTOMER_REPLIED',kind:'on',points:[{x:-100,y:140},{x:200,y:400}],labelPosition:{x:-100,y:250}}}] as EventFlowEdge[];
    const bounds=graphBounds({nodes,edges});expect(bounds.x).toBeLessThan(-170);expect(bounds.y).toBeLessThan(100);expect(bounds.x+bounds.width).toBeGreaterThan(316);expect(bounds.y+bounds.height).toBeGreaterThan(400);
  });
});
