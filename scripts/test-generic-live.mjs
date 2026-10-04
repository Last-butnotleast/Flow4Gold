import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {loadEnvFile} from 'node:process';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const driverPath='workflows/flow4gold/tests/generic-live-check.workflow.ts';
export const driverWebhookPath='flow4gold-runtime-check';
const coreId='frF2jemAeCrcFPDe';
const eventTableId='TjuB58skTvPRCwB3';
export function buildDriver(competitionGatewayId){
  if(typeof competitionGatewayId!=='string'||!/^[a-zA-Z0-9_-]+$/.test(competitionGatewayId))throw new Error('A concrete competition gateway workflow ID is required.');
  const validate=`const body=$input.first().json.body;
if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['target','input'].includes(key)))throw new Error('Expected target and input only.');
const targets=${JSON.stringify({core:coreId,competition:competitionGatewayId})};
if(!Object.prototype.hasOwnProperty.call(targets,body.target))throw new Error('Unknown smoke target.');
if(!body.input||typeof body.input!=='object'||Array.isArray(body.input))throw new Error('Expected one input object.');
return [{json:{workflowId:targets[body.target],input:body.input}}];`;
  const nodes=[];
  const add=(key,name,type,version,position,parameters,extra={})=>nodes.push(`@node(${JSON.stringify({id:'flow4gold-runtime-check-'+key,name,type:'n8n-nodes-base.'+type,version,position,...extra})})\n${key}=${JSON.stringify(parameters)};`);
  add('ReceiveCheck','Receive Check','webhook',2.1,[0,0],{httpMethod:'POST',path:driverWebhookPath,authentication:'headerAuth',responseMode:'lastNode',responseData:'firstEntryJson',options:{}},{webhookId:'flow4gold-runtime-check',credentials:{httpHeaderAuth:{id:'IY5r9QTXQxCFlFge',name:'Flow4Gold Demo Gateway'}}});
  add('ValidateTarget','Validate Smoke Request','code',2,[240,0],{mode:'runOnceForAllItems',jsCode:validate});
  add('TargetInput','Target Input','code',2,[480,0],{mode:'runOnceForAllItems',jsCode:"return [{json:$('Validate Smoke Request').first().json.input}];"});
  add('RunTarget','Run Allowed Target','executeWorkflow',1.3,[720,0],{source:'database',workflowId:{__rl:true,value:"={{ $('Validate Smoke Request').first().json.workflowId }}",mode:'id'},mode:'each',options:{waitForSubWorkflow:true}});
  return `// <workflow-map>\n// ReceiveCheck -> ValidateTarget -> TargetInput -> RunTarget (fixed allowlist, waits for completion)\n// </workflow-map>\n// Disposable authenticated live-check ingress. Remove after verification.\n// Fixed target IDs are compiled here; callers cannot supply workflow IDs.\nimport {workflow,node,links} from '@n8n-as-code/transformer';\n@workflow({name:'Flow4Gold - Generic Live Check',active:false,isArchived:false,projectId:'8d5DQtHZkgLco5Yr',settings:{executionOrder:'v1'}})\nexport class GenericLiveCheck {\n${nodes.join('\n')}\n@links() routing(){this.ReceiveCheck.out(0).to(this.ValidateTarget.in(0));this.ValidateTarget.out(0).to(this.TargetInput.in(0));this.TargetInput.out(0).to(this.RunTarget.in(0));}\n}\n`;
}
export function competitionRequests(caseId,runId){
  const common={caseId,correlationId:caseId};
  const actor={id:'smoke-contestant',role:'contestant',verified:true,caseId};
  return {
    register:{adapter:'register',input:{...common,requestId:runId+'-register',actor,submission:{contestantName:'Fictional Smoke Entry',email:'smoke@example.invalid',title:'Generic runtime demonstration',videoUrl:'https://example.invalid/video/generic-smoke',templateSubmitted:true,ticketConfirmed:true,privacyConsent:true,recordingConsent:true}}},
    link:{adapter:'contestant',input:{...common,requestId:runId+'-link',actor,caseSnapshot:{caseId,contestantId:actor.id},response:{action:'WORKFLOW_LINKED',workflow:{id:'12345',url:'https://n8n.io/workflows/12345-demo/',verificationReference:'fictional-smoke-publication-check'}}}},
    reject:{adapter:'organizer',input:{...common,requestId:runId+'-jury',actor:{id:'smoke-organizer',role:'organizer',verified:true},action:'NOT_SELECTED',evidence:{reason:'Fictional smoke-test jury decision; no real entry or notification.',revision:'smoke-revision-1',juryDecisionId:'fictional-smoke-jury-decision'}}},
  };
}
export async function runLiveCheck({host,token,apiKey,reportFile}){
  if(!token||!apiKey)throw new Error('Set FLOW4GOLD_DEMO_TOKEN and N8N_API_KEY in the ignored .env.');
  const runId='generic-'+Date.now()+'-'+randomUUID().slice(0,8);
  const cases={competition:runId+'-submission',version2:runId+'-v2',refund:runId+'-refund'};
  const report={runId,eventTableId,cases,checks:[],refund:null};
  console.log(JSON.stringify({runId,cases}));
  const check=(name,details)=>{report.checks.push({name,...details});console.log('PASS '+name);};
  async function post(path,input){const response=await fetch(new URL('/webhook/'+path,host),{method:'POST',headers:{'Content-Type':'application/json','X-Flow4Gold-Demo':token},body:JSON.stringify(input),signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error(`Live request failed (HTTP ${response.status}); inspect the workflow execution.`);const result=await response.json();if(!result||typeof result!=='object')throw new Error('Live request returned no object.');return result;}
  const core=input=>post(driverWebhookPath,{target:'core',input});
  const adapter=input=>post(driverWebhookPath,{target:'competition',input});
  async function rows(caseId){const filter={type:'and',filters:[{columnName:'caseId',condition:'eq',value:caseId}]};const query=new URLSearchParams({filter:JSON.stringify(filter),limit:'100'});const response=await fetch(new URL(`/api/v1/data-tables/${eventTableId}/rows?${query}`,host),{headers:{'X-N8N-API-KEY':apiKey},signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error(`Event-table read failed (HTTP ${response.status}).`);const body=await response.json();assert.ok(Array.isArray(body.data));assert.equal(body.nextCursor??null,null,'Smoke history must fit one page');assert.ok(body.data.every(row=>row.caseId===caseId));return body.data.sort((a,b)=>a.sequence-b.sequence);}
  async function inspect(caseId){const result=await core({caseId,operation:'inspect'});assert.equal(result.status,'inspected');return result;}
  const requests=competitionRequests(cases.competition,runId);
  const registered=await adapter(requests.register);assert.equal(registered.status,'completed');assert.equal(registered.persisted,true);assert.equal(registered.appliedCount,2);assert.equal(registered.notification.delivered,false);assert.equal(registered.results[0].currentState,'REGISTERED');
  let state=await inspect(cases.competition);assert.equal(state.currentState,'WAITING_FOR_PUBLICATION');assert.equal(state.sequence,2);
  const registeredRows=await rows(cases.competition);assert.deepEqual(registeredRows.map(row=>row.type),['SUBMISSION_RECEIVED','PUBLICATION_PENDING']);assert.ok(registeredRows.every(row=>row.machine==='flow4gold-submission'&&row.machineVersion===1));
  check('Competition registration adapters append two ordered facts',{caseId:cases.competition,state:state.currentState,sequence:state.sequence});
  const retried=await adapter(requests.register);assert.equal(retried.status,'completed');assert.equal(retried.appliedCount,0);assert.equal(retried.duplicateCount,2);assert.deepEqual(await rows(cases.competition),registeredRows);check('Adapter retry produces duplicates without writes',{});
  const linked=await adapter(requests.link);assert.equal(linked.status,'completed');state=await inspect(cases.competition);assert.equal(state.currentState,'ADMIN_REVIEW');assert.equal(state.sequence,3);check('Contestant adapter links publication',{state:state.currentState});
  const beforeIllegal=await rows(cases.competition);const illegal=await core({caseId:cases.competition,eventId:runId+'-illegal-winner',type:'WINNER_SELECTED',payload:{}});assert.equal(illegal.status,'rejected');assert.deepEqual(await rows(cases.competition),beforeIllegal);check('Illegal winner event leaves history unchanged',{});
  const closed=await adapter(requests.reject);assert.equal(closed.status,'completed');state=await inspect(cases.competition);assert.equal(state.currentState,'CLOSED');assert.equal(state.outcome,'NOT_SELECTED');assert.equal(state.sequence,4);check('Organizer adapter records fictional jury outcome',{state:state.currentState,outcome:state.outcome});
  const version2Start={caseId:cases.version2,eventId:runId+'-v2-start',machine:'flow4gold-submission',machineVersion:2,type:'SUBMISSION_RECEIVED',payload:{smokeFixture:true}};
  const v2=await core(version2Start);assert.equal(v2.status,'applied');assert.equal(v2.currentState,'WAITING_FOR_PUBLICATION');assert.equal(v2.sequence,1);
  const v2Rows=await rows(cases.version2);assert.equal(v2Rows[0].machineVersion,2);const duplicate=await core(version2Start);assert.equal(duplicate.status,'duplicate');assert.deepEqual(await rows(cases.version2),v2Rows);
  const wrongVersion=await core({...version2Start,eventId:runId+'-wrong-version',machineVersion:1,type:'WORKFLOW_LINKED'});assert.equal(wrongVersion.status,'rejected');assert.match(wrongVersion.reason,/pinned/i);assert.deepEqual(await rows(cases.version2),v2Rows);
  const oldState=await inspect(cases.competition);assert.equal(oldState.currentState,'CLOSED');assert.equal(oldState.outcome,'NOT_SELECTED');assert.ok((await rows(cases.competition)).every(row=>row.machineVersion===1));check('Two versions coexist and each case stays pinned',{v1Case:cases.competition,v2Case:cases.version2,v2FirstState:v2.currentState});
  const refund=await post('flow4gold-demo',{caseId:cases.refund,eventId:runId+'-refund-start',type:'RECEIVED',payload:{message:'I have a payment question, but I do not know my order number. Please tell me what information you need.'}});assert.equal(refund.status,'applied');assert.equal(refund.currentState,'INVESTIGATING');
  let refundState;
  for(let attempt=0;attempt<30;attempt++){refundState=await inspect(cases.refund);if(refundState.currentState!=='INVESTIGATING')break;await new Promise(resolve=>setTimeout(resolve,1500));}
  assert.ok(['WAITING_CUSTOMER','HUMAN_REVIEW'].includes(refundState.currentState),'Diagnosis should finish with a customer question or explicit human escalation');
  const refundRows=await rows(cases.refund);assert.ok(refundRows.every(row=>row.machine==='customer-refund'&&row.machineVersion===1));assert.equal(refundRows[0].type,'RECEIVED');assert.equal(refundRows.length,2);assert.equal(refundRows[1].taskInvocationId,refundRows[0].eventId+':diagnose');assert.equal(refundRows[1].causationId,refundRows[0].eventId);
  report.refund={state:refundState.currentState,sequence:refundState.sequence,escalated:refundState.currentState==='HUMAN_REVIEW',humanDecisionSubmitted:false};check('Real refund diagnosis shares the event table with competition cases',report.refund);
  if(reportFile)await writeFile(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({runId,cases,passed:report.checks.length,refund:report.refund}));return report;
}
async function main(){
  const args=process.argv.slice(2),value=flag=>{const index=args.indexOf(flag);return index<0?undefined:args[index+1];};
  if(args.includes('--build-driver')){const id=value('--competition-gateway-id');const source=buildDriver(id);await mkdir('workflows/flow4gold/tests',{recursive:true});await writeFile(driverPath,source);console.log('Built '+driverPath+'; publish only for the smoke check, then remove it.');return;}
  if(!args.includes('--run')){console.log('Build: node scripts/test-generic-live.mjs --build-driver --competition-gateway-id ID\nRun after publishing: node scripts/test-generic-live.mjs --run [--report-file /tmp/generic-live-report.json]\nThe run creates fictional cases and invokes real Jev diagnosis; it never submits a human approval.');return;}
  try{loadEnvFile('.env');}catch{}
  const output=execFileSync('node_modules/.bin/n8nac',['env','status','--json'],{encoding:'utf8'});const context=JSON.parse(output.slice(output.indexOf('{')));
  await runLiveCheck({host:context.host,token:process.env.FLOW4GOLD_DEMO_TOKEN,apiKey:process.env.N8N_API_KEY,reportFile:value('--report-file')});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error instanceof Error?error.message:'Generic live check failed.');process.exitCode=1;});
