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

test('identidad visual global y todas las vistas están conectadas',async()=>{
 const html=await readFile(new URL('../dashboard/index.html',import.meta.url),'utf8');
 const css=await readFile(new URL('../dashboard/visual-system.css',import.meta.url),'utf8');
 const js=await readFile(new URL('../dashboard/app.js',import.meta.url),'utf8');
 for(const id of ['overview','inbox','catalog','config','onboarding','channels','loginScreen',
   'toneForm','onboardingForm','serviceEditor','loginForm','mobileMenu','overviewConversations',
   'overviewPending','overviewServices','overviewApproved']){
   assert.match(html,new RegExp('id="'+id+'"'),'missing view/control '+id);
 }
 for(const view of ['overview','inbox','catalog','config','onboarding','channels']){
   assert.match(html,new RegExp('data-view="'+view+'"'),'missing nav '+view);
   assert.match(js,new RegExp("'"+view+"'"),'missing state '+view);
 }
 const officialLogo='/austral-logo.svg';
 assert.equal(html.split(officialLogo).length-1,5,'logo de Austral en acceso, presentación, sidebar, móvil y favicon');
 assert.match(html,/PLATAFORMA DE ATENCIÓN/);
 assert.doesNotMatch(html,/class="vm-mark"/);
 assert.doesNotMatch(html,/valentino-mark\.svg/);
 assert.match(html,/visual-system.css/);
 assert.match(css,/--red:#f0a15e/);
 assert.match(css,/prefers-reduced-motion/);
 assert.doesNotMatch(html,/value="cornacchia.valentino92@gmail.com"/);
});
test('aplicación entrega CSS premium y redirige relevamiento al onboarding',async t=>{
 const store={load:async()=>({config:null,conversations:[],alerts:[],audit:[],events:[]}),
   save:async()=>{}};
 const app=await createApp({DASHBOARD_TOKEN:'test-token'},store);
 await new Promise(r=>app.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>app.close(r)));
 const base='http://127.0.0.1:'+app.address().port;
 const css=await fetch(base+'/visual-system.css');
 assert.equal(css.status,200);
 assert.match(css.headers.get('content-type'),/text\/css/);
 assert.match(await css.text(),/AUSTRAL WEB STUDIO/);
 const redirect=await fetch(base+'/relevamiento',{redirect:'manual'});
 assert.equal(redirect.status,302);
 assert.equal(redirect.headers.get('location'),'/'+'#onboarding');
});

test('asset oficial del sitio en tarjetas de catálogo y CSS de logo circular',async()=>{
 const app=await readFile(new URL('../dashboard/app.js',import.meta.url),'utf8');
 const css=await readFile(new URL('../dashboard/visual-system.css',import.meta.url),'utf8');
 assert.match(app,/IMG_6676_jbholt\.jpg/);
 assert.match(css,/official-brand-logo\{/);
 assert.match(css,/border-radius:50%/);
 assert.doesNotMatch(css,/\.vm-mark/);
});

test('el simulador conserva vehículo estructurado sin heredar datos de otro modelo',async t=>{
 let state={config:null,conversations:[],alerts:[],audit:[],events:[]};
 const store={load:async()=>structuredClone(state),save:async v=>{state=structuredClone(v)}};
 const app=await createApp({DASHBOARD_TOKEN:'vehicle-test'},store);
 await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));
 const base='http://127.0.0.1:'+app.address().port;
 const send=async(text)=>{const r=await fetch(base+'/api/simulate',{method:'POST',
  headers:{Authorization:'Bearer vehicle-test','Content-Type':'application/json'},
  body:JSON.stringify({text,contact:'Cliente vehículo'})});
  assert.equal(r.status,200);return r.json();};
 let c=await send('Tengo una Toyota Hilux 2020 motor 2.8');
 assert.equal(c.vehicle.model.toLowerCase(),'hilux');
 assert.equal(c.vehicle.engine,'2.8');
 c=await send('Ahora consulto por un Corolla');
 assert.equal(c.vehicle.model.toLowerCase(),'corolla');
 assert.equal(c.vehicle.year,'');
 assert.equal(c.vehicle.engine,'');
});
