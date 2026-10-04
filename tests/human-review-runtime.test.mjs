import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const definitions = await Promise.all([1, 2, 3].map(async version => JSON.parse(await readFile(`machines/customer-refund.v${version}.json`, 'utf8'))));
const prepare = new Function('$input', await readFile('runtime/prepare-event.js','utf8'));
const run = new Function('$input', '$', await readFile('runtime/plan-transition.js', 'utf8'));
const plan = (request, rows = []) => run({all: () => rows.map(json => ({json}))}, () => ({first: () => ({json:{...prepare({all: () => [{json:request}]})[0].json,definitions,definition:definitions.at(-1)}})}))[0].json;
const request = (type, eventId, payload={}) => ({caseId:'review-case', eventId, type, payload});
const received = plan(request('RECEIVED','start')).eventRecord;
const escalate = plan({...request('ESCALATE','start:diagnose:result',{reason:'Human judgment needed'}), causationId:'start',taskInvocationId:'start:diagnose'},[received]);
const base = [received,escalate.eventRecord];
const reviewId = base[1].eventId;
const proposal = {amount:40,currency:'EUR',paymentReference:'demo-payment-002',orderReference:'1043',reason:'Refund warranted',simulation:true};
const decision = (type='REVIEW_APPROVED', payload) => ({...request(type,`${reviewId}:human_review:result`,payload ?? {reviewEventId:reviewId,message:'Refund warranted',...(type==='REVIEW_APPROVED'?{proposal}:{})}),causationId:reviewId,taskInvocationId:`${reviewId}:human_review`});
const inspect = rows => plan({caseId:'review-case',operation:'inspect'},rows);

test('v3 escalation dispatches human review and each decision replays with expected next state', () => {
  assert.equal(received.machineVersion,3);
  assert.equal(escalate.taskInvocation.task,'human_review');
  for (const [type,state,outcome,task] of [['REVIEW_APPROVED','EXECUTING',null,'issue_refund'],['REJECTED','CLOSED','REJECTED',undefined],['NEED_MORE_INFO','WAITING_CUSTOMER',null,undefined]]) {
    const event=decision(type);const result=plan(event,base);
    assert.equal(result.action,'apply');assert.equal(result.result.currentState,state);
    assert.equal(result.result.outcome,outcome);assert.equal(result.taskInvocation?.task,task);
    const history=[...base,result.eventRecord];
    assert.equal(inspect(history).result.currentState,state);
    assert.equal(inspect(history).taskInvocation,undefined);
    assert.equal(plan(event,history).result.status,'duplicate');
    assert.equal(plan(event,history).taskInvocation,undefined);
  }
});

test('review question waits for customer then starts fresh diagnosis and rejects old callbacks', () => {
  const question=plan(decision('NEED_MORE_INFO',{reviewEventId:reviewId,message:'Please explain what went wrong.'}),base);
  const rows=[...base,question.eventRecord];
  const reply=plan(request('CUSTOMER_REPLIED','reply',{message:'The parcel never arrived.'}),rows);
  assert.equal(reply.result.currentState,'INVESTIGATING');assert.equal(reply.taskInvocation.task,'diagnose');
  const newEscalation=plan({...request('ESCALATE','reply:diagnose:result'),causationId:'reply',taskInvocationId:'reply:diagnose'},[...rows,reply.eventRecord]);
  assert.equal(plan(decision(),[...rows,reply.eventRecord,newEscalation.eventRecord]).result.status,'rejected');
});

test('review refuses bare decisions, RESUME, tampered payloads and mismatched links without append', () => {
  const event=decision();
  const invalid=[...['REVIEW_APPROVED','REJECTED','NEED_MORE_INFO','RESUME','APPROVED'].map(type=>request(type,'bare')),
    {...event,taskInvocationId:undefined},{...event,causationId:'start'},
    {...event,payload:{...event.payload,reviewEventId:'wrong'}},
    {...event,payload:{...event.payload,message:''}},
    {...event,payload:{...event.payload,message:'x'.repeat(4001)}},
    {...event,payload:{...event.payload,extra:true}},
    {...event,payload:{...event.payload,proposal:{...proposal,amount:0}}},
    {...event,payload:{...event.payload,proposal:{...proposal,simulation:false}}},
    {...event,payload:{...event.payload,proposal:{...proposal,reason:'different'}}},
    decision('REJECTED',{reviewEventId:reviewId,message:'No',proposal}),
  ];
  for (const input of invalid) {const result=plan(input,base);assert.equal(result.result.status,'rejected',JSON.stringify(input));assert.equal(result.eventRecord,undefined);}
  const valid=plan(event,base).eventRecord;
  for(const mutation of [{taskInvocationId:''},{payload:JSON.stringify({...event.payload,reviewEventId:'wrong'})}]) {
    assert.equal(inspect([...base,{...valid,...mutation}]).result.status,'rejected');
  }
});

test('recorded v1 and v2 review graphs retain RESUME and do not dispatch human review', () => {
  for(const machineVersion of [1,2]) {
    const rows=base.map(row=>({...row,machineVersion}));
    assert.equal(inspect(rows).result.currentState,'HUMAN_REVIEW');
    const resumed=plan(request('RESUME','resume'),rows);
    assert.equal(resumed.result.currentState,'INVESTIGATING');assert.equal(resumed.eventRecord.machineVersion,machineVersion);
    assert.equal(plan(decision(),rows).result.status,'rejected');
  }
});
