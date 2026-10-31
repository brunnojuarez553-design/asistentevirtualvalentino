import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {respond} from './lib/engine.mjs';
import {same,signature,metaEvents} from './lib/security.mjs';
import {Store} from './lib/store.mjs';
import {createProvider} from './lib/provider.mjs';

export async function createApp(env=process.env, store=new Store(env.STORAGE==='supabase'?{url:env.SUPABASE_URL,key:env.SUPABASE_SERVICE_ROLE_KEY}:{})) {
  if(env.STORAGE==='supabase' && (!env.SUPABASE_URL?.startsWith('https://')||!env.SUPABASE_SERVICE_ROLE_KEY))throw Error('Supabase configuration missing');
  if(env.NODE_ENV==='production' && (!env.DASHBOARD_TOKEN || env.DASHBOARD_TOKEN.length<32 || env.STORAGE!=='supabase'))throw Error('Production requires Supabase and a dashboard token of at least 32 characters');
  const defaults=JSON.parse(await readFile(new URL('./config/default.json',import.meta.url),'utf8'));
  const provider=createProvider(env);
  let queue=Promise.resolve();
  const mutate=fn=>{const next=queue.then(async()=>{const data=await store.load();data.config ||= structuredClone(defaults);const result=await fn(data);await store.save(data);return result;});queue=next.catch(()=>{});return next;};
  const audit=(d,action,id)=>d.audit.push({id:randomUUID(),at:new Date().toISOString(),action,conversationId:id});
  async function incoming(d,{id=randomUUID(),contact='Cliente de prueba',text,channel='simulador',conversationId,vehicle,serviceId}) {
    if(d.events.includes(id))return {duplicate:true};
    let c=conversationId ? d.conversations.find(c=>c.id===conversationId) : d.conversations.find(c=>c.contact===contact && c.channel===channel);
    if(conversationId&&!c)throw Object.assign(Error('Conversación inexistente'),{status:404});
    if(!c){c={id:randomUUID(),contact,channel,state:'ia',messages:[],createdAt:new Date().toISOString()};d.conversations.unshift(c);}
    c.messages.push({id,role:'cliente',text,at:new Date().toISOString()});
    const result=await respond({text,conversation:c,config:d.config,vehicle,serviceId,provider});
    c.state=result.state;c.draft=result.draft||c.draft||null;c.reason=c.reason && result.reason==='Atención pausada para intervención del equipo.' ? c.reason : (result.reason||c.reason||null);
    if(result.reply)c.messages.push({id:randomUUID(),role:'asistente',text:result.reply,at:new Date().toISOString(),delivery:'simulada'});
    if(c.state!=='ia' && !d.alerts.some(a=>a.conversationId===c.id&&!a.resolved))d.alerts.unshift({id:randomUUID(),conversationId:c.id,text:c.reason||'Nueva consulta pendiente',at:new Date().toISOString(),resolved:false});
    d.events.push(id);audit(d,'mensaje_recibido',c.id);return c;
  }
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    try {
      if(url.pathname==='/health')return send(200,{ok:true,mode:'simulation',outbound:false});
      if(url.pathname==='/webhooks/meta' && req.method==='GET'){
        if(env.META_WEBHOOKS_ENABLED!=='true')return send(503,{error:'Webhooks desactivados'});
        if(url.searchParams.get('hub.mode')!=='subscribe'||!same(url.searchParams.get('hub.verify_token'),env.META_VERIFY_TOKEN))return send(403,{error:'Verificación inválida'});
        const challenge=url.searchParams.get('hub.challenge');if(!challenge||challenge.length>200)return send(400,{error:'Challenge inválido'});res.writeHead(200,{'Content-Type':'text/plain'});return res.end(challenge);
      }
      if(!url.pathname.startsWith('/api/') && url.pathname!=='/webhooks/meta'){
        if(req.method!=='GET')return send(405,{error:'Método no permitido'});
        const files={'/':'dashboard/index.html','/dashboard':'dashboard/index.html','/app.js':'dashboard/app.js','/style.css':'dashboard/style.css','/relevamiento':'index.html'};
        if(!files[url.pathname])return send(404,{error:'No encontrado'});
        if(url.pathname==='/relevamiento')res.removeHeader('Content-Security-Policy');
        const path=files[url.pathname];res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'});return res.end(await readFile(new URL(path,import.meta.url)));
      }
      if(url.pathname.startsWith('/api/')){
        if(env.DASHBOARD_TOKEN ? !same(req.headers.authorization,`Bearer ${env.DASHBOARD_TOKEN}`) : !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return send(401,{error:'Acceso no autorizado'});
        if(req.headers.origin && req.headers.origin!==`http://${req.headers.host}` && req.headers.origin!==`https://${req.headers.host}`)return send(403,{error:'Origen inválido'});
      }
      if(url.pathname==='/api/workspace'&&req.method==='GET') {await queue;const data=await store.load();return send(200,{...data,config:data.config||defaults,mode:'simulation',outbound:false});}
      if(req.method!=='POST')return send(405,{error:'Método no permitido'});
      if(url.pathname==='/webhooks/meta'&&env.META_WEBHOOKS_ENABLED!=='true')return send(503,{error:'Webhooks desactivados'});
      let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>65536)return send(413,{error:'Mensaje demasiado grande'});}
      if(url.pathname==='/webhooks/meta'&&!signature(raw,req.headers['x-hub-signature-256'],env.META_APP_SECRET))return send(403,{error:'Firma inválida'});
      let body;try{body=JSON.parse(raw);}catch{return send(400,{error:'JSON inválido'});}
      if(url.pathname==='/webhooks/meta') {if(!Array.isArray(body.entry))return send(400,{error:'Evento inválido'});const events=metaEvents(body);await mutate(async d=>{for(const e of events)if(typeof e.text==='string'&&e.text.length<=4000)await incoming(d,e);});return send(200,{received:true,outbound:false});}
      if(url.pathname==='/api/simulate'){
        if(typeof body.text!=='string'||!body.text.trim()||body.text.length>4000||body.contact?.length>120)return send(400,{error:'Ingresá un mensaje de hasta 4000 caracteres'});
        const channel=['simulador','whatsapp','instagram','instagram_comentario'].includes(body.channel)?body.channel:'simulador';
        return send(200,await mutate(d=>incoming(d,{...body,channel})));
      }
      if(url.pathname==='/api/config'){
        if(!body.tone || typeof body.tone.greeting!=='string'||!body.tone.greeting.trim()||!Array.isArray(body.services)||body.services.some(s=>!s.id||!s.name||!Array.isArray(s.prices)))return send(400,{error:'Configuración inválida: cada servicio requiere id, name y prices'});
        await mutate(d=>{d.config=body;audit(d,'configuracion_actualizada');});return send(200,{ok:true});
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
  });
  return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const app=await createApp();app.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log(`Valentino: http://127.0.0.1:${process.env.PORT||3000} · simulación, sin envíos reales`));}
