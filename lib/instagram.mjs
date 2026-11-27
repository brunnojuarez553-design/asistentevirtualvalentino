import {randomBytes,createHash} from 'node:crypto';
import {CredentialVault} from './credential-vault.mjs';
import {same} from './security.mjs';
import {fail} from './tenants.mjs';
export const instagramCookie='__Host-aws-instagram-state';
const digest=s=>createHash('sha256').update('instagram:'+s).digest('hex');
const id=s=>typeof s==='string'&&/^\d{5,40}$/.test(s);
const q=o=>new URLSearchParams(o).toString();
const norm=s=>String(s||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
export const defaultInstagramRules=()=>({mode:'drafts',messages:true,comments:true,keywords:['precio','cuanto','costo','horario','ubicacion','direccion','servicio','informacion','cita','turno'],mediaIds:[]});
export function instagramRules(input){
 if(!input||input.mode!=='drafts'||typeof input.messages!=='boolean'||typeof input.comments!=='boolean')throw fail(400,'Elegí los canales y mantené el modo de revisión.');
 if(!Array.isArray(input.keywords)||input.keywords.length>30||!input.keywords.every(x=>typeof x==='string'&&x.trim().length>=2&&x.length<=60))throw fail(400,'Usá hasta 30 palabras o frases, de 2 a 60 caracteres.');
 if(!Array.isArray(input.mediaIds)||input.mediaIds.length>50||!input.mediaIds.every(id))throw fail(400,'Los identificadores de publicaciones deben ser numéricos.');
 return {mode:'drafts',messages:input.messages,comments:input.comments,keywords:[...new Set(input.keywords.map(x=>norm(x.trim())))],mediaIds:[...new Set(input.mediaIds)]};
}
export function selectInstagramEvent(event,rules=defaultInstagramRules()){
 if(!['instagram','instagram_comentario'].includes(event.channel))return {selected:true};
 if(event.outboundHuman)return {selected:true};
 const text=norm(event.text);
 if(/\b(humano|persona|reclamo|garantia|devolucion|abogado|estafa|accidente|incendio|frenos)\b/.test(text))return {selected:false,handoff:true,reason:'Consulta que requiere atención humana.'};
 const comment=event.channel==='instagram_comentario';
 if(!(comment?rules.comments:rules.messages))return {selected:false,reason:'Este canal no está seleccionado para preparar respuestas.'};
 if(event.mediaType)return {selected:false,handoff:true,reason:'Archivo de Instagram: revisión humana.'};
 if(comment&&rules.mediaIds.length&&!rules.mediaIds.includes(String(event.mediaId||'')))return {selected:false,reason:'Publicación fuera de la selección.'};
 if(!rules.keywords.length||!rules.keywords.some(word=>text.includes(norm(word))))return {selected:false,reason:'Consulta fuera de las palabras o frases seleccionadas.'};
 return {selected:true};
}
export class Instagram {
 constructor(env,db,fetcher=fetch){Object.assign(this,{env,db,fetcher});}
 configured(){return Boolean(this.db&&this.env.INSTAGRAM_ONBOARDING_ENABLED==='true'&&id(this.env.META_APP_ID)&&id(this.env.INSTAGRAM_CONFIG_ID)&&this.env.META_APP_SECRET&&/^[A-Za-z0-9+/]{43}=$/.test(this.env.INTEGRATION_ENCRYPTION_KEY||'')&&this.origin());}
 origin(){try{const u=new URL(this.env.PUBLIC_APP_URL);return u.protocol==='https:'&&u.pathname==='/'&&!u.search&&!u.hash&&!u.username&&!u.password?u.origin:null;}catch{return null;}}
 ready(){if(!this.configured())throw fail(503,'La conexión de Instagram está pendiente de configuración.');}
 path(businessId){return 'vm_instagram_integrations?'+q({business_id:'eq.'+businessId});}
 async connection(businessId){return (await this.db.request(this.path(businessId)))[0]||null;}
 async status(user){const row=this.db?await this.connection(user.businessId):null;return {configured:this.configured(),connected:Boolean(row),needsReconnect:Boolean(row?.config?.expiresAt&&Date.parse(row.config.expiresAt)<=Date.now()),expiresAt:row?.config?.expiresAt||null,username:row?.username||null,receiving:row?.config?.receiving===true,rules:row?.config?.rules||defaultInstagramRules(),outbound:false,canManage:['owner','admin'].includes(user.role)};}
 async graph(path,{token,body,timeout=15000}={}){
  let r,data;try{r=await this.fetcher('https://graph.facebook.com/v27.0/'+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(timeout)});data=await r.json();}catch{throw fail(502,'No se pudo confirmar la operación en Instagram.');}
  if(!r.ok){const error=fail(502,'Meta rechazó la operación de Instagram. Comprobá permisos y autorización.');
   if(Number.isSafeInteger(data?.error?.code))error.metaCode=data.error.code;
   if(Number.isSafeInteger(data?.error?.error_subcode))error.metaSubcode=data.error.error_subcode;
   throw error;
  }return data;
 }
 async diagnose(user){
  this.ready();if(!['owner','admin'].includes(user.role))throw fail(403,'El diagnóstico requiere propietario o administrador.');
  const row=await this.connection(user.businessId);if(!row)throw fail(409,'Primero conectá una cuenta de Instagram.');
  if(!id(row.account_id)||!Number.isFinite(Date.parse(row.config?.expiresAt))||Date.parse(row.config.expiresAt)<=Date.now())throw fail(409,'Renová la autorización de Instagram para comprobarla.');
  const {accessToken:token}=new CredentialVault(this.env.INTEGRATION_ENCRYPTION_KEY).open(row.encrypted_credentials,'instagram:'+user.businessId);
  const checks=[];
  const check=async(name,path)=>{try{const result=await this.graph(path,{token});checks.push({name,status:'ok'});return result;}
   catch(error){checks.push({name,status:'error',message:'No se pudo comprobar el acceso en Meta.',...(error.metaCode?{code:error.metaCode}:{}),...(error.metaSubcode?{subcode:error.metaSubcode}:{})});return null;}};
  const profile=await check('Perfil',row.account_id+'?fields=id,username');
  if(profile&&profile.id!==row.account_id)throw fail(409,'Meta devolvió una cuenta diferente. Revisá la conexión.');
  if(!profile)return {checkedAt:new Date().toISOString(),username:row.username,checks,outbound:false};
  const conversations=await check('Mensajes',row.account_id+'/conversations?platform=instagram&limit=1');
  if(conversations)checks.at(-1).visibleConversations=Array.isArray(conversations.data)?conversations.data.length:0;
  const media=await check('Publicaciones',row.account_id+'/media?fields=id&limit=1');
  const mediaId=media?.data?.[0]?.id;
  if(id(mediaId))await check('Comentarios',mediaId+'/comments?fields=id&limit=1');
  else checks.push({name:'Comentarios',status:'pending',message:media?'No hay una publicación disponible para comprobar comentarios.':'Primero debe funcionar el acceso a publicaciones.'});
  return {checkedAt:new Date().toISOString(),username:row.username,checks,outbound:false};
 }
 async recentMessages(user){
  this.ready();if(!['owner','admin'].includes(user.role))throw fail(403,'La sincronización requiere propietario o administrador.');
  const row=await this.connection(user.businessId);
  if(!row||!id(row.account_id)||!row.config?.receiving||!Number.isFinite(Date.parse(row.config.expiresAt))||Date.parse(row.config.expiresAt)<=Date.now())throw fail(409,'Revisá la autorización de Instagram.');
  const {accessToken:token}=new CredentialVault(this.env.INTEGRATION_ENCRYPTION_KEY).open(row.encrypted_credentials,'instagram:'+user.businessId);
  const result=await this.graph(row.account_id+'/conversations?'+q({platform:'instagram',fields:'id,messages.limit(5){id,created_time,from,to,message}',limit:'3'}),{token});
  const events=[];
  for(const thread of (result.data||[]).slice(0,3)){
   // Only account-addressed inbound messages with a recent Meta timestamp may open a reply target.
   const messages=(thread.messages?.data||[]).filter(m=>typeof m.id==='string'&&m.id.length<=1000&&typeof m.message==='string'&&m.message.trim()&&m.message.length<=4000&&id(m.from?.id)&&m.from.id!==row.account_id&&m.to?.data?.some(p=>p.id===row.account_id)&&Number.isFinite(Date.parse(m.created_time))&&Date.now()-Date.parse(m.created_time)>=0&&Date.now()-Date.parse(m.created_time)<86400000).sort((a,b)=>Date.parse(b.created_time)-Date.parse(a.created_time));
   if(!messages.length)continue;
   const m=messages[0];events.push({id:'ig:'+m.id,externalAccountId:row.account_id,contact:m.from.id,text:m.message,at:new Date(m.created_time).toISOString(),channel:'instagram'});
  }
  return {events,scanned:Math.min(result.data?.length||0,3)};
 }
 async latestVideoComment(user){
  this.ready();if(!['owner','admin'].includes(user.role))throw fail(403,'La consulta requiere propietario o administrador.');
  const row=await this.connection(user.businessId);
  if(!row||!id(row.account_id)||!row.config?.receiving||!Number.isFinite(Date.parse(row.config.expiresAt))||Date.parse(row.config.expiresAt)<=Date.now())throw fail(409,'Revisá la autorización de Instagram.');
  const {accessToken:token}=new CredentialVault(this.env.INTEGRATION_ENCRYPTION_KEY).open(row.encrypted_credentials,'instagram:'+user.businessId);
  const media=await this.graph(row.account_id+'/media?'+q({fields:'id,media_type,timestamp',limit:'20'}),{token});
  const video=(media.data||[]).filter(m=>id(m.id)&&m.media_type==='VIDEO'&&Number.isFinite(Date.parse(m.timestamp))).sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp))[0];
  if(!video)return {events:[],scanned:0,message:'No se encontró un video entre las últimas 20 publicaciones.'};
  const comments=await this.graph(video.id+'/comments?'+q({fields:'id,text,timestamp,from,username',limit:'25'}),{token});
  const events=(comments.data||[]).slice(0,25).filter(c=>id(c.id)&&typeof c.text==='string'&&c.text.trim()&&c.text.length<=4000&&c.from?.id!==row.account_id&&norm(c.username||c.from?.username)!==norm(row.username)&&Number.isFinite(Date.parse(c.timestamp))&&Date.now()-Date.parse(c.timestamp)>=0&&Date.now()-Date.parse(c.timestamp)<86400000).map(c=>({id:'ig-comment:'+c.id,externalAccountId:row.account_id,contact:String(c.from?.id||c.username||'instagram'),text:c.text,at:new Date(c.timestamp).toISOString(),channel:'instagram_comentario',threadKey:'ig-comment:'+c.id,mediaId:video.id})).filter(e=>selectInstagramEvent(e,row.config.rules).selected).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,1);
  return {events,scanned:Math.min(comments.data?.length||0,25),message:events.length?'Última consulta seleccionada del último video.':'No se encontró una consulta reciente que coincida con los criterios en los primeros 25 comentarios del último video.'};
 }
 async start(user){
  this.ready();
  const state=randomBytes(32).toString('base64url');
  await this.db.request('vm_oauth_states',{method:'POST',body:{state_hash:digest(state),provider:'meta',verifier:'instagram-unified',user_id:user.id,business_id:user.businessId,expires_at:new Date(Date.now()+600000).toISOString()}});
  return {url:'https://www.facebook.com/dialog/oauth?'+q({client_id:this.env.META_APP_ID,config_id:this.env.INSTAGRAM_CONFIG_ID,redirect_uri:this.origin()+'/integrations/instagram/callback',response_type:'code',override_default_response_type:'true',state,prompt:'login'}),cookie:`${instagramCookie}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`};
 }
 async callback(params,cookie){
  this.ready();const state=params.get('state'),code=params.get('code');
  if(!/^[\w-]{43}$/.test(state||'')||!same(state,cookie)||!code||code.length>3000||params.has('error'))throw fail(400,'Autorización cancelada o inválida.');
  const states=await this.db.request('rpc/vm_consume_oauth_state',{method:'POST',body:{p_hash:digest(state),p_provider:'meta'}});
  const row=states[0];if(states.length!==1||row.verifier!=='instagram-unified')throw fail(400,'La autorización venció o ya fue utilizada.');
  const staff=await this.db.request('vm_staff?'+q({select:'role',business_id:'eq.'+row.business_id,user_id:'eq.'+row.user_id,active:'eq.true'}));
  if(!staff.some(x=>['owner','admin'].includes(x.role)))throw fail(403,'La empresa requiere un administrador autorizado.');
  const previous=await this.connection(row.business_id);
  const result=await this.graph('oauth/access_token?'+q({client_id:this.env.META_APP_ID,client_secret:this.env.META_APP_SECRET,code,redirect_uri:this.origin()+'/integrations/instagram/callback'}));
  if(!result.access_token)throw fail(502,'Meta no devolvió una autorización válida.');
  const token=result.access_token;
  const [business,accounts]=await Promise.all([this.graph('me?fields=client_business_id',{token}),this.graph('me/assigned_instagram_accounts?fields=id,username&limit=100',{token})]);
  if(!id(business.client_business_id)||accounts.data?.length!==1||accounts.paging?.next||!id(accounts.data[0]?.id))throw fail(400,'Autorizá exactamente una cuenta de Instagram para este negocio.');
  const account=accounts.data[0];if(previous&&previous.account_id!==account.id)throw fail(409,'Para renovar, autorizá la misma cuenta de Instagram que ya está conectada.');
  const encrypted=new CredentialVault(this.env.INTEGRATION_ENCRYPTION_KEY).seal({accessToken:token},'instagram:'+row.business_id);
  await this.db.request(previous?this.path(row.business_id):'vm_instagram_integrations',{method:previous?'PATCH':'POST',body:{business_id:row.business_id,account_id:account.id,username:String(account.username||account.id),encrypted_credentials:encrypted,config:{clientBusinessId:business.client_business_id,configId:this.env.INSTAGRAM_CONFIG_ID,expiresAt:new Date(Date.now()+(Number(result.expires_in)||5184000)*1000).toISOString(),receiving:false,rules:previous?.config?.rules||defaultInstagramRules()}}});
  return row.business_id;
 }
 async prepare(user){
  this.ready();const row=await this.connection(user.businessId);if(!row)throw fail(409,'Primero autorizá una cuenta de Instagram.');
  const {accessToken:token}=new CredentialVault(this.env.INTEGRATION_ENCRYPTION_KEY).open(row.encrypted_credentials,'instagram:'+user.businessId);
  const r=await this.graph(row.account_id+'/subscribed_apps',{token,body:{subscribed_fields:'messages,comments'}});
  if(r.success!==true)throw fail(502,'Meta no confirmó la suscripción de la cuenta.');
  for(const kind of ['instagram_dm','instagram_comment']){
   const path='vm_channels?'+q({kind:'eq.'+kind,external_account_id:'eq.'+row.account_id});const existing=await this.db.request(path);
   if(existing.some(x=>x.business_id!==user.businessId))throw fail(409,'La cuenta ya pertenece a otro negocio.');
   await this.db.request(existing.length?path:'vm_channels',{method:existing.length?'PATCH':'POST',body:existing.length?{enabled:true}:{business_id:user.businessId,kind,external_account_id:row.account_id,enabled:true}});
  }
  await this.db.request(this.path(user.businessId),{method:'PATCH',body:{config:{...row.config,receiving:true},updated_at:new Date().toISOString()}});
  return {receiving:true,outbound:false};
 }
 async saveRules(user,input){const rules=instagramRules(input),row=await this.connection(user.businessId);if(!row)throw fail(409,'Primero conectá una cuenta de Instagram.');await this.db.request(this.path(user.businessId),{method:'PATCH',body:{config:{...row.config,rules},updated_at:new Date().toISOString()}});return {rules,outbound:false};}
 async sendReply(user,conversation,text){
  this.ready();
  if(!['owner','admin'].includes(user.role))throw fail(403,'El envío requiere propietario o administrador.');
  if(typeof text!=='string'||!text.trim()||text.length>1000)throw fail(400,'Escribí una respuesta de hasta 1000 caracteres.');
  const source=conversation?.instagramSource;
  if(!source||!['instagram','instagram_comentario'].includes(conversation.channel)||!id(source.accountId)||!source.inboundId)throw fail(409,'El envío requiere una consulta real recibida de Instagram.');
  const row=await this.connection(user.businessId);
  if(!row||row.account_id!==source.accountId||!row.config?.receiving||Date.parse(row.config.expiresAt)<=Date.now())throw fail(409,'Revisá la autorización de Instagram de este negocio.');
  const comment=conversation.channel==='instagram_comentario';
  if(comment?!id(source.commentId):!id(source.recipientId))throw fail(409,'La consulta no tiene un destinatario válido.');
  const key='ig-reply:'+createHash('sha256').update(user.businessId+':'+conversation.id+':'+source.inboundId).digest('hex');
  const path='vm_meta_event_receipts?'+q({event_key:'eq.'+key,business_id:'eq.'+user.businessId});
  const existing=(await this.db.request(path))[0];
  if(existing){
   if(existing.state==='processed')return existing.payload;
   throw fail(409,'Hay un envío pendiente de confirmación. Revisá Instagram antes de repetirlo.');
  }
  const elapsed=Date.now()-Date.parse(source.at);
  if(!comment&&(!Number.isFinite(elapsed)||elapsed<0||elapsed>=86400000))throw fail(409,'La ventana de respuesta venció. Esperá un nuevo mensaje del cliente.');
  const {accessToken:token}=new CredentialVault(this.env.INTEGRATION_ENCRYPTION_KEY).open(row.encrypted_credentials,'instagram:'+user.businessId);
  try{await this.db.request('vm_meta_event_receipts',{method:'POST',body:{business_id:user.businessId,event_key:key,state:'pending',payload:{operation:'instagram_reply',conversationId:conversation.id}}});}
  catch(error){if(error.status===409)throw fail(409,'La respuesta ya fue solicitada. Actualizá la conversación antes de repetirla.');throw error;}
  // Never retry a POST: Meta may have accepted it even if its response is lost.
  const result=await this.graph(comment?source.commentId+'/replies':row.account_id+'/messages',{token,body:comment?{message:text.trim()}:{recipient:{id:source.recipientId},message:{text:text.trim()}}});
  const externalId=comment?result.id:result.message_id;
  if(typeof externalId!=='string'||!externalId)throw fail(502,'Meta no confirmó el envío. Revisá Instagram antes de repetirlo.');
  const sent={operation:'instagram_reply',conversationId:conversation.id,id:key,externalId,text:text.trim(),at:new Date().toISOString(),delivery:'aceptado_por_meta'};
  await this.db.request(path,{method:'PATCH',body:{state:'processed',payload:sent}});
  return sent;
 }
}
