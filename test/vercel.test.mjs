import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {createApp} from '../server.mjs';
import {readBody,requireRawWebhook} from '../lib/http-body.mjs';

test('Vercel routes endpoint and includes frontend assets in one function',async()=>{
 const cfg=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.equal(cfg.framework,null);
 assert.match(cfg.routes[0].dest,/vm_route/);
 assert.match(cfg.functions['api/index.mjs'].includeFiles,/dashboard/);
 assert.match(cfg.functions['api/index.mjs'].includeFiles,/config/);
});
test('reader handles Vercel parsed body, buffers and rejects body too large',async()=>{
 assert.equal((await readBody({body:{message:'hola'}},256)).toString('utf8'),JSON.stringify({message:'hola'}));
 assert.equal((await readBody({body:Buffer.from([0xff,0xd8,0xff])},256)).length,3);
 await assert.rejects(()=>readBody({body:'12345678'},4),e=>e.status===413);
 assert.throws(()=>requireRawWebhook({body:{entry:[]}}),e=>e.status===400);
 assert.doesNotThrow(()=>requireRawWebhook({body:Buffer.from('{}')}));
});
test('handler serverless retains private API/auth mode and static HTML',async t=>{
 let state={config:null,conversations:[],alerts:[],audit:[],events:[]};
 const store={load:async()=>structuredClone(state),save:async v=>{state=structuredClone(v)}};
 const handler=await createApp({SERVERLESS:'true',DASHBOARD_TOKEN:'test-token'},store);
 assert.equal(typeof handler,'function');
 const app=http.createServer(handler);
 await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));
 const base='http://127.0.0.1:'+app.address().port;
 let res=await fetch(base+'/auth/mode');assert.equal(res.status,200);assert.equal((await res.json()).mode,'token');
 res=await fetch(base+'/');assert.equal(res.status,200);assert.match(await res.text(),/loginScreen/);
 res=await fetch(base+'/api/services');assert.equal(res.status,401);
 res=await fetch(base+'/api/services',{headers:{Authorization:'Bearer test-token'}});
 assert.equal(res.status,200);assert.ok((await res.json()).services.length>0);
 res=await fetch(base+'/api/simulate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test-token'},
   body:JSON.stringify({text:'Hola, quiero averiguar un servicio',contact:'Simulado'})});
 assert.equal(res.status,200);assert.equal((await res.json()).channel,'simulador');
 res=await fetch(base+'/health');assert.equal(res.status,200);assert.equal((await res.json()).outbound,false);
});
