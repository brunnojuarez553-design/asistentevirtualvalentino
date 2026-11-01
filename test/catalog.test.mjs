import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server.mjs';
import {validateService,toEngineService,SupabaseCatalog} from '../lib/catalog.mjs';

test('validación: servicio nuevo guarda borrador sin habilitar precios automáticos',()=>{
 const s=validateService({name:'Servicio nuevo de transmisión',category:'Mantenimiento',reference_price_usd:310,
   description:'Incluye inspección y fluidos',image_url:'https://res.cloudinary.com/example/image.jpg'});
 assert.equal(s.code,'servicio-nuevo-de-transmision');
 assert.equal(s.approved,false);
 assert.equal(s.needs_technical_review,true);
 assert.equal(s.reference_price_usd,310);
 assert.equal(toEngineService({...s,active:true}).prices.length,0);
});
test('separa aprobación comercial de revisión técnica y evita precios automáticos',()=>{
 assert.throws(()=>validateService({name:'Servicio de prueba',image_url:'javascript:alert(1)'}),/HTTPS/);
 assert.throws(()=>validateService({name:'Servicio de prueba',reference_price_usd:-5}),/positivo/);
 assert.throws(()=>validateService({name:'Servicio de prueba',approved:true}),/texto público/);
 assert.throws(()=>validateService({name:'Servicio de prueba',approved:true,public_copy:'Texto',active:false}),/servicio activo/);
 const commercial=validateService({name:'Servicio de prueba',approved:true,
  public_copy:'Te orientamos sobre este servicio. Confírmanos tu vehículo.',needs_technical_review:true,
  needs_legal_review:true,reference_price_usd:665});
 assert.equal(commercial.approved,true);
 assert.equal(commercial.needs_technical_review,true);
 assert.equal(commercial.needs_legal_review,true);
 const engine=toEngineService({...commercial,active:true});
 assert.equal(engine.approved,true);
 assert.equal(engine.needs_technical_review,true);
 assert.equal(engine.needs_legal_review,true);
 assert.deepEqual(engine.prices,[]);
});
test('Catálogo Supabase: crea, lista, modifica y archiva con servicio privado',async()=>{
 const bid=randomUUID();const saved=[];const calls=[];
 const fake=async(url,opt)=>{
   const u=new URL(url);const p=u.pathname;const m=opt.method||'GET';calls.push({p,m,key:opt.headers.apikey});
   let rows=[];
   if(p.endsWith('/vm_businesses'))rows=[{id:bid}];
   else if(p.endsWith('/vm_services')){
     if(m==='GET')rows=u.searchParams.has('id')?saved.filter(x=>x.id===u.searchParams.get('id').slice(3)):saved;
     if(m==='POST'){const body=JSON.parse(opt.body);const row={...body,id:randomUUID()};saved.push(row);rows=[row];}
     if(m==='PATCH'){const body=JSON.parse(opt.body);const row=saved.find(x=>x.id===u.searchParams.get('id').slice(3));if(row)Object.assign(row,body);rows=row?[row]:[];}
   }
   return {ok:true,status:200,json:async()=>structuredClone(rows)};
 };
 const db=new SupabaseCatalog({url:'https://ejemplo.supabase.co',key:'private-test',fetcher:fake});
 const created=await db.save({name:'Mantenimiento K320',reference_price_usd:340});
 assert.equal(created.code,'mantenimiento-k320');
 assert.equal((await db.list()).length,1);
 const edited=await db.save({...created,name:'Mantenimiento K320 CVT',reference_price_usd:345});
 assert.equal(edited.name,'Mantenimiento K320 CVT');assert.equal(edited.code,created.code);
 const archived=await db.archive({id:created.id});
 assert.equal(archived.active,false);assert.equal(archived.approved,false);
 assert.equal(calls.filter(x=>x.p.endsWith('/vm_businesses')).length,1);
 assert.ok(calls.every(x=>x.key==='private-test'));
});
test('API: crear/editar/archivar desde el panel no habilita atención real',async t=>{
 let state={config:null,conversations:[],alerts:[],audit:[],events:[]};
 const storage={load:async()=>structuredClone(state),save:async d=>{state=structuredClone(d);}};
 const app=await createApp({DASHBOARD_TOKEN:'token-only-for-test'},storage);
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>app.close(resolve)));
 const root='http://127.0.0.1:'+app.address().port;
 const api=async(path,body,auth=true)=>{
   const r=await fetch(root+'/api/'+path,{method:body?'POST':'GET',
     headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer token-only-for-test'}:{})},
     ...(body?{body:JSON.stringify(body)}:{})});
   return {status:r.status,body:await r.json()};
 };
 assert.equal((await api('services',null,false)).status,401);
 let list=await api('services');assert.equal(list.status,200);assert.ok(list.body.services.length>=11);
 const create=await api('services',{name:'Chequeo pre-viaje',category:'Diagnóstico',reference_price_usd:120});
 assert.equal(create.status,200);
 const id=create.body.service.id;assert.equal(create.body.service.approved,false);
 const update=await api('services',{id,name:'Chequeo integral pre-viaje',category:'Diagnóstico',
   approved:true,public_copy:'Te ayudamos con el chequeo. Indícanos tu vehículo.',needs_technical_review:true,needs_legal_review:false,reference_price_usd:120});
 assert.equal(update.status,200);assert.equal(update.body.service.approved,true);
 const workspace=await api('workspace');
 assert.equal(workspace.body.config.services.find(x=>x.id===id).approved,true);
 assert.deepEqual(workspace.body.config.services.find(x=>x.id===id).prices,[]);
 const archived=await api('services',{action:'archive',id});assert.equal(archived.status,200);
 assert.equal((await api('workspace')).body.config.services.find(x=>x.id===id).approved,false);
 assert.equal((await api('health')).status,405);
 assert.equal((await fetch(root+'/health').then(r=>r.json())).outbound,false);
});


test('Fotos: acepta solo JPG/PNG/WebP y no expone credenciales en la URL pública',async()=>{
 let uploaded;const fetcher=async(url,opt)=>{uploaded={url,opt};return {ok:true,status:200,json:async()=>({Key:'ok'})};};
 const store=new SupabaseCatalog({url:'https://ejemplo.supabase.co',key:'super-secret',fetcher});
 const jpg=Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10]);
 const uri=await store.uploadImage(jpg,'image/jpeg');
 assert.match(uri,/storage\/v1\/object\/public\/valentino-service-images\/[0-9a-f-]+\.jpg$/);
 assert.equal(uploaded.opt.headers.Authorization,'Bearer super-secret');
 assert.ok(!uri.includes('super-secret'));
 await assert.rejects(()=>store.uploadImage(jpg,'image/png'),/JPG, PNG o WebP/);
 await assert.rejects(()=>store.uploadImage(Buffer.from('<svg onload=alert(1)>'),'image/svg+xml'),/JPG, PNG o WebP/);
 await assert.rejects(()=>store.uploadImage(Buffer.alloc(5242881),'image/jpeg'),/menos de 5 MB/);
});
