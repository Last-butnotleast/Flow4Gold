import {useEffect,useMemo,useRef,useState} from 'react';
import {Background,BackgroundVariant,ReactFlow,MarkerType,useReactFlow} from '@xyflow/react';
import {Expand,LoaderCircle,Minus,Plus} from 'lucide-react';
import {StateNode} from './StateNode';
import {EventEdge} from './EventEdge';
import {graphBounds} from '../graphViewport';
import type {Machine} from '../machine';
import type {StateFlowNode,EventFlowEdge} from '../graph';
import {casePath,type LiveCase} from '../live';
const nodeTypes={state:StateNode},edgeTypes={event:EventEdge};
export function LiveGraph({machine,current,onInspect}:{machine:Machine;current:LiveCase|null;onInspect:(state?:string)=>void}) {
  const [graph,setGraph]=useState<{nodes:StateFlowNode[];edges:EventFlowEdge[]}>({nodes:[],edges:[]});
  const [error,setError]=useState('');
  const host=useRef<HTMLDivElement>(null);
  const {fitBounds,zoomIn,zoomOut}=useReactFlow();
  const path=useMemo(()=>current ? casePath(current.machine,current.events) : null,[current]);
  useEffect(()=>{let stale=false;setError('');import('../graph').then(m=>m.layoutMachine(machine)).then(result=>{if(!stale)setGraph(result);}).catch(e=>{if(!stale)setError(e.message);});return()=>{stale=true;};},[machine]);
  useEffect(()=>{const element=host.current;if(!element)return;let timer:ReturnType<typeof setTimeout>;
    const fit=()=>{clearTimeout(timer);if(element.clientWidth&&element.clientHeight)timer=setTimeout(()=>void fitBounds(graphBounds(graph),{padding:0.08,duration:200}),120);};
    const observer=new ResizeObserver(fit);observer.observe(element);fit();return()=>{observer.disconnect();clearTimeout(timer);};
  },[fitBounds,graph]);
  const nodes=graph.nodes.map(node=>({...node,className:path ? node.id===current?.state ? 'is-current-state' : path.visited.has(node.id) ? 'is-visited-state' : 'is-unvisited-state' : ''}));
  const edges=graph.edges.map(edge=>{const traveled=path?.transitions.has(`${edge.source}:${edge.data?.event}:${edge.target}`);const color=traveled?'#218569':edge.data?.kind==='decide'?'#9b7bc6':'#a4afb5';return {...edge,markerEnd:{type:MarkerType.ArrowClosed,color,width:16,height:16},style:{stroke:color,strokeWidth:traveled?3:1.3},data:{...edge.data!,onSelect:()=>onInspect(edge.source)}};});
  return <div ref={host} className="live-graph" aria-label="Live process graph">
    <div className="graph-caption"><span className="eyebrow">THE PROCESS</span><span>Customer refund · v{machine.version}</span></div>
    {error && <p className="live-error" role="alert">{error}</p>}
    {!graph.nodes.length && !error && <div className="loading"><LoaderCircle className="spin" size={20}/>Arranging process…</div>}
    <ReactFlow<StateFlowNode,EventFlowEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodeClick={(_,node)=>onInspect(node.id)} nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} elementsSelectable={false} deleteKeyCode={null} minZoom={0.15} maxZoom={1.8} fitView fitViewOptions={{padding:0.13,maxZoom:1}}><Background variant={BackgroundVariant.Dots} gap={22} size={1.1} color="#dcded9"/></ReactFlow>
    <div className="canvas-bottom"><div className="live-graph-legend"><span><i/>Current state</span><span>Green path = recorded events</span></div><div className="zoom-controls"><button aria-label="Zoom out" onClick={()=>void zoomOut()}><Minus size={15}/></button><button aria-label="Zoom in" onClick={()=>void zoomIn()}><Plus size={15}/></button><button aria-label="Fit live graph" onClick={()=>void fitBounds(graphBounds(graph),{padding:0.08,duration:250})}><Expand size={16}/></button></div></div>
  </div>;
}
