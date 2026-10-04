import {compiledWorkflow} from '../../scripts/build-core.mjs';
export const workflow=await compiledWorkflow();
export const node=name=>{const found=workflow.nodes.find(node=>node.name===name);if(!found)throw Error('Missing node '+name);return found;};
export const execute=(name,items,previous={})=>new Function('$input','$',node(name).parameters.jsCode)({all:()=>items.map(json=>({json}))},key=>({all:()=>previous[key].map(json=>({json})),first:()=>({json:previous[key][0]})}));
export const parcel={machine:'parcel',version:1,initial:'OPEN',states:{OPEN:{on:{START:{target:'WORKING'},CANCEL:{target:'CLOSED',outcome:'CANCELLED'}}},WORKING:{tasks:['work'],on:{DONE:{target:'CLOSED',outcome:'DONE',taskResult:true},QUESTION:{target:'WAITING',taskResult:true},CANCEL:{target:'CLOSED',outcome:'CANCELLED'}}},WAITING:{on:{REPLY:{target:'WORKING'}}},CLOSED:{final:true}}};
export const catalog=definitions=>definitions.map(definition=>({machine:definition.machine,version:definition.version,definition:JSON.stringify(definition)}));
export function plan(request,rows=[],definitions=[parcel]){const prepared=execute('Prepare Event',[request])[0].json;const loaded=execute('Load Machine Definitions',catalog(definitions),{'Prepare Event':[prepared]})[0].json;return execute('Plan Transition',rows,{'Load Machine Definitions':[loaded]})[0].json;}
export const start=(overrides={})=>({caseId:'case-1',eventId:'start',type:'START',machine:'parcel',machineVersion:1,...overrides});
export function callback(trigger,task,type,payload={}){const taskInvocationId=trigger.eventId+':'+task;return{caseId:trigger.caseId,eventId:taskInvocationId+':result',taskInvocationId,causationId:trigger.eventId,correlationId:trigger.correlationId,type,payload};}
