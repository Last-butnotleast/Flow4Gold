import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {createDemoServer,orderInput,orderRow} from '../server/demo-server.mjs';
const input={itemName:' Travel mug ',amount:25,currency:'EUR',duplicateCharge:true};
const row={...input,itemName:'Travel mug',orderReference:'1042',paymentReference:'demo-payment-1042'};
test('order input validates catalog facts and forbids caller references or privileged fields',()=>{
  assert.equal(orderInput(input).itemName,'Travel mug');
  for(const change of [{amount:0},{amount:-1},{amount:NaN},{amount:Infinity},{amount:1000001},{amount:1.001},{amount:'25'},{currency:'eur'},{currency:'EURO'},{duplicateCharge:'true'},{itemName:' '},{itemName:'x'.repeat(121)},{orderReference:'1042'},{paymentReference:'replace'},{simulation:false}])assert.throws(()=>orderInput({...input,...change}),{status:400});
  assert.equal(orderInput({...input,amount:19.99}).amount,19.99);
  assert.deepEqual(orderRow({...row,id:99,createdAt:'hidden'}),row);
  assert.throws(()=>orderRow({...row,duplicateCharge:'false'}),{status:502});
});
async function withServer(fetchImpl,run){
  const server=createDemoServer({host:'https://n8n.example',apiKey:'private-api-key',token:'private-token',fetchImpl});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const call=(path,{method='GET',body,host='localhost:5174',origin='http://localhost:5173'}={})=>new Promise((resolve,reject)=>{
    const req=request({host:'127.0.0.1',port:server.address().port,path,method,headers:{host,origin,'content-type':'application/json'}},res=>{let raw='';res.on('data',chunk=>raw+=chunk);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(raw)}));});req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
  });
  try{await run(call);}finally{await new Promise(resolve=>server.close(resolve));}
}
test('order APIs read live catalog, insert generated references and expose no credentials',async()=>{
  const calls=[];
  await withServer(async(url,options)=>{
    calls.push({url:String(url),options});
    if(String(url).includes('Lm8JZL9uCNqj14vE'))return Response.json({data:[{machine:'customer-refund',version:1,isDefault:true,definition:JSON.stringify({machine:'customer-refund',version:1,initial:'OPEN',states:{OPEN:{final:true}}})}]});
    return Response.json(options.method==='POST'?{data:JSON.parse(options.body).data}:{data:[{...row,id:1}]});
  },async call=>{
    const listed=await call('/api/orders');assert.equal(listed.status,200);assert.deepEqual(listed.body,{orders:[row]});
    const config=await call('/api/config');assert.deepEqual(config.body.sampleOrders,[row]);
    const created=await call('/api/orders',{method:'POST',body:input});assert.equal(created.status,201);
    assert.match(created.body.order.orderReference,/^demo-[a-f0-9-]{36}$/);assert.match(created.body.order.paymentReference,/^demo-payment-/);
    assert.equal(created.body.order.itemName,'Travel mug');
    const write=calls.find(call=>call.options.method==='POST');assert.deepEqual(JSON.parse(write.options.body),{data:[created.body.order]});
    assert.ok(calls.every(call=>/^https:\/\/n8n.example\/api\/v1\/data-tables\/(1NakvVeVYx0CI2hU|Lm8JZL9uCNqj14vE)\/rows/.test(call.url)));
    assert.ok(calls.every(call=>call.options.headers['X-N8N-API-KEY']==='private-api-key'));
    assert.ok(!JSON.stringify(created.body).includes('private-'));
  });
});
test('invalid creation, foreign origin and host never access n8n; duplicate catalog fails closed',async()=>{
  let calls=0;
  await withServer(async()=>{calls++;return Response.json({data:[row,row]});},async call=>{
    assert.equal((await call('/api/orders',{method:'POST',body:{...input,amount:0}})).status,400);
    assert.equal((await call('/api/orders',{origin:'https://foreign.example'})).status,403);
    assert.equal((await call('/api/orders',{host:'foreign.example'})).status,403);
    assert.equal(calls,0);
    assert.equal((await call('/api/orders')).status,502);
    assert.equal(calls,1);
  });
});
