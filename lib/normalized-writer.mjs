import {createHash} from 'node:crypto';
// Deterministic UUIDs for provider message IDs (wa:/ig:) and simulation IDs.
// Namespaced by business and conversation to prevent cross-tenant collisions.
export function stableUuid(value){
 const h=createHash('sha256').update(String(value)).digest('hex');
 return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);
}
export class NormalizedWriter {
 constructor({url,key,businessId,fetcher=fetch}={}){
  if(!url?.startsWith('https://')||!key||!businessId)throw Error('Normalized writer configuration missing');
  Object.assign(this,{url:url.replace(/\/$/,''),key,businessId,fetcher});
 }
 async ingest(c){
  const messages=(c.messages||[]).map(m=>({
   id:stableUuid(this.businessId+':'+c.id+':'+m.id),
   role:m.role,text:m.text,at:m.at,mediaType:m.mediaType
  }));
  const r=await this.fetcher(this.url+'/rest/v1/rpc/vm_ingest_conversation',{
   method:'POST',headers:{apikey:this.key,Authorization:'Bearer '+this.key,'Content-Type':'application/json'},
   body:JSON.stringify({p_business_id:this.businessId,p_conversation_id:stableUuid(this.businessId+':'+c.id),
    p_contact:c.contact,p_channel:c.channel,p_state:c.state,p_reason:c.reason,p_messages:messages}),
   signal:AbortSignal.timeout(10000)
  });
  if(!r.ok)throw Error('Normalized ingestion failed');
  return r.json();
 }
}
