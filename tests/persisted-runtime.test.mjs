import assert from 'node:assert/strict';
import test from 'node:test';
import {workflow,node,execute,parcel,catalog,plan,start,callback} from './helpers/runtime.mjs';
const inspect=rows=>plan({caseId:'case-1',operation:'inspect'},rows);
const reject=result=>{assert.equal(result.action,'return');assert.equal(result.result.status,'rejected');assert.equal(result.eventRecord,undefined);assert.equal(result.taskInvocation,undefined);};
const first=()=>plan(start()).eventRecord;

test('workflow has one event append and native catalog read, no embedded domain policy',()=>{
 assert.deepEqual(workflow.nodes.filter(n=>n.type==='n8n-nodes-base.dataTable'&&n.parameters.operation!=='get').map(n=>n.name),['Append Event']);
 assert.equal(node('Read Machine Definitions').executeOnce,true);
 assert.doesNotMatch(node('Plan Transition').parameters.jsCode,/REFUND_RECOMMENDED|AWAITING_APPROVAL|HUMAN_REVIEW|RECEIVED|proposalEventId/);
 assert.deepEqual(workflow.connections['Append Event?'].main[1].map(x=>x.node),['Existing Result']);
 assert.equal(node('Run Task').parameters.options.waitForSubWorkflow,false);
});
test('accepted event appends sequence one and stable invocation; inspect replays without effects',()=>{
 const accepted=plan(start());assert.equal(accepted.action,'apply');assert.equal(accepted.eventRecord.sequence,1);assert.equal(accepted.result.currentState,'WORKING');assert.equal(accepted.taskInvocation.taskInvocationId,'start:work');
 const viewed=inspect([accepted.eventRecord]);assert.equal(viewed.result.currentState,'WORKING');assert.equal(viewed.result.sequence,1);assert.equal(viewed.taskInvocation,undefined);assert.equal(viewed.eventRecord,undefined);
 assert.equal(inspect([]).result.status,'not_found');
});
test('callback closes and replay derives outcome from unsorted history',()=>{
 const entry=first();const end=plan(callback(entry,'work','DONE'),[entry]);assert.equal(end.result.outcome,'DONE');
 const view=inspect([end.eventRecord,entry]);assert.equal(view.result.currentState,'CLOSED');assert.equal(view.result.outcome,'DONE');assert.equal(view.result.sequence,2);
 reject(plan({caseId:'case-1',eventId:'later',type:'START'},[entry,end.eventRecord]));
});
test('same event retries canonicalize payload and never append or dispatch again',()=>{
 const request=start({payload:{b:2,a:{z:3,y:4}}});const entry=plan(request).eventRecord;
 const duplicate=plan({...request,payload:{a:{y:4,z:3},b:2}},[entry]);assert.equal(duplicate.result.status,'duplicate');assert.equal(duplicate.taskInvocation,undefined);assert.equal(duplicate.eventRecord,undefined);
 const done=plan(callback(entry,'work','DONE'),[entry]).eventRecord;
 assert.equal(plan(request,[entry,done]).result.currentState,'CLOSED');
});
test('event ID conflicts compare case,type,payload and causal/invocation identity',()=>{
 const entry=first();for(const change of [{caseId:'other'},{type:'CANCEL'},{payload:{changed:true}},{correlationId:'other'},{causationId:'start'},{taskInvocationId:'bad'}])reject(plan(start(change),[entry]));
});
test('invalid event, prototype event and terminal mutation cannot append',()=>{
 const entry=first();for(const type of ['UNKNOWN','toString','__proto__'])reject(plan({caseId:'case-1',eventId:'invalid',type},[entry]));
});
test('malformed stream identities,sequences,payloads and transitions fail closed',()=>{
 const entry=first();for(const change of [{sequence:0},{sequence:2},{machineVersion:2},{machine:'missing'},{correlationId:''},{eventId:''},{causationId:'start'},{payload:'bad'},{payload:'[]'},{type:'UNKNOWN'}])reject(inspect([{...entry,...change}]));
 reject(inspect([entry,{...entry,sequence:2}]));
 const done=plan(callback(entry,'work','DONE'),[entry]).eventRecord;
 reject(inspect([entry,{...done,correlationId:'changed'}]));
 reject(inspect([{...entry,causationId:done.eventId},done]));
});
test('requests cannot inject state or definitions and require valid explicit identity pair',()=>{
 for(const request of [start({state:'OPEN'}),start({definition:parcel}),start({payload:[]}),start({machineVersion:0}),start({machineVersion:'1'}),start({machine:' parcel'}),{caseId:'case-1',eventId:'x',type:'START',machine:'parcel'},{caseId:'case-1',eventId:'x',type:'START',machineVersion:1}])assert.throws(()=>execute('Prepare Event',[request]));
 assert.throws(()=>execute('Prepare Event',[]));assert.throws(()=>execute('Prepare Event',[start(),start()]));
 reject(plan({caseId:'case-1',eventId:'x',type:'START'}));
});
test('causation can link different cases in one correlation without sharing their state',()=>{
 const parent=first();const child=plan(start({caseId:'child',eventId:'child-start',causationId:parent.eventId}),[parent]);assert.equal(child.action,'apply');assert.equal(child.eventRecord.sequence,1);assert.equal(child.eventRecord.correlationId,parent.correlationId);
 reject(plan(start({caseId:'child',eventId:'child-start',causationId:'missing'}),[parent]));
 reject(plan(start({caseId:'child',eventId:'child-start',causationId:parent.eventId,correlationId:'wrong'}),[parent]));
});
test('task result declarations reject missing, wrong or stale callback links',()=>{
 const entry=first();const valid=callback(entry,'work','QUESTION');
 for(const change of [{taskInvocationId:undefined},{taskInvocationId:'wrong'},{eventId:'wrong'},{causationId:''},{causationId:'missing'}])reject(plan({...valid,...change},[entry]));
 const question=plan(valid,[entry]).eventRecord;
 const reply=plan({caseId:'case-1',eventId:'reply',type:'REPLY'},[entry,question]).eventRecord;
 reject(plan(callback(entry,'work','DONE'),[entry,question,reply]));
 assert.equal(plan(callback(reply,'work','DONE'),[entry,question,reply]).action,'apply');
 reject(inspect([entry,{...question,taskInvocationId:''}]));
});
test('external edges remain external even from states with tasks; supplied result links still validate',()=>{
 const entry=first();assert.equal(plan({caseId:'case-1',eventId:'cancel',type:'CANCEL'},[entry]).result.outcome,'CANCELLED');
 reject(plan({caseId:'case-1',eventId:'wrong:result',taskInvocationId:'wrong',type:'CANCEL'},[entry]));
});
test('binding lookup isolates identical task names by machine and version',()=>{
 const invocation=plan(start()).taskInvocation;const binding={machine:'parcel',machineVersion:1,task:'work',workflowId:'correct'};
 const dispatch=rows=>execute('Prepare Task Dispatch',rows,{'Plan Transition':[{taskInvocation:invocation}]})[0].json;
 assert.equal(dispatch([{...binding,machine:'other',workflowId:'other'},{...binding,machineVersion:2,workflowId:'v2'},binding]).workflowId,'correct');
 for(const rows of [[],[{...binding,machine:'other'}],[{...binding,machineVersion:2}],[{...binding,workflowId:' '}],[binding,binding]])assert.equal(dispatch(rows).bindingAvailable,false);
 assert.deepEqual(node('Find Task Binding').parameters.filters.conditions.map(x=>x.keyName),['machine','machineVersion','task']);
});
test('catalog rejects malformed or duplicate definitions but does not depend on defaults',()=>{
 const prepared=execute('Prepare Event',[start()])[0].json;
 const load=rows=>execute('Load Machine Definitions',rows,{'Prepare Event':[prepared]});
 for(const rows of [[...catalog([parcel]),...catalog([parcel])],[{...catalog([parcel])[0],definition:'bad'}],[{...catalog([parcel])[0],machine:'wrong'}]])assert.throws(()=>load(rows));
 assert.equal(load(catalog([parcel]).map(row=>({...row,isDefault:false})))[0].json.definitions[0].machine,'parcel');
 reject(plan(start(),[],[]));
});

// Follow the generated post-plan graph, emulating only storage and subworkflow boundaries.
function dispatchGraph(planned, bindings = []) {
  const previous = { 'Plan Transition': [planned] };
  const writes = [], calls = [], visited = [];
  let name = 'Append Event?', items = [planned];
  const expression = source => new Function('$json', '$', 'return (' + source.slice(3, -2).trim() + ');')(
    items[0], key => ({first: () => ({json: previous[key][0]})}),
  );
  while (name) {
    visited.push(name);
    assert.ok(visited.length < 20, 'Dispatch graph terminates');
    const current = node(name); let port = 0;
    if (current.type === 'n8n-nodes-base.code') items = execute(name, items, previous).map(item => item.json);
    else if (current.type === 'n8n-nodes-base.if') {
      const condition = current.parameters.conditions.conditions[0];
      port = expression(condition.leftValue) === condition.rightValue ? 0 : 1;
    } else if (current.type === 'n8n-nodes-base.dataTable') {
      if (current.parameters.operation === 'insert') {
        const row = Object.fromEntries(Object.entries(current.parameters.columns.value).map(([key,value]) => [key,expression(value)]));
        writes.push(row); items = [{...row,id:123,createdAt:'storage-metadata'}];
      } else { assert.equal(name,'Find Task Binding'); items = bindings.length ? bindings : [{}]; }
    } else if (current.type === 'n8n-nodes-base.executeWorkflow') {
      calls.push({workflowId:expression(current.parameters.workflowId.value),input:structuredClone(items[0])});
      assert.equal(current.parameters.options.waitForSubWorkflow,false);
    } else assert.fail('Unexpected dispatch node ' + name);
    previous[name] = structuredClone(items);
    const links = workflow.connections[name]?.main?.[port] ?? [];
    assert.ok(links.length <= 1, 'No duplicated side-effect branch');
    name = links[0]?.node;
  }
  return {result:items[0],writes,calls,visited};
}

test('generated append/dispatch graph trims workflow IDs and sends only the task invocation contract',()=>{
  const planned = plan(start({payload:{message:'domain input',workflowId:'not routing'}}));
  const outcome = dispatchGraph(planned,[{machine:'parcel',machineVersion:1,task:'work',workflowId:'  real-workflow-id  '}]);
  assert.deepEqual(outcome.writes,[planned.eventRecord]);
  assert.deepEqual(outcome.calls,[{workflowId:'real-workflow-id',input:planned.taskInvocation}]);
  assert.deepEqual(Object.keys(outcome.calls[0].input).sort(),['caseId','task','taskInvocationId','triggerEventId','correlationId','state','machine','machineVersion','input'].sort());
  assert.ok(outcome.visited.indexOf('Append Event') < outcome.visited.indexOf('Run Task'));
  assert.equal(outcome.result.status,'applied');assert.equal(outcome.result.dispatch.status,'started');
  assert.equal(outcome.result.dispatch.taskInvocationId,planned.taskInvocation.taskInvocationId);
});

test('generated return branches avoid task input and invocation when no dispatch is permitted',()=>{
  const planned = plan(start());
  for (const bindings of [[],[{machine:'parcel',machineVersion:1,task:'work',workflowId:'   '}]]) {
    const unavailable = dispatchGraph(planned,bindings);
    assert.equal(unavailable.writes.length,1);assert.equal(unavailable.calls.length,0);
    assert.equal(unavailable.result.dispatch.status,'unavailable');assert.ok(!unavailable.visited.includes('Task Input'));
  }
  const passive=dispatchGraph(plan(start({type:'CANCEL'})));
  assert.equal(passive.writes.length,1);assert.equal(passive.calls.length,0);assert.equal(passive.result.currentState,'CLOSED');
  for(const request of [start(),{caseId:'case-1',operation:'inspect'},{caseId:'case-1',eventId:'bad',type:'INVALID'}]) {
    const outcome=dispatchGraph(plan(request,[planned.eventRecord]));
    assert.equal(outcome.writes.length,0);assert.equal(outcome.calls.length,0);
    assert.ok(!outcome.visited.includes('Task Input'));
  }
});
