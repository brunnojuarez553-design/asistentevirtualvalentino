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
test('consulta de precio recibe orientación útil, turno pasa a revisión y reclamo a humano',async()=>{
 const run=text=>respond({text,config,conversation:{state:'ia',messages:[]}});
 const price=await run('cuánto cuesta');assert.equal(price.state,'ia');
 assert.match(price.reply,/motorización exacta/);assert.doesNotMatch(price.reply,/USD|\\$100/);
 const booking=await run('quiero un turno');assert.equal(booking.state,'revision');
 assert.match(booking.reply,/Valentino le confirmará personalmente/);
 assert.equal((await run('reclamo por garantía')).state,'humano');
});
test('modo humano no responde y Groq simula respuesta normal en el chat',async()=>{
 assert.equal((await respond({text:'hola',config,conversation:{state:'humano'}})).reply,null);
 const r=await respond({text:'hola',config,conversation:{state:'ia',messages:[]},
    provider:{draft:async()=> 'Saludos, con gusto le ayudamos.'}});
 assert.equal(r.state,'ia');assert.equal(r.reply,'Saludos, con gusto le ayudamos.');
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
 const c=await (await call('/api/simulate',{id:'e1',text:'cuanto cuesta',contact:'Prueba'})).json();assert.equal(c.state,'ia');assert.equal(c.messages.length,2);
 assert.deepEqual(await (await call('/api/simulate',{id:'e1',text:'cuanto cuesta'})).json(),{duplicate:true});
 await call('/api/conversation',{id:c.id,action:'state',state:'humano'});
 const paused=await (await call('/api/simulate',{conversationId:c.id,text:'hola'})).json();assert.equal(paused.state,'humano');assert.equal(paused.messages.length,3);
 assert.equal(state.conversations.length,1);assert.ok(state.audit.length>=3);
 assert.equal((await call('/api/conversation',{id:'missing',action:'state',state:'ia'})).status,404);
 assert.equal((await call('/')).status,200);
});


test('turnos tienen prioridad sobre cotizaciones y no se confirman automáticamente',async()=>{
 const r=await respond({text:'Cuánto cuesta y puedo agendar cita?',config,serviceId:'demo',vehicle,conversation:{state:'ia',channel:'whatsapp',messages:[]}});
 assert.equal(r.state,'revision');assert.match(r.reply,/confirmará personalmente/);assert.match(r.reason,/Valentino/);
 assert.equal(r.draft,null);
});
test('comentarios de Instagram se derivan a moderación y no generan respuestas públicas',async()=>{
 const r=await respond({text:'Precio para mi Toyota',config,serviceId:'demo',vehicle,conversation:{state:'ia',channel:'instagram_comentario',messages:[]}});
 assert.equal(r.state,'revision');assert.equal(r.reply,null);assert.match(r.reason,/Comentario público de Instagram/);
 const e=metaEvents({entry:[{changes:[{field:'comments',value:{id:'comment42',text:'Cuánto cuesta?',from:{id:'cliente42'}}}]}]});
 assert.equal(e.length,1);assert.equal(e[0].channel,'instagram_comentario');assert.equal(e[0].id,'ig-comment:comment42');
});
test('un saludo ya enviado no vuelve a repetirse en consultas normales',async()=>{
 const c={state:'ia',channel:'whatsapp',messages:[{role:'asistente',text:'Hola de Valentino'}]};
 const r=await respond({text:'tengo una duda',config,conversation:c});
 assert.equal(r.state,'ia');assert.ok(!r.reply.startsWith('Hola de Valentino'));
});
test('se puede simular canal WhatsApp e Instagram sin envíos y sin alertas repetidas',async t=>{
 let state={config:null,conversations:[],alerts:[],audit:[],events:[]};
 const store={load:async()=>structuredClone(state),save:async d=>{state=structuredClone(d);}};
 const app=await createApp({DASHBOARD_TOKEN:'test-secret'},store);
 await new Promise(r=>app.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>app.close(r)));
 const root='http://127.0.0.1:'+app.address().port;
 const post=async body=>{const r=await fetch(root+'/api/simulate',{method:'POST',headers:{Authorization:'Bearer test-secret','Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200);return r.json();};
 const c=await post({id:'test-comment-1',text:'Precio?',channel:'instagram_comentario',contact:'usuario de prueba'});
 assert.equal(c.channel,'instagram_comentario');assert.equal(c.state,'revision');assert.equal(c.messages.length,1);
 assert.equal(state.alerts.length,1);
 const next=await post({id:'test-comment-2',text:'Hola?',channel:'instagram_comentario',conversationId:c.id});
 assert.equal(next.messages.length,2);assert.equal(state.alerts.length,1);
 assert.equal(state.conversations.length,1);
});


test('pregunta sobre EGR Toyota Corolla 2025 usa Groq sin inventar precios',async()=>{
 let context;
 const result=await respond({text:'cuanto sale una eliminacion de egr para un toyota corolla 2025?',
   config:{...config,services:[{id:'egr',name:'Blindaje EGR',approved:false,active:true,prices:[]}]},
   conversation:{state:'ia',channel:'whatsapp',messages:[{role:'cliente',text:'cuanto sale una eliminacion de egr para un toyota corolla 2025?'}]},
   provider:{draft:async input=>{context=input;return 'Saludos, con gusto le orientamos. ¿Nos confirma la motorización exacta de ese Corolla 2025? El equipo revisará compatibilidad y presupuesto.'}}});
 assert.equal(result.state,'ia');assert.match(result.reply,/motorización/);
 assert.equal(context.catalog.length,1);assert.equal(context.services.length,0);
 assert.equal(context.kind,'price');
 assert.doesNotMatch(result.reply,/USD|\\$[0-9]/);
});
test('una falla de Groq no deja al cliente sin respuesta y no revela precios',async()=>{
 const result=await respond({text:'¿Cuánto cuesta la entonación?',config,
   conversation:{state:'ia',channel:'whatsapp',messages:[]},
   provider:{draft:async()=>{throw Error('secret token should not be revealed');}}});
 assert.equal(result.state,'ia');assert.match(result.reply,/motorización exacta/);
 assert.doesNotMatch(result.reply,/secret token/);
});

test('bloquea una cotización monetaria inventada por Groq sin reglas aprobadas',async()=>{
 const response=await respond({text:'¿Cuánto cuesta la eliminación de EGR?',config,
  conversation:{state:'ia',messages:[],channel:'whatsapp'},
  provider:{draft:async()=> 'Cuesta USD 750 y tiene garantía de 3 años.'}});
 assert.equal(response.state,'ia');
 assert.match(response.reply,/motorización exacta/);
 assert.doesNotMatch(response.reply,/750|USD|3 años/);
 assert.match(response.reason,/bloqueó un importe/);
});
test('estado de Groq no revela secretos ni activa envíos reales',async t=>{
 let state={config:null,conversations:[],alerts:[],audit:[],events:[]};
 const store={load:async()=>structuredClone(state),save:async data=>{state=structuredClone(data)}};
 const app=await createApp({DASHBOARD_TOKEN:'test',AI_ENABLED:'true',AI_PROVIDER:'groq',
   GROQ_API_KEY:'super-private-test-key',GROQ_MODEL:'llama-3.3-70b-versatile'},store);
 await new Promise(r=>app.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>app.close(r)));
 const root='http://127.0.0.1:'+app.address().port;
 assert.equal((await fetch(root+'/api/ai/status')).status,401);
 const response=await fetch(root+'/api/ai/status',{headers:{Authorization:'Bearer test'}});
 assert.equal(response.status,200);
 const status=await response.json();
 assert.equal(status.enabled,true);
 assert.equal(status.provider,'groq');
 assert.equal(status.model,'llama-3.3-70b-versatile');
 assert.equal(status.outbound,false);
 assert.ok(!JSON.stringify(status).includes('super-private-test-key'));
});
test('sin Groq no ofrece borrador en línea ni envía mensajes',async t=>{
 let state={config:null,conversations:[],alerts:[],audit:[],events:[]};
 const store={load:async()=>structuredClone(state),save:async data=>{state=structuredClone(data)}};
 const app=await createApp({DASHBOARD_TOKEN:'test'},store);
 await new Promise(r=>app.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>app.close(r)));
 const response=await fetch('http://127.0.0.1:'+app.address().port+'/api/ai/draft',{
  method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},
  body:JSON.stringify({id:'conversation-not-found'})});
 assert.equal(response.status,503);
 assert.match((await response.json()).error,/Groq/);
 assert.equal(state.conversations.length,0);
});
