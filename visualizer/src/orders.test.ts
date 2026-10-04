import {describe,it,expect} from 'vitest';
import {exampleDraft,orderMoney,type DemoOrder} from './orders';
const orders:DemoOrder[]=[
  {orderReference:'1042',itemName:'Mug',amount:25,currency:'EUR',paymentReference:'p1',duplicateCharge:true},
  {orderReference:'custom-order',itemName:'Bag',amount:40,currency:'EUR',paymentReference:'p2',duplicateCharge:false},
];
describe('demo order examples',()=>{
  it('preserves the selected fictional order instead of falling back to seed1042',()=>{
    expect(exampleDraft('duplicate','custom-order',orders)).toEqual({message:'I was charged twice for order custom-order. Please refund the duplicate payment.',orderReference:'custom-order'});
  });
  it('uses an available duplicate sample when no order is selected',()=>{
    expect(exampleDraft('duplicate','',[orders[1],orders[0]]).orderReference).toBe('1042');
  });
  it('does not invent a seed when the table is empty',()=>{
    expect(exampleDraft('duplicate','',[])).toEqual({message:'I was charged twice. Please refund the duplicate payment.',orderReference:''});
  });
  it('missing-information example deliberately removes the attached reference',()=>{
    expect(exampleDraft('missing','custom-order',orders).orderReference).toBe('');
  });
  it('boundary test requests5000 but preserves selected reference and record amount',()=>{
    const before=structuredClone(orders);
    const draft=exampleDraft('boundary','custom-order',orders);
    expect(draft.message).toContain('EUR 5,000');expect(draft.message).toContain('order custom-order');expect(draft.orderReference).toBe('custom-order');expect(orders).toEqual(before);
  });
  it('preserves unknown references for honest missing-record scenarios',()=>{
    expect(exampleDraft('duplicate','unknown',orders).orderReference).toBe('unknown');
  });
  it('formats the recorded amount, independent of customer text',()=>{
    expect(orderMoney(orders[1])).toContain('40.00');
  });
});
