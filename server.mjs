import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {respond} from './lib/engine.mjs';
import {same,signature,metaEvents} from './lib/security.mjs';
import {Store} from './lib/store.mjs';
import {createProvider} from './lib/provider.mjs';
import {SupabaseCatalog,validateService,fromEngineService,toEngineService} from './lib/catalog.mjs';
import {PanelAuth} from './lib/panel-auth.mjs';
import {readBody,requireRawWebhook} from './lib/http-body.mjs';

export async function createApp(env=process.env, store=new Store(env.STORAGE==='supabase'?{url:env.SUPABASE_URL,key:env.SUPABASE_SERVICE_ROLE_KEY}:{})) {
  if(env.STORAGE==='supabase' && (!env.SUPABASE_URL?.startsWith('https://')||!env.SUPABASE_SERVICE_ROLE_KEY))throw Error('Supabase configuration missing');
  const authMode=env.AUTH_MODE || (env.NODE_ENV==='production'?'supabase':'token');
  if(env.NODE_ENV==='production' && (authMode!=='supabase'||env.STORAGE!=='supabase'))throw Error('Production requires Supabase Auth and Supabase storage');
  const panelAuth=authMode==='supabase'?
    new PanelAuth({url:env.SUPABASE_URL,publishableKey:env.SUPABASE_PUBLISHABLE_KEY,secretKey:env.SUPABASE_SERVICE_ROLE_KEY}):null;
  const defaults=JSON.parse(await readFile(new URL('./config/default.json',import.meta.url),'utf8'));
  const provider=createProvider(env);
  const loginAttempts=new Map();
  const catalog=env.STORAGE==='supabase' ? new SupabaseCatalog({url:env.SUPABASE_URL,key:env.SUPABASE_SERVICE_ROLE_KEY}) : null;
  let queue=Promise.resolve();
  const mutate=fn=>{const next=queue.then(async()=>{const data=await store.load();data.config ||= structuredClone(defaults);const result=await fn(data);await store.save(data);return result;});queue=next.catch(()=>{});return next;};
  const audit=(d,action,id)=>d.audit.push({id:randomUUID(),at:new Date().toISOString(),action,conversationId:id});
  // Un único catálogo de origen: tablas vm_services en Supabase o workspace local en pruebas.
  const serviceRows=async d=>catalog?await catalog.list():(d.config?.services||defaults.services).map(fromEngineService);
  const engineConfig=async d=>({...d.config,services:(await serviceRows(d)).map(toEngineService)});
  const localServiceSave=async (d,body)=>{
    d.config ||= structuredClone(defaults);
    d.config.services ||= [];
    const list=d.config.services;
    const previous=body.id?list.find(x=>x.id===body.id):null;
    if(body.id&&!previous)throw Object.assign(Error('No se encontró el servicio'),{status:404});
    const parsed=validateService(body,previous?{code:previous.id}:{});
    if(!previous&&list.some(x=>x.id===parsed.code))throw Object.assign(Error('Código de servicio duplicado'),{status:409});
    const record=fromEngineService({...toEngineService({...parsed,id:parsed.code}),...parsed,id:parsed.code});
    // Conservamos price rules sólo si existen y el negocio no está modificando precios especiales.
    const next={...parsed,id:parsed.code,referencePriceUsd:parsed.reference_price_usd,
      referenceCurrency:'USD',referenceOnly:true,prices:previous?.prices||[],approved:parsed.approved,
      publicCopy:parsed.public_copy,warranty:parsed.warranty_terms,imageUrl:parsed.image_url};
    if(previous)list.splice(list.indexOf(previous),1,next);else list.push(next);
    audit(d,previous?'servicio_editado':'servicio_creado');
    return {...record,...parsed,id:parsed.code};
  };
  async function incoming(d,{id=randomUUID(),contact='Cliente de prueba',text,channel='simulador',conversationId,vehicle,serviceId}) {
    if(d.events.includes(id))return {duplicate:true};
    let c=conversationId ? d.conversations.find(c=>c.id===conversationId) : d.conversations.find(c=>c.contact===contact && c.channel===channel);
    if(conversationId&&!c)throw Object.assign(Error('Conversación inexistente'),{status:404});
    if(!c){c={id:randomUUID(),contact,channel,state:'ia',messages:[],createdAt:new Date().toISOString()};d.conversations.unshift(c);}
    c.messages.push({id,role:'cliente',text,at:new Date().toISOString()});
    const result=await respond({text,conversation:c,config:await engineConfig(d),vehicle,serviceId,provider});
    c.state=result.state;c.draft=result.draft||c.draft||null;c.reason=c.reason && result.reason==='Atención pausada para intervención del equipo.' ? c.reason : (result.reason||c.reason||null);
    if(result.reply)c.messages.push({id:randomUUID(),role:'asistente',text:result.reply,at:new Date().toISOString(),delivery:'simulada'});
    if(c.state!=='ia' && !d.alerts.some(a=>a.conversationId===c.id&&!a.resolved))d.alerts.unshift({id:randomUUID(),conversationId:c.id,text:c.reason||'Nueva consulta pendiente',at:new Date().toISOString(),resolved:false});
    d.events.push(id);audit(d,'mensaje_recibido',c.id);return c;
  }
  const handler=async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self' https: data:; frame-ancestors 'none'; base-uri 'none'");
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    try {
      if(url.pathname==='/health')return send(200,{ok:true,mode:'simulation',outbound:false});
      if(url.pathname==='/auth/mode' && req.method==='GET')return send(200,{mode:authMode});
      if(url.pathname==='/auth/login' && req.method==='POST'){
        if(!panelAuth)return send(404,{error:'Acceso con cuenta desactivado en entorno local'});
        const ip=req.socket.remoteAddress||'unknown';
        const now=Date.now();
        for(const [key,value] of loginAttempts)if(now-value.since>900000)loginAttempts.delete(key);
        const attempt=loginAttempts.get(ip);
        if(attempt?.count>=6)return send(429,{error:'Demasiados intentos. Probá más tarde.'});
        const raw=(await readBody(req,2048)).toString('utf8');
        let body;try{body=JSON.parse(raw)}catch{return send(400,{error:'Solicitud inválida'})}
        try{
          const session=await panelAuth.signIn(body?.email,body?.password);
          loginAttempts.delete(ip);
          return send(200,session);
        }catch(error){
          if(error.status===401){
            const old=loginAttempts.get(ip);
            loginAttempts.set(ip,old?{count:old.count+1,since:old.since}:{count:1,since:now});
          }
          return send(error.status||503,{error:error.status?error.message:'No se pudo verificar la cuenta'});
        }
      }
      if(url.pathname==='/webhooks/meta' && req.method==='GET'){
        if(env.META_WEBHOOKS_ENABLED!=='true')return send(503,{error:'Webhooks desactivados'});
        if(url.searchParams.get('hub.mode')!=='subscribe'||!same(url.searchParams.get('hub.verify_token'),env.META_VERIFY_TOKEN))return send(403,{error:'Verificación inválida'});
        const challenge=url.searchParams.get('hub.challenge');if(!challenge||challenge.length>200)return send(400,{error:'Challenge inválido'});res.writeHead(200,{'Content-Type':'text/plain'});return res.end(challenge);
      }
      if(!url.pathname.startsWith('/api/') && url.pathname!=='/webhooks/meta'){
        if(req.method!=='GET')return send(405,{error:'Método no permitido'});
        if(url.pathname==='/relevamiento'){
          res.writeHead(302,{Location:'/#onboarding','Cache-Control':'no-store'});return res.end();
        }
        const files={'/':'dashboard/index.html','/dashboard':'dashboard/index.html','/app.js':'dashboard/app.js','/style.css':'dashboard/style.css','/visual-system.css':'dashboard/visual-system.css'};
        if(!files[url.pathname])return send(404,{error:'No encontrado'});
        const path=files[url.pathname];res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'});return res.end(await readFile(new URL(path,import.meta.url)));
      }
      if(url.pathname.startsWith('/api/')){
        if(panelAuth){
          const authorization=String(req.headers.authorization||'');
          if(!authorization.startsWith('Bearer '))return send(401,{error:'Iniciá sesión para continuar'});
          req.panelUser=await panelAuth.authenticate(authorization.slice(7));
          if(req.method!=='GET' &&
             ['/api/services','/api/service-image','/api/config'].includes(url.pathname) &&
             !['owner','admin'].includes(req.panelUser.role))
            return send(403,{error:'No tenés permisos para modificar servicios y configuración'});
        }else if(env.DASHBOARD_TOKEN
          ? !same(req.headers.authorization,`Bearer ${env.DASHBOARD_TOKEN}`)
          : !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))
            return send(401,{error:'Acceso no autorizado'});
        if(req.headers.origin && req.headers.origin!==`http://${req.headers.host}` &&
           req.headers.origin!==`https://${req.headers.host}`)
          return send(403,{error:'Origen inválido'});
      }
      if(url.pathname==='/api/services' && req.method==='GET'){
        await queue;const d=await store.load();return send(200,{services:await serviceRows(d)});
      }
      if(url.pathname==='/api/workspace'&&req.method==='GET') {
        await queue;const data=await store.load();
        return send(200,{...data,config:await engineConfig({...data,config:data.config||defaults}),mode:'simulation',outbound:false});
      }
      if(req.method!=='POST')return send(405,{error:'Método no permitido'});
      if(url.pathname==='/api/service-image') {
        if(!catalog)return send(503,{error:'La subida de fotos requiere configurar Supabase en el servidor'});
        const image=await readBody(req,5242880);
        const imageUrl=await catalog.uploadImage(image,req.headers['content-type']);
        return send(200,{image_url:imageUrl});
      }
      if(url.pathname==='/webhooks/meta'&&env.META_WEBHOOKS_ENABLED!=='true')return send(503,{error:'Webhooks desactivados'});
      if(url.pathname==='/webhooks/meta')requireRawWebhook(req);
      const raw=(await readBody(req,65536)).toString('utf8');
      if(url.pathname==='/webhooks/meta'&&!signature(raw,req.headers['x-hub-signature-256'],env.META_APP_SECRET))return send(403,{error:'Firma inválida'});
      let body;try{body=JSON.parse(raw);}catch{return send(400,{error:'JSON inválido'});}
      if(url.pathname==='/webhooks/meta') {if(!Array.isArray(body.entry))return send(400,{error:'Evento inválido'});const events=metaEvents(body);await mutate(async d=>{for(const e of events)if(typeof e.text==='string'&&e.text.length<=4000)await incoming(d,e);});return send(200,{received:true,outbound:false});}
      if(url.pathname==='/api/services'){
        if(body.action==='archive'){
          if(catalog)return send(200,{service:await catalog.archive(body)});
          return send(200,{service:await mutate(d=>{
            const found=(d.config?.services||[]).find(s=>s.id===body.id);
            if(!found)throw Object.assign(Error('Servicio inexistente'),{status:404});
            found.active=false;found.approved=false;audit(d,'servicio_archivado');return fromEngineService(found);
          })});
        }
        const service=catalog?await catalog.save(body):await mutate(d=>localServiceSave(d,body));
        return send(200,{service});
      }
      if(url.pathname==='/api/simulate'){
        if(typeof body.text!=='string'||!body.text.trim()||body.text.length>4000||body.contact?.length>120)return send(400,{error:'Ingresá un mensaje de hasta 4000 caracteres'});
        const channel=['simulador','whatsapp','instagram','instagram_comentario'].includes(body.channel)?body.channel:'simulador';
        return send(200,await mutate(d=>incoming(d,{...body,channel})));
      }
      if(url.pathname==='/api/config'){
        if(!body.tone || typeof body.tone.greeting!=='string'||!body.tone.greeting.trim()||
           typeof body.tone.style!=='string')return send(400,{error:'El tono de la IA es inválido'});
        await mutate(d=>{
          d.config ||= structuredClone(defaults);
          d.config={...d.config,tone:body.tone,business:body.business||d.config.business,
            notice:typeof body.notice==='string'?body.notice:d.config.notice};
          audit(d,'tono_actualizado');
        });
        return send(200,{ok:true});
      }
      if(url.pathname==='/api/conversation'){
        return send(200,await mutate(d=>{
          const c=d.conversations.find(c=>c.id===body.id);if(!c)throw Object.assign(Error('Conversación inexistente'),{status:404});
          if(body.action==='state'&&['ia','revision','humano'].includes(body.state)){c.state=body.state;audit(d,`estado_${body.state}`,c.id);}
          else if(body.action==='reply'&&typeof body.text==='string'&&body.text.trim()&&body.text.length<=4000){c.messages.push({id:randomUUID(),role:'equipo',text:body.text,at:new Date().toISOString(),delivery:'simulada'});c.draft=null;audit(d,'respuesta_humana_simulada',c.id);}
          else throw Object.assign(Error('Acción inválida'),{status:400});
          d.alerts.filter(a=>a.conversationId===c.id).forEach(a=>a.resolved=true);return c;
        }));
      }
      return send(404,{error:'No encontrado'});
    }catch(e){send(e.status||500,{error:e.status?e.message:'No se pudo completar la operación; los datos no se confirmaron.'});}
  };
  return env.SERVERLESS==='true'?handler:http.createServer(handler);
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const app=await createApp();app.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log(`Valentino: http://127.0.0.1:${process.env.PORT||3000} · simulación, sin envíos reales`));}
