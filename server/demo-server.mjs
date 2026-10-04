import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {parseMachine, canonicalJson, parseMachineCatalog} from '../shared/machine-validation.mjs';
import {createCompetitionService} from './competition.mjs';

const machinesTableId = 'Lm8JZL9uCNqj14vE';
const ordersTableId = '1NakvVeVYx0CI2hU';
const tableId = 'TjuB58skTvPRCwB3';
const bindings = {core: 'frF2jemAeCrcFPDe', diagnose: 'wkjUfwKoHZDmTAXW', request_approval: 'cL04Sd1GfOlJk0Te', human_review: 'QqlNaOkKKdpSGjO8', issue_refund: 'QWAFL09ceL8nUa6y', verify_refund: '9LZC7MMcWWLI4FN9'};
const root = new URL('../', import.meta.url);
// Payment-support adapter stays pinned to its compatible refund task contract.
export function paymentMachine(catalog) {
  const machine = catalog.machines.find(item => item.machine === 'customer-refund' && item.version === 1)?.definition;
  if (!machine) fail('The payment demo requires customer-refund version 1 in the machine catalog.');
  return machine;
}
export function projectProposal(events) {
  const event = events.findLast(event => ['REFUND_RECOMMENDED', 'REVIEW_APPROVED'].includes(event.type));
  return event?.type === 'REVIEW_APPROVED' ? event.payload.proposal ?? null : event?.payload ?? null;
}
export function customerPayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['message','orderReference'].includes(k))) throw Object.assign(new Error('Only message and optional orderReference are accepted.'), {status:400});
  if (typeof input.message !== 'string' || !input.message.trim() || input.message.length > 4000) throw Object.assign(new Error('Message must contain 1–4000 characters.'), {status:400});
  if (input.orderReference !== undefined && (typeof input.orderReference !== 'string' || input.orderReference.length > 80)) throw Object.assign(new Error('Invalid order reference.'), {status:400});
  return {message:input.message.trim(), ...(input.orderReference?.trim() ? {orderReference:input.orderReference.trim()} : {})};
}
export function orderInput(input) {
  const keys = ['itemName', 'amount', 'currency', 'duplicateCharge'];
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !keys.includes(key))) fail('Only itemName, amount, currency and duplicateCharge are accepted.', 400);
  if (typeof input.itemName !== 'string' || !input.itemName.trim() || input.itemName.trim().length > 120) fail('Item name must contain 1–120 characters.', 400);
  if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 1000000 || Math.abs(input.amount * 100 - Math.round(input.amount * 100)) > 0.000001) fail('Amount must be positive, at most 1000000, with at most two decimal places.', 400);
  if (typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency)) fail('Currency must be a three-letter uppercase code.', 400);
  if (typeof input.duplicateCharge !== 'boolean') fail('Duplicate charge must be true or false.', 400);
  return {itemName:input.itemName.trim(),amount:input.amount,currency:input.currency,duplicateCharge:input.duplicateCharge};
}
export function orderRow(row) {
  try {
    const input = orderInput({itemName:row.itemName,amount:row.amount,currency:row.currency,duplicateCharge:row.duplicateCharge});
    for (const key of ['orderReference','paymentReference']) if (typeof row[key] !== 'string' || !row[key].trim() || row[key] !== row[key].trim() || row[key].length > 120) throw new Error('Invalid reference');
    return {orderReference:row.orderReference,...input,paymentReference:row.paymentReference};
  } catch { fail('Invalid demo order table row.'); }
}
function fail(message,status=502) { throw Object.assign(new Error(message),{status}); }
export function createDemoServer({host, apiKey, token, fetchImpl = fetch}) {
  const inspections = new Map();
  const taskLinks = Object.entries(bindings).map(([task,id]) => ({task,url:new URL('/workflow/'+id,host).href}));
  async function gateway(input) {
    const response=await fetchImpl(new URL('/webhook/flow4gold-demo',host),{method:'POST',headers:{'Content-Type':'application/json','X-Flow4Gold-Demo':token},body:JSON.stringify(input),signal:AbortSignal.timeout(45000)});
    if(!response.ok) fail('n8n gateway request failed; check the gateway execution.');
    const result=await response.json();
    if(result.status==='rejected') fail(result.reason || 'Core rejected the request.',409);
    return result;
  }
  async function events(caseId) {
    const rows=[];let cursor;
    do {
      const query=new URLSearchParams({filter:JSON.stringify({type:'and',filters:[{columnName:'caseId',condition:'eq',value:caseId}]}),limit:'100'});
      if(cursor)query.set('cursor',cursor);
      const response=await fetchImpl(new URL(`/api/v1/data-tables/${tableId}/rows?${query}`,host),{headers:{'X-N8N-API-KEY':apiKey},signal:AbortSignal.timeout(15000)});
      if(!response.ok)fail('Could not read the case event stream.');
      const page=await response.json();
      if(!Array.isArray(page.data)||page.data.some(row=>row.caseId!==caseId))fail('Unexpected event stream response.');
      rows.push(...page.data);cursor=page.nextCursor;
      if(rows.length>10000)fail('Case exceeds demo event limit.');
    } while(cursor);
    return rows.sort((a,b)=>a.sequence-b.sequence).map(row=>({...row,payload:JSON.parse(row.payload)}));
  }
  async function orders() {
    const rows=[]; let cursor;
    do {
      const query=new URLSearchParams({limit:'100'});if(cursor)query.set('cursor',cursor);
      const response=await fetchImpl(new URL(`/api/v1/data-tables/${ordersTableId}/rows?${query}`,host),{headers:{'X-N8N-API-KEY':apiKey},signal:AbortSignal.timeout(15000)});
      if(!response.ok)fail('Could not read demo orders.');
      const page=await response.json();if(!Array.isArray(page.data))fail('Unexpected demo order response.');
      rows.push(...page.data.map(orderRow));cursor=page.nextCursor;
      if(rows.length>10000)fail('Demo order limit exceeded.');
    } while(cursor);
    if(new Set(rows.map(row=>row.orderReference)).size!==rows.length)fail('Duplicate demo order references require correction.');
    return rows;
  }
  async function catalog() {
    const rows=[];let cursor;
    do {
      const query=new URLSearchParams({limit:'100'});if(cursor)query.set('cursor',cursor);
      const response=await fetchImpl(new URL(`/api/v1/data-tables/${machinesTableId}/rows?${query}`,host),{headers:{'X-N8N-API-KEY':apiKey},signal:AbortSignal.timeout(15000)});
      if(!response.ok)fail('Could not read the machine catalog.');
      const page=await response.json();if(!Array.isArray(page.data))fail('Unexpected machine catalog response.');
      rows.push(...page.data);cursor=page.nextCursor;if(rows.length>1000)fail('Machine catalog limit exceeded.');
    }while(cursor);
    try{return parseMachineCatalog(rows);}catch(error){fail(error.message);}
  }
  async function readBody(req,limit=8192) {
    if(!req.headers['content-type']?.startsWith('application/json'))fail('Use application/json.',415);
    let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>limit)fail('Request too large.',413);}
    try{return JSON.parse(raw);}catch{fail('Invalid JSON.',400);}
  }
  const competition=createCompetitionService({host,apiKey,token,fetchImpl,catalog,inspect:gateway});
  return createServer(async(req,res)=>{
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
    try {
      // Loopback-only listener plus same-origin JSON requests. No public browser API key.
      if(!['127.0.0.1:5173','localhost:5173','127.0.0.1:5174','localhost:5174'].includes(req.headers.host)) return send(403,{error:'Host not allowed.'});
      if(req.headers.origin&&!['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:5174','http://localhost:5174'].includes(req.headers.origin)) return send(403,{error:'Origin not allowed.'});
      const path=new URL(req.url,'http://localhost').pathname;
      if(req.method==='GET'&&path==='/api/competition/entries')return send(200,{entries:await competition.list()});
      if(req.method==='POST'&&path==='/api/competition/entries')return send(201,await competition.register(await readBody(req,32768)));
      const competitionMatch=path.match(/^\/api\/competition\/entries\/(competition-[a-f0-9]{32})(\/actions)?$/);
      if(req.method==='GET'&&competitionMatch&&!competitionMatch[2])return send(200,{entry:await competition.get(competitionMatch[1])});
      if(req.method==='POST'&&competitionMatch?.[2])return send(200,await competition.act(competitionMatch[1],await readBody(req,32768)));
      if(req.method==='GET'&&path==='/api/config') {
        const stored=await catalog();
        const machines=stored.machines.map(item=>item.definition);
        return send(200,{machine:paymentMachine(stored),machines,sampleOrders:await orders(),taskLinks,workflowLinks:taskLinks,simulation:true});
      }
      if(req.method==='GET'&&path==='/api/machines')return send(200,await catalog());
      if(req.method==='POST'&&path==='/api/machines') {
        const input=await readBody(req,262144);
        if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||!Object.hasOwn(input,'definition'))fail('Only a definition object is accepted.',400);
        let definition;try{definition=parseMachine(input.definition);}catch(error){fail(error.message,400);}
        const stored=await catalog();
        const existing=stored.machines.find(item=>item.machine===definition.machine&&item.version===definition.version);
        if(existing){
          if(canonicalJson(existing.definition)!==canonicalJson(definition))fail('This machine version already exists with different content. Save a new version.',409);
          return send(200,{machine:existing,created:false});
        }
        const row={machine:definition.machine,version:definition.version,definition:canonicalJson(definition),isDefault:false};
        const response=await fetchImpl(new URL(`/api/v1/data-tables/${machinesTableId}/rows`,host),{method:'POST',headers:{'X-N8N-API-KEY':apiKey,'Content-Type':'application/json'},body:JSON.stringify({data:[row]}),signal:AbortSignal.timeout(15000)});
        if(!response.ok)fail('Could not save the machine definition.');
        return send(201,{machine:{...row,definition},created:true});
      }
      if(req.method==='GET'&&path==='/api/orders')return send(200,{orders:await orders()});
      if(req.method==='POST'&&path==='/api/orders') {
        const input=orderInput(await readBody(req));
        const id=randomUUID();
        const order={orderReference:`demo-${id}`,...input,paymentReference:`demo-payment-${id}`};
        const existing=await orders();
        if(existing.some(row=>row.orderReference===order.orderReference||row.paymentReference===order.paymentReference))fail('Order reference collision; try again.',409);
        const response=await fetchImpl(new URL(`/api/v1/data-tables/${ordersTableId}/rows`,host),{method:'POST',headers:{'X-N8N-API-KEY':apiKey,'Content-Type':'application/json'},body:JSON.stringify({data:[order]}),signal:AbortSignal.timeout(15000)});
        if(!response.ok)fail('Could not create demo order.');
        return send(201,{order});
      }
      const match=path.match(/^\/api\/cases\/([a-zA-Z0-9_-]{1,120})(\/replies)?$/);
      if(req.method==='GET'&&match&&!match[2]) {
        const caseId=match[1];
        // Read rows before inspect; if a task appends meanwhile, retry until both agree.
        let stream,result;
        for(let i=0;i<3;i++){
          stream=await events(caseId);
          const fingerprint=JSON.stringify(stream);
          const cached=inspections.get(caseId);
          result=cached?.fingerprint===fingerprint ? cached.result : await gateway({caseId,operation:'inspect'});
          if(result.sequence===stream.length){
            if(inspections.size>=100)inspections.delete(inspections.keys().next().value);
            inspections.set(caseId,{fingerprint,result});break;
          }
        }
        if(result.status==='not_found')return send(404,{error:'Case not found.'});
        if(result.sequence!==stream.length)fail('Case is changing; refresh shortly.',503);
        if(!stream.length||stream.some(event=>event.machine!==stream[0].machine||event.machineVersion!==stream[0].machineVersion))fail('Case events do not identify one machine version.');
        const stored=await catalog();
        const machine=stored.machines.find(item=>item.machine===stream[0].machine&&item.version===stream[0].machineVersion)?.definition;
        if(!machine)fail('The recorded case machine version is missing from the catalog.');
        return send(200,{caseId,machine,state:result.currentState,currentState:result.currentState,outcome:result.outcome,sequence:result.sequence,events:stream,proposal:projectProposal(stream),receipt:stream.findLast(e=>e.type==='ACTION_COMPLETED')?.payload??null,taskLinks,simulation:true});
      }
      if(req.method==='POST'&&(path==='/api/cases'||match?.[2])) {
        const input=await readBody(req);
        const payload=customerPayload(input);
        const caseId=match?.[1]??`demo-${randomUUID()}`;
        if(match){const current=await gateway({caseId,operation:'inspect'});if(current.currentState!=='WAITING_CUSTOMER')fail('This case is not waiting for a customer reply.',409);}
        const result=await gateway({caseId,eventId:`customer-${randomUUID()}`,type:match?'CUSTOMER_REPLIED':'RECEIVED',payload});
        return send(201,{caseId,result});
      }
      send(404,{error:'Unknown route.'});
    }catch(error){send(error.status??500,{error:error.status?error.message:'Demo service could not complete the request. Check local configuration and n8n.',...(error.status?error.details??{}:{})});}
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{loadEnvFile(new URL('../.env',import.meta.url));}catch{}
  if(!process.env.N8N_API_KEY||!process.env.FLOW4GOLD_DEMO_TOKEN)throw new Error('Set N8N_API_KEY and FLOW4GOLD_DEMO_TOKEN in .env.');
  const output=execFileSync('npm',['run','--silent','n8n','--','env','status','--json'],{cwd:root,encoding:'utf8'});
  const context=JSON.parse(output.slice(output.indexOf('{')));
  createDemoServer({host:context.host,apiKey:process.env.N8N_API_KEY,token:process.env.FLOW4GOLD_DEMO_TOKEN}).listen(5174,'127.0.0.1',()=>console.log('Flow4Gold local API ready on http://127.0.0.1:5174'));
}
