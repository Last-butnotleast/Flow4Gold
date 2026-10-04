import type {StateFlowNode,EventFlowEdge} from './graph';
// Include routed return edges and their labels; node-only fit clips valid paths.
export function graphBounds(graph:{nodes:StateFlowNode[];edges:EventFlowEdge[]}) {
  const points=graph.nodes.flatMap(node=>[node.position,{x:node.position.x+(node.width??216),y:node.position.y+(node.height??80)}]);
  for(const edge of graph.edges){points.push(...(edge.data?.points??[]));const label=edge.data?.labelPosition;if(label){const half=Math.max(56,(edge.data?.event.length??0)*7.5+30)/2;points.push({x:label.x-half,y:label.y-14},{x:label.x+half,y:label.y+14});}}
  if(!points.length)return {x:0,y:0,width:1,height:1};
  const x=Math.min(...points.map(p=>p.x))-20,y=Math.min(...points.map(p=>p.y))-45;
  return {x,y,width:Math.max(...points.map(p=>p.x))-x+20,height:Math.max(...points.map(p=>p.y))-y+45};
}
