// Manual App Review operations, isolated from the customer's messaging channel.
const error=(status,message)=>Object.assign(Error(message),{status});
const id=value=>typeof value==='string' && /^\d{5,30}$/.test(value);
const name=value=>typeof value==='string' && /^[a-z][a-z0-9_]{0,99}$/.test(value);
const language=value=>typeof value==='string' && /^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(value);
export class MetaReview {
  constructor(env,{fetcher=fetch}={}) {this.env=env;this.fetcher=fetcher;}
  status(){
    const e=this.env;
    const checks={enabled:e.META_REVIEW_ENABLED==='true',testAssetsConfirmed:e.META_REVIEW_TEST_ASSETS_CONFIRMED==='true',
      tokenConfigured:Boolean(e.META_REVIEW_ACCESS_TOKEN?.trim()),versionConfigured:/^v\d{2}\.0$/.test(e.META_REVIEW_GRAPH_VERSION||''),
      wabaConfigured:id(e.META_REVIEW_WABA_ID),phoneConfigured:id(e.META_REVIEW_PHONE_NUMBER_ID),
      recipientConfigured:/^[1-9]\d{7,14}$/.test(e.META_REVIEW_RECIPIENT||''),
      operatorsConfigured:Boolean(e.META_REVIEW_OPERATOR_IDS?.trim())};
    return {checks,configured:Object.values(checks).every(Boolean),connectionVerified:false,
      recipient:checks.recipientConfigured?'••••'+e.META_REVIEW_RECIPIENT.slice(-4):null,
      automaticOutbound:false};
  }
  authorize(user){
    const allowed=(this.env.META_REVIEW_OPERATOR_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
    if(!user || !['owner','admin'].includes(user.role) || !allowed.includes(user.id))
      throw error(403,'Esta sección requiere un administrador autorizado para las pruebas de Meta.');
  }
  ready(){if(!this.status().configured)throw error(503,'Configurá las variables privadas de revisión de Meta en Vercel.');}
  async request(path,{method='GET',body}={}){
    this.ready();
    let response,data;
    try{
      response=await this.fetcher(`https://graph.facebook.com/${this.env.META_REVIEW_GRAPH_VERSION}/${path}`,{
        method,headers:{Authorization:'Bearer '+this.env.META_REVIEW_ACCESS_TOKEN,'Content-Type':'application/json'},
        ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000),redirect:'error'});
      data=await response.json();
    }catch{throw error(502,'Meta no confirmó la operación. Verificá el resultado antes de reintentar.');}
    if(!response.ok || data?.error){
      const code=Number(data?.error?.code);
      throw error(502,code===190?'El token de revisión venció o no es válido.':code===10||code===200?
        'Meta rechazó los permisos o el acceso al activo de prueba.':'Meta rechazó la operación. Revisá la cuenta y los requisitos en Meta Developers.');
    }
    return data;
  }
  async connection(){
    const d=await this.request(`${this.env.META_REVIEW_WABA_ID}/phone_numbers?fields=id&limit=100`);
    if(!Array.isArray(d.data)||!d.data.some(p=>p.id===this.env.META_REVIEW_PHONE_NUMBER_ID))
      throw error(409,'El número de prueba no pertenece a la WABA configurada o no está en la primera página de resultados.');
    return {connected:true,verifiedAt:new Date().toISOString(),automaticOutbound:false};
  }
  async templates(){
    const d=await this.request(`${this.env.META_REVIEW_WABA_ID}/message_templates?fields=id,name,language,status,category,components&limit=100`);
    return {templates:(d.data||[]).map(t=>({id:t.id,name:t.name,language:t.language,status:t.status,category:t.category,
      sendable:t.status==='APPROVED' && Array.isArray(t.components) && t.components.length>0 &&
        t.components.every(c=>['BODY','FOOTER'].includes(c.type)||c.type==='HEADER'&&c.format==='TEXT') &&
        !/\{\{/.test(JSON.stringify(t.components))})),hasMore:Boolean(d.paging?.next)};
  }
  async send(body){
    if(body.confirm!==true || !name(body.name)||!language(body.language))throw error(400,'Confirmá una plantilla aprobada y el destinatario de prueba.');
    await this.connection();
    const {templates}=await this.templates();
    if(!templates.some(t=>t.name===body.name&&t.language===body.language&&t.sendable))
      throw error(400,'Elegí una plantilla aprobada, de texto y sin variables de la lista.');
    const d=await this.request(`${this.env.META_REVIEW_PHONE_NUMBER_ID}/messages`,{method:'POST',body:{
      messaging_product:'whatsapp',to:this.env.META_REVIEW_RECIPIENT,type:'template',
      template:{name:body.name,language:{code:body.language}}}});
    if(!d.messages?.[0]?.id)throw error(502,'Meta no confirmó un identificador de mensaje. Verificá WhatsApp antes de reintentar.');
    return {accepted:true,messageId:String(d.messages[0].id).slice(0,300),deliveryConfirmed:false,
      message:'Meta aceptó el envío. Mostrá su recepción en WhatsApp para completar la evidencia.'};
  }
  async createTemplate(body){
    if(body.confirm!==true || !name(body.name)||!body.name.startsWith('aws_review_') || !language(body.language) ||
      typeof body.text!=='string'||!body.text.trim()||body.text.length>1024||/\{\{|\}\}/.test(body.text))
      throw error(400,'Usá un nombre aws_review_, un idioma válido y texto de hasta 1024 caracteres sin variables.');
    await this.connection();
    const d=await this.request(`${this.env.META_REVIEW_WABA_ID}/message_templates`,{method:'POST',body:{
      name:body.name,language:body.language,category:'UTILITY',components:[{type:'BODY',text:body.text.trim()}]}});
    if(!d.id)throw error(502,'Meta no confirmó la creación. Consultá las plantillas antes de reintentar.');
    return {id:String(d.id),status:String(d.status||'PENDING'),category:String(d.category||'UTILITY'),
      message:'Solicitud de plantilla registrada en Meta; la categoría y aprobación dependen de su revisión.'};
  }
}
