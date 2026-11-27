import {createHash} from 'node:crypto';
import {CredentialVault} from './credential-vault.mjs';
import {fail} from './tenants.mjs';
import {selectInstagramEvent} from './instagram.mjs';

const norm=s=>String(s||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim();
const numeric=s=>typeof s==='string'&&/^\d{5,40}$/.test(s);
const key=(kind,businessId,event)=>'ig-'+kind+':'+createHash('sha256').update(businessId+':'+event.externalAccountId+':'+event.id).digest('hex');
const query=o=>new URLSearchParams(o).toString();
export const defaultCommentAutomation=()=>({enabled:false,campaigns:[]});

export function commentAutomation(input,services){
 if(!input||typeof input.enabled!=='boolean'||!Array.isArray(input.campaigns)||input.campaigns.length>30)throw fail(400,'Configuración de comentarios inválida. Usá hasta 30 reglas.');
 const campaigns=input.campaigns.map((r,index)=>{
  const service=services.find(s=>s.code===r.serviceCode&&s.active&&s.approved);
  if(!service||!service.public_copy?.trim()||service.public_copy.trim().length>950)throw fail(400,'Cada regla necesita un servicio activo con texto aprobado de hasta 950 caracteres.');
  if(!Array.isArray(r.keywords)||!r.keywords.length||r.keywords.length>20||!r.keywords.every(x=>typeof x==='string'&&x.trim().length>=2&&x.length<=60))throw fail(400,'Cada regla necesita entre 1 y 20 palabras o frases de 2 a 60 caracteres.');
  if(!Array.isArray(r.mediaIds)||r.mediaIds.length>50||!r.mediaIds.every(numeric))throw fail(400,'Las publicaciones deben tener identificadores numéricos.');
  const publicReply=typeof r.publicReply==='string'?r.publicReply.trim():'';
  if(!publicReply||publicReply.length>300)throw fail(400,'El aviso público debe tener entre 1 y 300 caracteres.');
  return {id:'rule-'+index,serviceCode:service.code,keywords:[...new Set(r.keywords.map(norm))],mediaIds:[...new Set(r.mediaIds)],publicReply};
 });
 if(input.enabled&&!campaigns.length)throw fail(400,'Agregá al menos una regla antes de activar.');
 return {enabled:input.enabled,campaigns};
}

// Store every inbound comment. Matching controls replies, never reception.
export function commentPlan(event,config,services){
 if(event.channel!=='instagram_comentario'||event.live||event.deleted||event.parentId)return {matched:false,reason:'Comentario fuera del flujo automático.'};
 const safety=selectInstagramEvent(event,{comments:true,messages:true,keywords:[''],mediaIds:[]});
 if(safety.handoff||event.mediaType)return {matched:false,handoff:true,reason:safety.reason||'Revisión humana requerida.'};
 const text=norm(event.text);
 const matches=(config?.campaigns||[]).flatMap(r=>{
  if(r.mediaIds.length&&!r.mediaIds.includes(event.mediaId))return [];
  const words=r.keywords.filter(w=>text.includes(norm(w)));
  return words.length?[{rule:r,score:Math.max(...words.map(w=>norm(w).length))}]:[];
 });
 if(!matches.length)return {matched:false,reason:'Sin palabra clave y servicio asociados.'};
 const max=Math.max(...matches.map(m=>m.score)),best=matches.filter(m=>m.score===max);
 if(new Set(best.map(m=>m.rule.serviceCode)).size!==1)return {matched:false,handoff:true,reason:'La consulta coincide con más de un servicio; requiere revisión.'};
 const rule=best[0].rule,service=services.find(s=>s.code===rule.serviceCode&&s.active&&s.approved);
 if(!service?.public_copy?.trim()||service.public_copy.trim().length>950)return {matched:false,handoff:true,reason:'El servicio no tiene un texto comercial aprobado dentro del límite.'};
 return {matched:true,serviceCode:service.code,serviceName:service.name,privateText:service.public_copy.trim(),publicText:rule.publicReply};
}

export class InstagramComments {
 constructor(instagram){this.ig=instagram;this.db=instagram.db;}
 path(eventKey,businessId){return 'vm_meta_event_receipts?'+query({event_key:'eq.'+eventKey,business_id:'eq.'+businessId});}
 async capture(businessId,event){
  const eventKey=key('inbound',businessId,event),path=this.path(eventKey,businessId);
  const existing=(await this.db.request(path))[0];if(existing)return existing;
  const payload={operation:'instagram_comment_webhook',receivedAt:new Date().toISOString(),event};
  try{return (await this.db.request('vm_meta_event_receipts',{method:'POST',body:{event_key:eventKey,business_id:businessId,state:'received',payload}}))[0];}
  catch(error){if(error.status!==409)throw error;return (await this.db.request(path))[0];}
 }
 async finish(businessId,event,outcome){await this.db.request(this.path(key('inbound',businessId,event),businessId),{method:'PATCH',body:{state:'processed',payload:{operation:'instagram_comment_webhook',receivedAt:new Date().toISOString(),event,outcome}}});}
 async pending(businessId){
  const rows=await this.db.request('vm_meta_event_receipts?'+query({business_id:'eq.'+businessId,event_key:'like.ig-inbound:*',state:'eq.received',select:'payload',order:'created_at.asc',limit:'10'}));
  return rows.map(r=>r.payload?.event).filter(e=>e?.channel==='instagram_comentario');
 }
 async status(businessId){
  const rows=await this.db.request('vm_meta_event_receipts?'+query({business_id:'eq.'+businessId,event_key:'like.ig-inbound:*',select:'state,payload,created_at',order:'created_at.desc',limit:'1'}));
  const row=rows[0];return {lastReceivedAt:row?.created_at||null,lastState:row?.state||null,lastOutcome:row?.payload?.outcome?.status||null};
 }
 async sendPart(businessId,event,part,token,path,body){
  const eventKey=key('auto-'+part,businessId,event),receiptPath=this.path(eventKey,businessId);
  const existing=(await this.db.request(receiptPath))[0];
  if(existing){if(existing.state==='processed')return existing.payload;throw fail(409,'Hay un envío sin confirmar. No se repetirá automáticamente.');}
  try{await this.db.request('vm_meta_event_receipts',{method:'POST',body:{event_key:eventKey,business_id:businessId,state:'pending',payload:{operation:'instagram_comment_'+part,commentId:event.id}}});}
  catch(error){if(error.status===409)throw fail(409,'El envío ya está en curso.');throw error;}
  // A timeout is ambiguous: retain the pending claim, never blindly resend.
  const response=await this.ig.graph(path,{token,body,timeout:5000});
  const externalId=part==='private'?response.message_id:response.id;
  if(typeof externalId!=='string'||!externalId)throw fail(502,'Meta no confirmó el envío.');
  const sent={id:eventKey,externalId,text:part==='private'?body.message.text:body.message,at:new Date().toISOString(),delivery:'aceptado_por_meta',destination:part==='private'?'instagram_dm':'instagram_comment',operation:'instagram_comment_'+part};
  await this.db.request(receiptPath,{method:'PATCH',body:{state:'processed',payload:sent}});return sent;
 }
 async sendTestPair(user,conversation,serviceCode,services,confirm){
  if(!['owner','admin'].includes(user.role))throw fail(403,'La prueba requiere propietario o administrador.');
  if(confirm!==true)throw fail(400,'Confirmá el envío del privado y el aviso público.');
  const source=conversation?.instagramSource;
  if(conversation?.channel!=='instagram_comentario'||!source||!numeric(source.commentId)||!numeric(source.mediaId))throw fail(409,'Seleccioná un comentario real verificado en Meta.');
  if(conversation.state==='humano')throw fail(409,'La conversación está a cargo del equipo. Reactivala antes de la prueba.');
  const config=commentAutomation({enabled:true,campaigns:[{serviceCode,keywords:['prueba controlada'],mediaIds:[source.mediaId],publicReply:'Te enviamos la información por privado. Revisá tus DMs y solicitudes de mensajes.'}]},services);
  // Only an existing verified comment can be targeted. The client cannot specify an account or recipient.
  const row=await this.ig.connection(user.businessId);
  if(!row||row.account_id!==source.accountId||!row.config?.receiving||!Number.isFinite(Date.parse(row.config.expiresAt))||Date.parse(row.config.expiresAt)<=Date.now())throw fail(409,'Revisá la cuenta conectada.');
  const {accessToken:token}=new CredentialVault(this.ig.env.INTEGRATION_ENCRYPTION_KEY).open(row.encrypted_credentials,'instagram:'+user.businessId);
  const media=await this.ig.graph(source.mediaId+'?fields=id,owner',{token});
  if(media.id!==source.mediaId||media.owner?.id!==row.account_id)throw fail(403,'No se pudo verificar la titularidad de la publicación.');
  const comment=await this.ig.graph(source.commentId+'?fields=id,media',{token});
  if(comment.id!==source.commentId||comment.media?.id!==source.mediaId)throw fail(403,'El comentario no corresponde a la publicación verificada.');
  config.enabledSince=new Date(Date.now()-1000).toISOString();
  return this.run(user.businessId,{id:source.inboundId,externalAccountId:source.accountId,channel:'instagram_comentario',text:'prueba controlada',mediaId:source.mediaId,receivedAt:new Date().toISOString()},config,services);
 }
 async run(businessId,event,config,services,{human=false}={}){
  const plan=commentPlan(event,config,services);
  if(!config?.enabled||human||!plan.matched)return {status:human?'human':config?.enabled?'skipped':'draft',...plan,messages:[]};
  if(!Number.isFinite(Date.parse(config.enabledSince))||!Number.isFinite(Date.parse(event.receivedAt))||Date.parse(event.receivedAt)<Date.parse(config.enabledSince))return {status:'skipped',reason:'Comentario anterior a la activación de las reglas.',messages:[]};
  const row=await this.ig.connection(businessId);
  if(!row||row.account_id!==event.externalAccountId||!row.config?.receiving||!Number.isFinite(Date.parse(row.config.expiresAt))||Date.parse(row.config.expiresAt)<=Date.now())return {status:'review',reason:'La cuenta de Instagram necesita conexión o renovación.',messages:[]};
  const messages=[];
  try{
   const {accessToken:token}=new CredentialVault(this.ig.env.INTEGRATION_ENCRYPTION_KEY).open(row.encrypted_credentials,'instagram:'+businessId);
   const commentId=event.id.replace(/^ig-comment:/,'');if(!numeric(commentId))throw fail(409,'Identificador de comentario inválido.');
   // Check authoritative creation time before a private reply; delivery time is not creation time.
   const source=await this.ig.graph(commentId+'?fields=id,timestamp',{token,timeout:5000});
   const age=Date.now()-Date.parse(source.timestamp);
   if(source.id!==commentId||!Number.isFinite(age)||age<0||age>=7*86400000)throw fail(409,'La ventana de respuesta privada venció o no pudo comprobarse.');
   messages.push(await this.sendPart(businessId,event,'private',token,row.account_id+'/messages',{recipient:{comment_id:commentId},message:{text:plan.privateText}}));
   // Only announce a DM after Meta has accepted it. Acceptance is not delivery.
   messages.push(await this.sendPart(businessId,event,'public',token,commentId+'/replies',{message:plan.publicText}));
   return {status:'accepted',serviceCode:plan.serviceCode,messages};
  }catch(error){return {status:'review',reason:error.status?error.message:'No se pudo confirmar la operación. Revisá Instagram antes de reintentar.',...(error.metaCode?{metaCode:error.metaCode}:{}),messages};}
 }
}
