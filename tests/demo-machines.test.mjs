import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {createDemoServer} from '../server/demo-server.mjs';
import {parseMachine,canonicalJson,parseMachineCatalog} from '../shared/machine-validation.mjs';
const definition={machine:'sample',version:1,initial:'OPEN',states:{OPEN:{on:{RECEIVED:{target:'CLOSED'}}},CLOSED:{final:true}}};
const stored=(definition,isDefault=false)=>({machine:definition.machine,version:definition.version,definition:canonicalJson(definition),isDefault});
const initial=stored(definition,true);
async function withServer(rows,run){
  const calls=[];
  const server=createDemoServer({host:'https://n8n.example',apiKey:'private',token:'private',fetchImpl:async(url,options)=>{
    calls.push({url:String(url),options});
    if(String(url).includes('/webhook/'))return Response.json({status:'inspected',sequence:1,currentState:'CLOSED',outcome:null});
    if(String(url).includes('TjuB58skTvPRCwB3'))return Response.json({data:[{caseId:'case-1',eventId:'e1',sequence:1,type:'RECEIVED',machine:'sample',machineVersion:1,payload:'{}'}]});
    if(String(url).includes('1NakvVeVYx0CI2hU'))return Response.json({data:[]});
    assert.ok(String(url).includes('Lm8JZL9uCNqj14vE'));
    if(options.method==='POST'){rows.push(...JSON.parse(options.body).data);return Response.json({success:true});}
    return Response.json({data:rows});
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const call=(path,body)=>new Promise((resolve,reject)=>{
    const req=request({host:'127.0.0.1',port:server.address().port,path,method:body===undefined?'GET':'POST',headers:{host:'localhost:5174',origin:'http://localhost:5173','content-type':'application/json'}},res=>{let raw='';res.on('data',chunk=>raw+=chunk);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(raw)}));});req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
  });
  try{await run(call,calls);}finally{await new Promise(resolve=>server.close(resolve));}
}
test('shared validator rejects unsupported and malformed graphs while preserving metadata',()=>{
  assert.equal(parseMachine(definition),definition);
  const changed=change=>({...definition,...change});
  for(const invalid of [changed({initial:'missing'}),changed({version:0}),changed({states:{OPEN:{on:{GO:{target:'missing'}}}}}),changed({states:{OPEN:{final:true,on:{GO:{target:'OPEN'}}}}}),changed({states:{OPEN:{tasks:['a','b']}}}),changed({states:{OPEN:{on:{GO:{target:'OPEN'}},decide:{GO:{target:'OPEN'}}}}}),changed({states:{OPEN:{entry:'execute'}}}),changed({states:{OPEN:{on:{GO:{target:'OPEN',guard:'check'}}}}})])assert.throws(()=>parseMachine(invalid));
  const rich={...definition,description:'Example',metadata:{author:'demo'}};assert.deepEqual(parseMachine(rich),rich);
  for(const rows of [[],[initial,initial],[{...initial,machine:'wrong'}],[{...initial,isDefault:false}],[{...initial,isDefault:'true'}]])assert.throws(()=>parseMachineCatalog(rows));
});
test('machine saves are immutable, idempotent and never activate new definitions',async()=>{
  const rows=[initial];await withServer(rows,async(call,calls)=>{
    const list=await call('/api/machines');assert.equal(list.status,200);assert.deepEqual(list.body.default,{machine:'sample',version:1});
    const reversed={states:definition.states,initial:'OPEN',version:1,machine:'sample'};
    const same=await call('/api/machines',{definition:reversed});assert.equal(same.status,200);assert.equal(same.body.created,false);
    assert.equal(calls.filter(call=>call.options.method==='POST').length,0);
    const conflict=await call('/api/machines',{definition:{...definition,description:'changed'}});assert.equal(conflict.status,409);
    const next={...definition,version:2};const created=await call('/api/machines',{definition:next});assert.equal(created.status,201);assert.equal(created.body.created,true);assert.equal(created.body.machine.isDefault,false);
    assert.equal(rows.length,2);assert.equal(rows[0].isDefault,true);assert.equal(rows[1].isDefault,false);
    assert.deepEqual((await call('/api/config')).body.machine,definition);
    assert.deepEqual((await call('/api/cases/case-1')).body.machine,definition);
    assert.equal((await call('/api/machines',{definition:next,isDefault:true})).status,400);
    assert.equal((await call('/api/machines',{definition:{...next,initial:'missing'}})).status,400);
    assert.equal(rows.length,2);
  });
});
test('catalog reads and writes fail closed on duplicate or malformed stored identities',async()=>{
  for(const rows of [[initial,initial],[{...initial,definition:'not json'}],[{...initial,isDefault:false}]])await withServer(rows,async call=>{
    assert.equal((await call('/api/machines')).status,502);
    assert.equal((await call('/api/machines',{definition:{...definition,version:2}})).status,502);
  });
});

test('machine saves accept definitions above 8 KiB but reject requests above 256 KiB without writes',async()=>{
  const rows=[initial];await withServer(rows,async(call,calls)=>{
    const large={...definition,version:2,description:'x'.repeat(12000)};
    const accepted=await call('/api/machines',{definition:large});assert.equal(accepted.status,201);
    assert.equal(rows.length,2);
    const writes=calls.filter(call=>call.options.method==='POST').length;
    const oversized=await call('/api/machines',{definition:{...large,version:3,description:'x'.repeat(262144)}});
    assert.equal(oversized.status,413);
    assert.equal(calls.filter(call=>call.options.method==='POST').length,writes);
    assert.equal(rows.length,2);
  });
});
