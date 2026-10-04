import {readFile,writeFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {TypeScriptParser,WorkflowBuilder} from '@n8n-as-code/transformer';
export const workflowPath='workflows/flow4gold/competition-gateway.workflow.ts';
export const gatewayCode={
prepare:`const items=$input.all();
if(items.length!==1)throw new Error('Submit one competition request.');
const envelope=items[0].json;
const mappings={register:'VJci6tpJ4SncQfbJ',contestant:'AH4T3dkJyEBoMCFe',organizer:'II9743VhDIHuMPiO'};
if(!envelope||typeof envelope!=='object'||Array.isArray(envelope)||Object.keys(envelope).some(key=>!['adapter','input'].includes(key))||!Object.hasOwn(mappings,envelope.adapter))throw new Error('Unknown competition adapter.');
const input=envelope.input;
if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Adapter input must be an object.');
if((input.machine!==undefined&&input.machine!=='flow4gold-submission')||(input.machineVersion!==undefined&&input.machineVersion!==1))throw new Error('Unsupported competition machine.');
return [{json:{adapter:envelope.adapter,workflowId:mappings[envelope.adapter],input:{...input,mode:'preview',machine:'flow4gold-submission',machineVersion:1}}}];`,
input:`return [{json:$('Prepare Adapter').first().json.input}];`,
batch:`const items=$input.all();if(items.length!==1)throw new Error('Adapter must return one event batch.');
const preview=items[0].json;const prepared=$('Prepare Adapter').first().json;
if(preview.mode!=='preview'||preview.persisted!==false||!Array.isArray(preview.events)||preview.events.length!==(prepared.adapter==='register'?2:1))throw new Error('Unexpected adapter event batch.');
const keys=['eventId','caseId','machine','machineVersion','type','payload','correlationId','causationId'];
const events=preview.events;
const ids=new Set();
for(const [index,event] of events.entries()){
 if(!event||typeof event!=='object'||Array.isArray(event)||Object.keys(event).some(key=>!keys.includes(key)))throw new Error('Unexpected event fields.');
 if(event.caseId!==prepared.input.caseId||event.correlationId!==prepared.input.correlationId||event.machine!=='flow4gold-submission'||event.machineVersion!==1)throw new Error('Adapter event identity mismatch.');
 if(typeof event.eventId!=='string'||!event.eventId.trim()||typeof event.type!=='string'||!event.type.trim()||!event.payload||typeof event.payload!=='object'||Array.isArray(event.payload))throw new Error('Malformed adapter event.');
 if(ids.has(event.eventId))throw new Error('Adapter repeated an event identity.');ids.add(event.eventId);
 if(index>0&&event.causationId!==events[index-1].eventId)throw new Error('Second event must cite the first event.');
}
return [{json:{adapter:prepared.adapter,caseId:prepared.input.caseId,events,effects:preview.effects??[]}}];`,
first:`return [{json:$('Validate Event Batch').first().json.events[0]}];`,
firstResult:`const batch=$('Validate Event Batch').first().json;const result=$input.first().json;
const matched=result.caseId===batch.caseId&&result.eventId===batch.events[0].eventId;
const accepted=matched&&['applied','duplicate'].includes(result.status);
return [{json:{...batch,results:[result],continueBatch:accepted&&batch.events.length===2}}];`,
second:`return [{json:$('Record First Result').first().json.events[1]}];`,
secondResult:`const batch=$('Record First Result').first().json;return [{json:{...batch,results:[...batch.results,$input.first().json]}}];`,
finish:`const batch=$input.first().json;
const accepted=(result,index)=>result.caseId===batch.caseId&&result.eventId===batch.events[index].eventId&&['applied','duplicate'].includes(result.status);
const acceptedCount=batch.results.filter(accepted).length;
const complete=acceptedCount===batch.events.length;
const last=batch.results.at(-1);const lastIndex=batch.results.length-1;
const rejected=last?.status==='rejected'&&last.caseId===batch.caseId&&last.eventId===batch.events[lastIndex].eventId;
const status=complete?'completed':rejected?(acceptedCount?'partial':'rejected'):'uncertain';
return [{json:{mode:'persist',adapter:batch.adapter,caseId:batch.caseId,events:batch.events,results:batch.results,status,persisted:complete,partiallyPersisted:!complete&&acceptedCount>0,
 appliedCount:batch.results.filter((result,index)=>accepted(result,index)&&result.status==='applied').length,
 duplicateCount:batch.results.filter((result,index)=>accepted(result,index)&&result.status==='duplicate').length,
 unattemptedEventIds:batch.events.slice(batch.results.length).map(event=>event.eventId),effects:batch.effects,notification:{delivered:false},
 integration:{runtime:'generic-core',identity:'trusted-caller-assertion',effects:'preview-only'}}}];`,
};
export async function buildSource(){
 const nodes=[];const links=[];
 const node=(property,name,type,version,position,parameters,metadata={})=>nodes.push(`  @node(${JSON.stringify({id:`competition-gateway-${property}`,name,type:`n8n-nodes-base.${type}`,version,position,...metadata},null,2)})\n  ${property}=${JSON.stringify(parameters,null,2)};`);
 const code=(property,name,x,y,source)=>node(property,name,'code',2,[x,y],{mode:'runOnceForAllItems',jsCode:source});
 const link=(from,to,port=0)=>links.push(`    this.${from}.out(${port}).to(this.${to}.in(0));`);
 const call=(property,name,x,workflowId)=>node(property,name,'executeWorkflow',1.3,[x,0],{source:'database',workflowId:{__rl:true,value:workflowId,mode:'id'},mode:'each',options:{waitForSubWorkflow:true}},property==='RunAdapter'?{}:{onError:'continueRegularOutput'});
 node('ReceiveRequest','Trusted Internal Request','executeWorkflowTrigger',1.2,[0,0],{inputSource:'passthrough'});
 code('PrepareAdapter','Prepare Adapter',220,0,gatewayCode.prepare);
 code('AdapterInput','Adapter Input',440,0,gatewayCode.input);
 call('RunAdapter','Run Preview Adapter',660,"={{ $('Prepare Adapter').first().json.workflowId }}");
 code('ValidateBatch','Validate Event Batch',880,0,gatewayCode.batch);
 code('FirstEvent','First Event',1100,0,gatewayCode.first);
 call('ApplyFirst','Apply First Event',1320,'frF2jemAeCrcFPDe');
 code('RecordFirst','Record First Result',1540,0,gatewayCode.firstResult);
 node('ContinueBatch','Continue Batch?','if',2.3,[1760,0],{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:3},conditions:[{id:'continue',leftValue:'={{ $json.continueBatch }}',rightValue:true,operator:{type:'boolean',operation:'equals'}}],combinator:'and'},options:{}});
 code('SecondEvent','Second Event',1980,0,gatewayCode.second);
 call('ApplySecond','Apply Second Event',2200,'frF2jemAeCrcFPDe');
 code('RecordSecond','Record Second Result',2420,0,gatewayCode.secondResult);
 code('BatchResult','Batch Result',2640,160,gatewayCode.finish);
 node('Scope','Integration Boundary','stickyNote',1,[220,-350],{content:'## Private competition gateway\nTrusted Execute Workflow callers only. actor.verified is an assertion, not authentication. Fixed adapter mapping; forced preview mode.\nPersist one event at a time through the generic core. Register emits two; stop on first failure. Partial results remain visible; retries keep original IDs. No batch transaction.\nEmail, PIN issuance and capacity reservations remain unimplemented preview effects. No notification workflow is invoked.',width:1040,height:230});
 for(const [from,to] of [['ReceiveRequest','PrepareAdapter'],['PrepareAdapter','AdapterInput'],['AdapterInput','RunAdapter'],['RunAdapter','ValidateBatch'],['ValidateBatch','FirstEvent'],['FirstEvent','ApplyFirst'],['ApplyFirst','RecordFirst'],['RecordFirst','ContinueBatch'],['ContinueBatch','SecondEvent'],['SecondEvent','ApplySecond'],['ApplySecond','RecordSecond'],['RecordSecond','BatchResult']])link(from,to);
 link('ContinueBatch','BatchResult',1);
 // Preserve an ID assigned by the CLI after the initial create/push.
 let id;try{const current=await new TypeScriptParser().parseFile(workflowPath);id=new WorkflowBuilder().build(current).id;}catch{}
 return `// <workflow-map>\n// TrustedInternalRequest -> PrepareAdapter -> AdapterInput -> RunPreviewAdapter -> ValidateEventBatch\n// FirstEvent -> ApplyFirstEvent -> RecordFirstResult -> ContinueBatch?\n// true: SecondEvent -> ApplySecondEvent -> RecordSecondResult -> BatchResult\n// false: BatchResult (completed single result, rejection, or uncertain failure)\n// </workflow-map>\n// GENERATED by scripts/build-competition-gateway.mjs\nimport {workflow,node,links} from '@n8n-as-code/transformer';\n@workflow(${JSON.stringify({...id?{id}:{},name:'Flow4Gold - Competition Gateway',active:false,settings:{executionOrder:'v1'}},null,2)})\nexport class CompetitionGatewayWorkflow {\n${nodes.join('\n\n')}\n@links()\ndefineRouting(){\n${links.join('\n')}\n}\n}\n`;
}
if(process.argv[1]?.endsWith('/build-competition-gateway.mjs')){
 const source=await buildSource();
 if(process.argv.includes('--check')){
  const builder=new WorkflowBuilder(),parser=new TypeScriptParser();
  const expected=builder.build(await parser.parseCode(source)),actual=builder.build(await parser.parseFile(workflowPath));
  for(const key of ['name','active','nodes','connections'])if(!isDeepStrictEqual(actual[key],expected[key]))throw new Error(`Competition gateway differs (${key}). Rebuild before pushing.`);
  console.log('Competition gateway matches source.');
 }else{await writeFile(workflowPath,source);console.log(`Built ${workflowPath}`);}
}
