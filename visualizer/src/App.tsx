import {useEffect,useMemo,useState} from 'react';
import {ReactFlowProvider} from '@xyflow/react';
import {Layers2,MessagesSquare,Package,GitBranch,Plus,SlidersHorizontal,ArrowUpRight} from 'lucide-react';
import {api,casePath,type LiveCase} from './live';
import {parseMachine,type Machine} from './machine';
import latest from '../../machines/customer-refund.v1.json';
import {LivePanel} from './components/LivePanel';
import {LiveGraph} from './components/LiveGraph';
import {CaseInspector} from './components/CaseInspector';
import {SampleOrders} from './components/SampleOrders';
import MachineExplorer from './MachineExplorer';
import type {DemoOrder} from './orders';
import {screenFromSearch,addRecentCase,attachToNewDraft,type Screen,type Draft,type RecentCase} from './workspace';
const emptyDraft:Draft={message:'',orderReference:''};
const pretty=(value:string)=>value.toLowerCase().replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
function savedRecent():RecentCase[]{try{const data=JSON.parse(localStorage.getItem('flow4gold-recent-cases')??'[]');return Array.isArray(data)?data.filter(item=>typeof item?.caseId==='string').slice(0,12):[];}catch{return [];}}
export default function App(){
  const [screen,setScreen]=useState<Screen>(()=>screenFromSearch(location.search));
  const [caseId,setCaseId]=useState(()=>new URLSearchParams(location.search).get('case')??'');
  const [current,setCurrent]=useState<LiveCase|null>(null),[machine,setMachine]=useState<Machine>(()=>parseMachine(latest));
  const [pending,setPending]=useState(false),[error,setError]=useState('');
  const [drafts,setDrafts]=useState<Record<string,Draft>>({});
  const [recent,setRecent]=useState<RecentCase[]>(savedRecent),[openId,setOpenId]=useState('');
  const [orders,setOrders]=useState<DemoOrder[]>([]),[ordersLoading,setOrdersLoading]=useState(true),[ordersError,setOrdersError]=useState(''),[reload,setReload]=useState(0);
  const [inspect,setInspect]=useState(false),[selectedState,setSelectedState]=useState<string>();
  const draftKey=caseId||'new',draft=drafts[draftKey]??emptyDraft;
  const updateDraft=(next:Draft)=>setDrafts(previous=>({...previous,[draftKey]:next}));
  useEffect(()=>{const url=new URL(location.href);url.searchParams.set('view',screen);if(screen==='demo')url.searchParams.set('mode','live');else url.searchParams.delete('mode');if(caseId)url.searchParams.set('case',caseId);else url.searchParams.delete('case');history.replaceState(null,'',url);},[screen,caseId]);
  useEffect(()=>{try{localStorage.setItem('flow4gold-recent-cases',JSON.stringify(recent));}catch{/* Session navigation still works if storage is unavailable. */}},[recent]);
  useEffect(()=>{const controller=new AbortController();setOrdersLoading(true);setOrdersError('');api<{orders:DemoOrder[]}>('/api/orders',undefined,controller.signal).then(data=>{if(!controller.signal.aborted)setOrders(data.orders);}).catch(e=>{if(!controller.signal.aborted)setOrdersError(e.message);}).finally(()=>{if(!controller.signal.aborted)setOrdersLoading(false);});return()=>controller.abort();},[reload]);
  useEffect(()=>{const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
    async function refresh(){try{if(caseId){const next=await api<LiveCase>(`/api/cases/${encodeURIComponent(caseId)}`,undefined,controller.signal);const definition=parseMachine(next.machine);casePath(definition,next.events);if(controller.signal.aborted)return;setMachine(previous=>previous.version===definition.version&&previous.machine===definition.machine?previous:definition);setCurrent(previous=>previous?.caseId===next.caseId&&previous.sequence>next.sequence?previous:next);setRecent(previous=>previous[0]?.caseId===next.caseId&&previous[0]?.state===next.state?previous:addRecentCase(previous,{caseId:next.caseId,state:next.state}));setError('');if(!definition.states[next.state]?.final)timer=setTimeout(refresh,3000);}else{const config=await api<{machine:Machine}>('/api/config',undefined,controller.signal);if(!controller.signal.aborted){setMachine(parseMachine(config.machine));setError('');}}}catch(e){if(!controller.signal.aborted){setError(e instanceof Error?e.message:'Could not load this case.');if(caseId)timer=setTimeout(refresh,6000);}}}
    void refresh();return()=>{controller.abort();clearTimeout(timer);};
  },[caseId]);
  function openCase(id:string){if(pending||!id.trim())return;setCaseId(id.trim());if(id.trim()!==caseId)setCurrent(null);setError('');setScreen('demo');setRecent(previous=>addRecentCase(previous,{caseId:id.trim()}));}
  function newCase(){if(pending)return;setCaseId('');setCurrent(null);setError('');setDrafts(previous=>({...previous,new:emptyDraft}));setScreen('demo');}
  async function startCase(message:string,orderReference:string){setPending(true);setError('');try{const result=await api<{caseId:string}>('/api/cases',{message,orderReference:orderReference||undefined});setCurrent(null);setCaseId(result.caseId);setRecent(previous=>addRecentCase(previous,{caseId:result.caseId}));return true;}catch(e){setError(e instanceof Error?e.message:'Could not send message.');return false;}finally{setPending(false);}}
  async function reply(message:string,orderReference:string){setPending(true);setError('');try{await api(`/api/cases/${encodeURIComponent(caseId)}/replies`,{message,orderReference:orderReference||undefined});try{const next=await api<LiveCase>(`/api/cases/${encodeURIComponent(caseId)}`);setCurrent(previous=>previous?.caseId===next.caseId&&previous.sequence>next.sequence?previous:next);}catch{/* Polling will retrieve an accepted reply. */}return true;}catch(e){setError(e instanceof Error?e.message:'Could not send reply.');return false;}finally{setPending(false);}}
  function useOrder(order:DemoOrder){if(pending)return;setDrafts(previous=>({...previous,new:attachToNewDraft(previous.new,order.orderReference)}));setCaseId('');setCurrent(null);setError('');setScreen('demo');}
  const latestEvents=useMemo(()=>current?.events.slice(-4)??[],[current]);
  const operatorRequired=current?.state==='AWAITING_APPROVAL'||current?.state==='HUMAN_REVIEW';
  const navigation:[Screen,string,typeof MessagesSquare][]=[['demo','Demo workspace',MessagesSquare],['orders','Sample orders',Package],['explorer','Machine explorer',GitBranch]];
  return <div className="product-shell">
    <header className="product-topbar"><button className="brand" onClick={()=>setScreen('demo')} aria-label="Flow4Gold home"><span className="brand-mark"><Layers2 size={20}/></span><span>flow<span className="brand-number">4</span>gold<span className="brand-dot">.</span></span></button><nav aria-label="Workspace navigation">{navigation.map(([id,label,Icon])=><button key={id} className={screen===id?'active':''} aria-current={screen===id?'page':undefined} onClick={()=>setScreen(id)}><Icon size={15}/><span>{label}</span></button>)}</nav><span className="simulation-pill">SIMULATED PAYMENTS</span></header>
    <div className="product-screen demo-screen" hidden={screen!=='demo'}>
      <section className="demo-case-toolbar"><div className="case-toolbar-title"><span className="eyebrow">LIVE DEMO</span><h1>Payment support, with a process.</h1></div><div className="case-toolbar-controls"><label>Conversation<select aria-label="Recent conversations in this browser" value={caseId} disabled={pending} onChange={e=>e.target.value?openCase(e.target.value):newCase()}><option value="">New conversation</option>{caseId&&!recent.some(item=>item.caseId===caseId)&&<option value={caseId}>{caseId}</option>}{recent.map(item=><option key={item.caseId} value={item.caseId}>{item.caseId}{item.state?` · ${pretty(item.state)}`:''}</option>)}</select></label><button className="button" disabled={pending} onClick={newCase}><Plus size={14}/>New case</button><details className="open-case-menu"><summary>Open by ID</summary><form onSubmit={event=>{event.preventDefault();openCase(openId);event.currentTarget.closest('details')?.removeAttribute('open');}}><label>Case ID<input aria-label="Existing case ID" value={openId} onChange={e=>setOpenId(e.target.value)}/></label><button className="button" disabled={pending||!openId.trim()}>Open</button><small>Recent conversations are saved in this browser only.</small></form></details></div></section>
      <div className="case-state-bar"><span className="case-state-pill"><i/>{current?pretty(current.state):caseId?'Loading case…':'Ready for a new case'}</span><span>{current?`${current.events.length} recorded events · machine v${current.machine.version}`:'AI interprets. The machine controls. People approve.'}</span><button className="button quiet" onClick={()=>{setSelectedState(undefined);setInspect(true);}}><SlidersHorizontal size={14}/>Inspect case</button></div>
      <main className="demo-workspace">
        <LivePanel current={current} selectedCaseId={caseId} pending={pending} error={error} draft={draft} onDraft={updateDraft} orders={orders} ordersError={ordersError} onOrders={()=>setScreen('orders')} onStart={startCase} onReply={reply}/>
        <section className="process-pane" aria-label="Process and operator actions">
          <div className={`operator-action ${operatorRequired?'needs-action':''}`} aria-label="Operator action"><span className="operator-icon">{operatorRequired?'!':'✓'}</span><div><span className="eyebrow">OPERATOR · SEPARATE FROM CUSTOMER</span><strong>{operatorRequired?current?.state==='AWAITING_APPROVAL'?'Your approval is needed in Discord':'Team review is needed in Discord':'Human decisions happen in Discord'}</strong><p>{operatorRequired?'Open this case’s review link in the configured Discord channel. The customer conversation will update after your decision.':'The customer can describe a problem. Only the review task can return a human decision.'}</p></div>{operatorRequired&&<ArrowUpRight size={20}/>}</div>
          <ReactFlowProvider><LiveGraph machine={machine} current={current} onInspect={state=>{setSelectedState(state);setInspect(true);}}/></ReactFlowProvider>
        </section>
      </main>
      <footer className="activity-strip" aria-label="Recent activity"><span className="eyebrow">ACTIVITY</span>{latestEvents.length?latestEvents.map(event=><button key={event.eventId} onClick={()=>{setSelectedState(undefined);setInspect(true);}}><span>{event.sequence}</span>{pretty(event.type)}</button>):<p>Send a message to start. Accepted events will appear here.</p>}<span className="activity-live"><i/>Live updates</span></footer>
    </div>
    <div className="product-screen" hidden={screen!=='orders'}><SampleOrders pending={pending} orders={orders} loading={ordersLoading} error={ordersError} onReload={()=>setReload(value=>value+1)} onCreated={order=>setOrders(previous=>[...previous.filter(item=>item.orderReference!==order.orderReference),order])} onUse={useOrder}/></div>
    <div className="product-screen explorer-screen" hidden={screen!=='explorer'}><ReactFlowProvider><MachineExplorer/></ReactFlowProvider></div>
    <CaseInspector open={inspect} current={current} machine={machine} selectedState={selectedState} onClose={()=>setInspect(false)}/>
  </div>;
}
