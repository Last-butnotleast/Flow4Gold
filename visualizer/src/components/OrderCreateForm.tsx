import {useState,type FormEvent} from 'react';
import {LoaderCircle,Plus} from 'lucide-react';
import {api} from '../live';
import type {DemoOrder} from '../orders';
export function OrderCreateForm({onCreated,onCancel}:{onCreated:(order:DemoOrder)=>void;onCancel:()=>void}){
  const [saving,setSaving]=useState(false);
  const [saveError,setSaveError]=useState('');
  const [itemName,setItemName]=useState('');
  const [amount,setAmount]=useState('');
  const [currency,setCurrency]=useState('EUR');
  const [duplicate,setDuplicate]=useState(true);
  async function save(event:FormEvent) {
    event.preventDefault(); if(saving) return;
    setSaving(true);setSaveError('');
    try {
      const result=await api<{order:DemoOrder}>('/api/orders',{itemName:itemName.trim(),amount:Number(amount),currency:currency.trim().toUpperCase(),duplicateCharge:duplicate});
      onCreated(result.order);setItemName('');setAmount('');
    } catch(error) {setSaveError(error instanceof Error ? error.message : 'Could not create the sample order.');}
    finally {setSaving(false);}
  }
  return <form className="create-order-form" onSubmit={save} aria-label="Create sample order">
        <h3>New fictional payment</h3>
        <label>Item name<input required maxLength={120} value={itemName} disabled={saving} onChange={e=>setItemName(e.target.value)} placeholder="e.g. Canvas backpack"/></label>
        <div className="order-amount-fields"><label>Amount per charge<input type="number" min="0.01" step="0.01" required value={amount} disabled={saving} onChange={e=>setAmount(e.target.value)} placeholder="25.00"/></label><label>Currency<input required pattern="[A-Za-z]{3}" maxLength={3} value={currency} disabled={saving} onChange={e=>setCurrency(e.target.value.toUpperCase())}/></label></div>
        <label className="order-checkbox"><input type="checkbox" checked={duplicate} disabled={saving} onChange={e=>setDuplicate(e.target.checked)}/>This payment was charged twice</label>
        <p>The amount is one payment. A duplicate can justify refunding that amount; a single charge requires review.</p>
        {saveError && <p className="live-error" role="alert">{saveError}</p>}
        <div className="order-form-actions"><button className="button" disabled={saving || !itemName.trim()}>{saving ? <LoaderCircle size={13} className="spin"/> : <Plus size={13}/>}Create sample order</button><button type="button" className="button" disabled={saving} onClick={onCancel}>Cancel</button></div>
      </form>;
}
