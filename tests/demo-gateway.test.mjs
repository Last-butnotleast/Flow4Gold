import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {customerPayload} from '../server/demo-server.mjs';
const validate = new Function('$json', readFileSync('runtime/demo-gateway.js','utf8'));
const intake={caseId:'demo-123',eventId:'customer-123',type:'RECEIVED',payload:{message:'Duplicate charge',orderReference:'1042'}};
test('demo ingress accepts customer intake, reply and read-only inspect',()=>{
  assert.deepEqual(validate({body:intake})[0].json,intake);
  assert.equal(validate({body:{...intake,type:'CUSTOMER_REPLIED'}})[0].json.type,'CUSTOMER_REPLIED');
  assert.deepEqual(validate({body:{caseId:'demo-123',operation:'inspect'}})[0].json,{caseId:'demo-123',operation:'inspect'});
});
test('demo ingress cannot forge domain task results, approvals or invocation metadata',()=>{
  for(const type of ['APPROVED','REJECTED','REFUND_RECOMMENDED','ACTION_COMPLETED','REFUND_CONFIRMED'])assert.throws(()=>validate({body:{...intake,type}}));
  for(const key of ['taskInvocationId','causationId','machineVersion','state'])assert.throws(()=>validate({body:{...intake,[key]:'forged'}}));
  assert.throws(()=>validate({body:{...intake,payload:{...intake.payload,amount:5000}}}));
});
test('browser input limits reject arbitrary properties and oversized content',()=>{
  assert.deepEqual(customerPayload({message:' hello ',orderReference:' 1042 '}),{message:'hello',orderReference:'1042'});
  for(const value of [{message:''},{message:'x'.repeat(4001)},{message:'a',type:'APPROVED'},{message:'a',orderReference:42},[]])assert.throws(()=>customerPayload(value));
});
test('deployed gateway source uses the tested validator and header authentication',async()=>{
  const {compiledWorkflow}=await import('../scripts/build-core.mjs');
  const workflow=await compiledWorkflow('workflows/flow4gold/demo-gateway.workflow.ts');
  const webhook=workflow.nodes.find(node=>node.type==='n8n-nodes-base.webhook');
  assert.equal(webhook.parameters.authentication,'headerAuth');
  assert.ok(webhook.credentials.httpHeaderAuth.id);
  assert.equal(workflow.nodes.find(node=>node.type==='n8n-nodes-base.code').parameters.jsCode,readFileSync('runtime/demo-gateway.js','utf8'));
});
test('case projection selects the latest recorded reviewer-approved proposal',async()=>{
  const {projectProposal}=await import('../server/demo-server.mjs');
  const proposal={amount:25,currency:'EUR',paymentReference:'demo-payment-1042'};
  assert.deepEqual(projectProposal([{type:'REFUND_RECOMMENDED',payload:{amount:10}},{type:'REVIEW_APPROVED',payload:{reviewEventId:'r1',proposal}}]),proposal);
  assert.deepEqual(projectProposal([{type:'REFUND_RECOMMENDED',payload:proposal}]),proposal);
  assert.equal(projectProposal([]),null);
});
