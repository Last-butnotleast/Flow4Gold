import {readFile,writeFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {TypeScriptParser,WorkflowBuilder,JsonToAstParser,AstToTypeScriptGenerator} from '@n8n-as-code/transformer';
export const workflowPath='workflows/flow4gold/competition-gateway.workflow.ts';
export const gatewayCode={
webhook:`const items=$input.all();
if(items.length!==1)throw new Error('Submit one competition request.');
const body=items[0].json.body;
if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Competition webhook requires a JSON object body.');
return [{json:body}];`,
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
if(preview.mode!=='preview'||preview.persisted!==false||!Array.isArray(preview.events)||preview.events.length!==1)throw new Error('Unexpected adapter event batch.');
const keys=['eventId','caseId','machine','machineVersion','type','payload','correlationId','causationId'];
const events=preview.events;
const ids=new Set();
for(const [index,event] of events.entries()){
 if(!event||typeof event!=='object'||Array.isArray(event)||Object.keys(event).some(key=>!keys.includes(key)))throw new Error('Unexpected event fields.');
 if(event.caseId!==prepared.input.caseId||event.correlationId!==prepared.input.correlationId||event.machine!=='flow4gold-submission'||event.machineVersion!==1)throw new Error('Adapter event identity mismatch.');
 if(typeof event.eventId!=='string'||!event.eventId.trim()||typeof event.type!=='string'||!event.type.trim()||!event.payload||typeof event.payload!=='object'||Array.isArray(event.payload))throw new Error('Malformed adapter event.');
 if(ids.has(event.eventId))throw new Error('Adapter repeated an event identity.');ids.add(event.eventId);
 if(prepared.adapter==='register'&&event.type!=='SUBMISSION_RECEIVED')throw new Error('Registration must propose SUBMISSION_RECEIVED.');
}
return [{json:{adapter:prepared.adapter,caseId:prepared.input.caseId,events,effects:preview.effects??[]}}];`,
first:`return [{json:$('Validate Event Batch').first().json.events[0]}];`,
firstResult:`const batch=$('Validate Event Batch').first().json;return [{json:{...batch,results:[$input.first().json]}}];`,
finish:`const batch=$input.first().json;
const accepted=(result,index)=>result.caseId===batch.caseId&&result.eventId===batch.events[index].eventId&&['applied','duplicate'].includes(result.status);
const acceptedCount=batch.results.filter(accepted).length;
const complete=acceptedCount===batch.events.length;
const last=batch.results.at(-1);const lastIndex=batch.results.length-1;
const rejected=last?.status==='rejected'&&last.caseId===batch.caseId&&last.eventId===batch.events[lastIndex].eventId;
const status=complete?'completed':rejected?'rejected':'uncertain';
return [{json:{mode:'persist',adapter:batch.adapter,caseId:batch.caseId,events:batch.events,results:batch.results,status,persisted:complete,partiallyPersisted:false,
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
 node('CompetitionWebhook','Competition Server Webhook','webhook',2.1,[-220,220],{httpMethod:'POST',path:'flow4gold-competition',authentication:'headerAuth',responseMode:'lastNode',responseData:'firstEntryJson',options:{}},{webhookId:'flow4gold-competition-gateway',credentials:{httpHeaderAuth:{id:'IY5r9QTXQxCFlFge',name:'Flow4Gold Demo Gateway'}}});
 code('ExtractWebhookBody','Extract Webhook Body',0,220,gatewayCode.webhook);
 code('PrepareAdapter','Prepare Adapter',220,0,gatewayCode.prepare);
 code('AdapterInput','Adapter Input',440,0,gatewayCode.input);
 call('RunAdapter','Run Preview Adapter',660,"={{ $('Prepare Adapter').first().json.workflowId }}");
 code('ValidateBatch','Validate Event Batch',880,0,gatewayCode.batch);
 code('FirstEvent','First Event',1100,0,gatewayCode.first);
 call('ApplyFirst','Apply First Event',1320,'frF2jemAeCrcFPDe');
 code('RecordFirst','Record First Result',1540,0,gatewayCode.firstResult);
 code('BatchResult','Batch Result',1760,0,gatewayCode.finish);
 node('Scope','Integration Boundary','stickyNote',1,[220,-350],{content:'## Trusted competition gateway\nInternal Execute Workflow callers or the authenticated local demo server webhook. The shared header credential stays on the server. The local server asserts actor identity; actor.verified is not browser authentication. Both entrypoints use the same fixed adapter mapping and forced preview mode.\nPersist exactly one external event through the generic core. Registration starts the REGISTERED state task; publication status and in-app notifications run asynchronously through scoped task bindings. Completed means this event was accepted, not that its task finished. Retry unchanged requests with original IDs.\nNo email or PIN is issued. The gateway does not run state tasks itself; the generic core does.',width:1120,height:260});
 for(const [from,to] of [['ReceiveRequest','PrepareAdapter'],['CompetitionWebhook','ExtractWebhookBody'],['ExtractWebhookBody','PrepareAdapter'],['PrepareAdapter','AdapterInput'],['AdapterInput','RunAdapter'],['RunAdapter','ValidateBatch'],['ValidateBatch','FirstEvent'],['FirstEvent','ApplyFirst'],['ApplyFirst','RecordFirst'],['RecordFirst','BatchResult']])link(from,to);
 // Preserve an ID assigned by the CLI after the initial create/push.
 let id;try{const current=await new TypeScriptParser().parseFile(workflowPath);id=new WorkflowBuilder().build(current).id;}catch{}
 return `// <workflow-map>\n// CompetitionServerWebhook (header auth) -> ExtractWebhookBody -> PrepareAdapter\n// TrustedInternalRequest -> PrepareAdapter -> AdapterInput -> RunPreviewAdapter -> ValidateEventBatch\n// FirstEvent -> ApplyFirstEvent -> RecordFirstResult -> BatchResult (accepted event, rejection, or uncertain failure)\n// </workflow-map>\n// GENERATED by scripts/build-competition-gateway.mjs\nimport {workflow,node,links} from '@n8n-as-code/transformer';\n@workflow(${JSON.stringify({...id?{id}:{},name:'Flow4Gold - Competition Gateway',active:false,settings:{executionOrder:'v1'}},null,2)})\nexport class CompetitionGatewayWorkflow {\n${nodes.join('\n\n')}\n@links()\ndefineRouting(){\n${links.join('\n')}\n}\n}\n`;
}
if(process.argv[1]?.endsWith('/build-competition-gateway.mjs')){
 const source=await buildSource();
 if(process.argv.includes('--check')){
  const builder=new WorkflowBuilder(),parser=new TypeScriptParser();
  const expected=builder.build(await parser.parseCode(source)),actual=builder.build(await parser.parseFile(workflowPath));
  for(const key of ['name','active','nodes','connections'])if(!isDeepStrictEqual(actual[key],expected[key]))throw new Error(`Competition gateway differs (${key}). Rebuild before pushing.`);
  console.log('Competition gateway matches source.');
 }else{
  // Keep the same readable TypeScript and multiline Code-node strings as a CLI pull.
  const workflow=new WorkflowBuilder().build(await new TypeScriptParser().parseCode(source));
  const formatted=await new AstToTypeScriptGenerator().generate(new JsonToAstParser().parse(workflow));
  await writeFile(workflowPath,formatted);console.log(`Built ${workflowPath}`);
 }
}
