import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {respond,quote} from '../lib/engine.mjs';
import {signature,metaEvents} from '../lib/security.mjs';
import {createApp} from '../server.mjs';
const vehicle={make:'Toyota',model:'Hilux',year:'2020',engine:'2.8'};
const config={tone:{greeting:'Hola de Valentino'},services:[{id:'demo',name:'Servicio de prueba',approved:true,prices:[{...vehicle,approved:true,amount:100,currency:'USD',validUntil:'2099-01-01'}]}]};
test('cotiza solamente combinación exacta aprobada y vigente',()=>{
 assert.equal(quote(config,'demo',vehicle).amount,100);
 for(const v of [{...vehicle,engine:'2.4'},{...vehicle,year:''},undefined])assert.equal(quote(config,'demo',v),null);
 const c=structuredClone(config);c.services[0].prices[0].validUntil='2000-01-01';assert.equal(quote(c,'demo',vehicle),null);
 c.services[0].prices[0].validUntil='2099-01-01';c.services[0].prices.push(c.services[0].prices[0]);assert.equal(quote(c,'demo',vehicle),null);
});
test('cotización incompleta y turno pasan a revisión; reclamo a humano',async()=>{
 const run=text=>respond({text,config,conversation:{state:'ia',messages:[]}});
 assert.equal((await run('cuánto cuesta')).state,'revision');assert.equal((await run('quiero un turno')).reply,null);assert.equal((await run('reclamo por garantía')).state,'humano');
});
test('modo humano no responde y proveedor externo siempre genera borrador',async()=>{
 assert.equal((await respond({text:'hola',config,conversation:{state:'humano'}})).reply,null);
 const r=await respond({text:'hola',config,conversation:{state:'ia',messages:[]},provider:{draft:async()=> 'Texto generado'}});assert.equal(r.state,'revision');assert.equal(r.reply,null);
});
test('firmas sobre cuerpo crudo y normalización Meta',()=>{
 const raw='{"a":1}',sig='sha256='+createHmac('sha256','secret').update(raw).digest('hex');assert.ok(signature(raw,sig,'secret'));assert.ok(!signature(raw+' ',sig,'secret'));assert.ok(!signature(raw,sig,''));
 assert.equal(metaEvents({entry:[{messaging:[{sender:{id:'x'},message:{mid:'1',text:'hola'}}]}]})[0].channel,'instagram');
 assert.equal(metaEvents({entry:[{messaging:[{message:{mid:'1',text:'hola',is_echo:true}}]}]}).length,0);
});
test('API protege acceso, persiste estados, evita duplicados y no envía a Meta',async t=>{
 let state={config:null,conversations:[],alerts:[],audit:[],events:[]};const store={load:async()=>structuredClone(state),save:async d=>{state=structuredClone(d);}};
 const app=await createApp({DASHBOARD_TOKEN:'test-secret'},store);await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));const root='http://127.0.0.1:'+app.address().port;
 const call=(path,body,auth=true)=>fetch(root+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer test-secret'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await call('/api/workspace',null,false)).status,401);
 assert.equal((await call('/webhooks/meta',{})).status,503);
 assert.equal((await call('/api/simulate',{text:''})).status,400);
 const c=await (await call('/api/simulate',{id:'e1',text:'cuanto cuesta',contact:'Prueba'})).json();assert.equal(c.state,'revision');assert.equal(c.messages.length,1);
 assert.deepEqual(await (await call('/api/simulate',{id:'e1',text:'cuanto cuesta'})).json(),{duplicate:true});
 await call('/api/conversation',{id:c.id,action:'state',state:'humano'});
 const paused=await (await call('/api/simulate',{conversationId:c.id,text:'hola'})).json();assert.equal(paused.state,'humano');assert.equal(paused.messages.length,2);
 assert.equal(state.conversations.length,1);assert.ok(state.audit.length>=3);
 assert.equal((await call('/api/conversation',{id:'missing',action:'state',state:'ia'})).status,404);
 assert.equal((await call('/')).status,200);
});
