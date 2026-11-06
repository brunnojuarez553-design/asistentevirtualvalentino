// Read-only normalized inbox. The legacy workspace remains authoritative until
// an explicit, verified cutover. Never expose service-role credentials to clients.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedStates=new Set(['ai','review','human']);
export class NormalizedInbox {
  constructor({url,key,businessId,fetcher=fetch}={}){
    if(!url?.startsWith('https://')||!key||!UUID.test(businessId||''))throw Error('Normalized inbox configuration missing');
    Object.assign(this,{url:url.replace(/\/$/,''),key,businessId,fetcher});
  }
  async get(path){
    const r=await this.fetcher(this.url+'/rest/v1/'+path,{
      headers:{apikey:this.key,Authorization:'Bearer '+this.key,Accept:'application/json'},
      signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw Object.assign(Error('Normalized inbox unavailable'),{status:503});
    return r.json();
  }
  async list({state,limit=30}={}){
    if(state!==undefined&&!allowedStates.has(state))throw Object.assign(Error('Estado inválido'),{status:400});
    if(!Number.isInteger(limit)||limit<1||limit>100)throw Object.assign(Error('Límite inválido'),{status:400});
    const p=new URLSearchParams({select:'id,channel_id,contact_id,state,ai_paused_reason,last_message_at,created_at',
      business_id:'eq.'+this.businessId,order:'last_message_at.desc.nullslast',limit:String(limit)});
    if(state)p.set('state','eq.'+state);
    return this.get('vm_conversations?'+p);
  }
  async detail(id,{limit=100}={}){
    if(!UUID.test(id||''))throw Object.assign(Error('ID inválido'),{status:400});
    if(!Number.isInteger(limit)||limit<1||limit>200)throw Object.assign(Error('Límite inválido'),{status:400});
    const c=await this.get('vm_conversations?'+new URLSearchParams({
      select:'id,channel_id,contact_id,state,ai_paused_reason,last_message_at,created_at',
      business_id:'eq.'+this.businessId,id:'eq.'+id,limit:'1'}));
    if(!c.length)throw Object.assign(Error('Conversación inexistente'),{status:404});
    const [messages,handoffs]=await Promise.all([
      this.get('vm_messages?'+new URLSearchParams({
        select:'id,conversation_id,direction,authored_by,message_type,body,delivery_status,occurred_at',
        conversation_id:'eq.'+id,order:'occurred_at.asc',limit:String(limit)})),
      this.get('vm_handoffs?'+new URLSearchParams({
        select:'id,conversation_id,trigger_reason,status,created_at,resolved_at',
        conversation_id:'eq.'+id,order:'created_at.desc',limit:'30'}))
    ]);
    return {conversation:c[0],messages,handoffs};
  }
}
