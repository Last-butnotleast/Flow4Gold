import {useEffect,useRef,useState,type FormEvent} from 'react';
import {LoaderCircle,Send} from 'lucide-react';
import type {LiveCase} from '../live';
import {exampleDraft,orderMoney,type DemoOrder,type DemoExample} from '../orders';
import {conversationEntries,conversationStatus} from '../conversation';
export interface ChatDraft {message:string;orderReference:string}
const labels:Record<string,string>={amount:'Amount',currency:'Currency',paymentReference:'Payment',reason:'Reason',receiptId:'Receipt',orderReference:'Order'};
function Facts({value}:{value:Record<string,unknown>}){return <dl className="live-facts">{Object.entries(value).filter(([key,val])=>key in labels&&val!==undefined).map(([key,val])=><div key={key}><dt>{labels[key]}</dt><dd>{String(val)}</dd></div>)}</dl>;}
export function LivePanel({current,selectedCaseId,pending,error,draft,onDraft,orders,ordersError,onOrders,onStart,onReply}:{
  current:LiveCase|null;selectedCaseId:string;pending:boolean;error:string;draft:ChatDraft;onDraft:(draft:ChatDraft)=>void;
  orders:DemoOrder[];ordersError:string;onOrders:()=>void;onStart:(message:string,reference:string)=>Promise<boolean>;onReply:(message:string,reference:string)=>Promise<boolean>;
}){
  const [awaitingSequence,setAwaitingSequence]=useState<number|null>(null);
  const thread=useRef<HTMLDivElement>(null),composer=useRef<HTMLTextAreaElement>(null),nearBottom=useRef(true),submitting=useRef(false);
  const entries=conversationEntries(current?.events??[]),status=conversationStatus(current);
  const selectedOrder=orders.find(order=>order.orderReference===draft.orderReference);
  const loadingCase=!!selectedCaseId&&!current;
  const awaitingRefresh=awaitingSequence!==null&&current?.sequence===awaitingSequence;
  const canWrite=!selectedCaseId||current?.state==='WAITING_CUSTOMER';
  const busy=pending||loadingCase||awaitingRefresh;
  useEffect(()=>{setAwaitingSequence(null);nearBottom.current=true;},[selectedCaseId]);
  useEffect(()=>{if(thread.current&&nearBottom.current)thread.current.scrollTop=thread.current.scrollHeight;},[selectedCaseId,current?.sequence,current?.state]);
  const useExample=(kind:DemoExample)=>{const next=exampleDraft(kind,draft.orderReference,orders);onDraft(next);composer.current?.focus();};
  const submit=async(event:FormEvent)=>{event.preventDefault();if(busy||!canWrite||!draft.message.trim()||submitting.current)return;
    submitting.current=true;const sequence=current?.sequence;
    try{const accepted=await(current?onReply(draft.message.trim(),draft.orderReference.trim()):onStart(draft.message.trim(),draft.orderReference.trim()));if(accepted){onDraft({message:'',orderReference:''});if(sequence!==undefined)setAwaitingSequence(sequence);}}
    finally{submitting.current=false;}
  };
  return <section className="live-panel chat-panel" aria-label="Customer conversation">
    <header className="chat-header"><span className="eyebrow">CUSTOMER</span><h2>Payment support</h2><p>One conversation. Every step accounted for.</p></header>
    <div className="conversation-scroll" ref={thread} onScroll={e=>{const el=e.currentTarget;nearBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<70;}}>
      <div className="conversation-thread" role="log" aria-label="Conversation messages" aria-live="polite" aria-relevant="additions text">
        {!selectedCaseId&&<div className="chat-welcome"><span className="welcome-symbol">↗</span><h3>Let’s sort out your payment.</h3><p>Choose an order below and tell us what happened. Or start with a question.</p><div className="example-buttons"><button type="button" disabled={pending} onClick={()=>useExample('duplicate')}>Duplicate charge</button><button type="button" disabled={pending} onClick={()=>useExample('missing')}>Missing information</button></div><details className="demo-test"><summary>Try an AI boundary test</summary><p>Ask for €5,000 without approval. The payment record still controls the amount.</p><button type="button" className="button" disabled={pending} onClick={()=>useExample('boundary')}>Use demo test</button></details></div>}
        {loadingCase&&<p className="chat-progress"><LoaderCircle size={14} className="spin"/>Loading conversation…</p>}
        {entries.map(entry=><article className={`chat-message chat-${entry.actor}`} key={entry.id}><span className="chat-actor">{entry.actor==='customer'?'You · customer':entry.actor==='support'?'Flow4Gold · support':entry.actor==='team'?'Support team':'Case update'}</span><div className="chat-bubble"><p>{entry.text}</p>{entry.title&&<h3>{entry.title}</h3>}{entry.facts&&<Facts value={entry.facts}/>}</div></article>)}
        {current&&<div className="conversation-status" role="status"><span className={`status-dot ${['INVESTIGATING','EXECUTING','VERIFYING'].includes(current.state)?'working':''}`}/><div><strong>{status.title}</strong><p>{status.hint}</p></div></div>}
      </div>
    </div>
    <form onSubmit={submit} className="live-form chat-composer" aria-label="Message composer" aria-busy={busy}>
      {error&&<p className="live-error" role="alert">{error}</p>}
      {canWrite&&!loadingCase?<>
        <div className="compact-order-picker"><label htmlFor="attached-order-picker">Order for this message</label><div><select id="attached-order-picker" value={selectedOrder?draft.orderReference:draft.orderReference?'__manual__':''} disabled={busy} onChange={e=>onDraft({...draft,orderReference:e.target.value})}><option value="">No order attached</option>{orders.map(order=><option key={order.orderReference} value={order.orderReference}>{order.itemName} · {order.orderReference} · {orderMoney(order)}</option>)}{draft.orderReference&&!selectedOrder&&<option value="__manual__">{draft.orderReference} · manual reference</option>}</select><button type="button" className="button" onClick={onOrders} disabled={pending}>Browse</button></div></div>
        {ordersError&&<small className="order-load-error">Sample orders unavailable. Open Sample orders to retry, or enter a reference manually.</small>}
        {draft.orderReference&&<div className="attached-order" aria-label="Attached order"><div><strong>{selectedOrder?.itemName??'Manual order reference'}</strong><span>{draft.orderReference}{selectedOrder?` · ${orderMoney(selectedOrder)} per charge · ${selectedOrder.duplicateCharge?'Charged twice':'Single charge'}`:''}</span></div><button type="button" className="button" disabled={busy} aria-label="Remove attached order" onClick={()=>onDraft({...draft,orderReference:''})}>×</button></div>}
        <label htmlFor="customer-message">{current?'Your reply':'Your message'}</label><textarea id="customer-message" ref={composer} required maxLength={4000} disabled={busy} value={draft.message} onChange={e=>onDraft({...draft,message:e.target.value})} rows={3} placeholder={current?'Reply to the support team…':'Tell us what happened…'} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/>
        <details className="order-field"><summary>Enter a reference manually</summary><label>Order reference<input value={draft.orderReference} disabled={busy} onChange={e=>onDraft({...draft,orderReference:e.target.value})} maxLength={80}/></label></details>
        <div className="composer-actions"><small>Enter to send · Shift + Enter for a new line</small><button className="button start-case" disabled={busy||!draft.message.trim()}>{busy?<LoaderCircle size={15} className="spin"/>:<Send size={15}/>} {busy?'Sending…':'Send'}</button></div>
      </>:<div className="composer-paused">{loadingCase?'Loading saved messages…':current?.state==='CLOSED'?'This conversation is closed. Start a new case above.':'No customer reply needed right now.'}</div>}
      {awaitingRefresh&&<small role="status">Message accepted. Updating the conversation…</small>}
    </form>
  </section>;
}
