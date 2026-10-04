import {useEffect,useRef} from 'react';
import {ExternalLink,X} from 'lucide-react';
import type {LiveCase} from '../live';
import type {Machine} from '../machine';
const pretty=(value:string)=>value.toLowerCase().replaceAll('_',' ');
export function CaseInspector({open,current,machine,selectedState,onClose}:{open:boolean;current:LiveCase|null;machine:Machine;selectedState?:string;onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(open)ref.current?.showModal();else ref.current?.close();},[open]);
  return <dialog ref={ref} className="case-inspector-drawer" aria-label="Case inspection" onCancel={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <header><div><span className="eyebrow">BEHIND THE SCENES</span><h2>Case inspection</h2></div><button className="icon-button" aria-label="Close case inspection" onClick={onClose}><X size={18}/></button></header>
    <div className="case-inspector-body">
      <section><h3>Recorded case state</h3><strong>{current ? pretty(current.state) : 'No case started'}</strong><p className="case-reference">{current?.caseId ?? 'Send a customer message to begin.'}</p>{current?.outcome && <p>Outcome: {current.outcome}</p>}</section>
      {selectedState && <section className="definition-selection"><span className="eyebrow">SELECTED DEFINITION · NOT CASE STATE</span><h3>{pretty(selectedState)}</h3><p>Tasks: {machine.states[selectedState]?.tasks?.join(', ') || 'None'}</p><pre>{JSON.stringify(machine.states[selectedState],null,2)}</pre></section>}
      <section className="event-timeline"><h3>Recorded events · {current?.events.length ?? 0}</h3><ol>{current?.events.map(event=><li key={event.eventId}><span className="sequence-number">{event.sequence}</span><div><strong>{pretty(event.type)}</strong>{event.createdAt && <p>{new Date(event.createdAt).toLocaleTimeString()}</p>}{typeof event.payload.reason==='string'&&<p>{event.payload.reason}</p>}{event.payload.decision && typeof event.payload.decision==='object' ? <div className="decision-summary"><span>Bounded AI decision · model probabilities</span><pre>{JSON.stringify(event.payload.decision,null,2)}</pre></div>:null}<details><summary>Payload & event IDs</summary><pre>{JSON.stringify(event,null,2)}</pre></details></div></li>)}</ol></section>
      {current?.receipt && <section><h3>Simulated receipt</h3><pre>{JSON.stringify(current.receipt,null,2)}</pre></section>}
      {!!current?.taskLinks?.length && <section className="live-task-links"><h3>Workflows in n8n</h3>{current.taskLinks.map(link=><a key={link.task} href={link.url} target="_blank" rel="noreferrer">{pretty(link.task)}<ExternalLink size={13}/></a>)}</section>}
    </div>
  </dialog>;
}
