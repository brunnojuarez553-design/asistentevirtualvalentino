import {createHash} from 'node:crypto';
import {CredentialVault} from './credential-vault.mjs';
import {fail} from './tenants.mjs';

const query = (values) => new URLSearchParams(values).toString();
export class MetaChannel {
  constructor(env,directory,fetcher=fetch){Object.assign(this,{env,directory,fetcher});}
  async integration(businessId){
    const [row]=await this.directory.request('vm_integrations?'+query({business_id:'eq.'+businessId,provider:'eq.meta',limit:'1'}));
    if(!row||row.config?.disconnected)throw fail(409,'La empresa no tiene una autorización de WhatsApp activa.');
    return row;
  }
  async graph(row,path,body){
    const {accessToken}=new CredentialVault(this.env.INTEGRATION_ENCRYPTION_KEY).open(row.encrypted_credentials,'meta:'+row.business_id);
    let response;
    try{
      response=await this.fetcher('https://graph.facebook.com/'+this.env.META_GRAPH_VERSION+'/'+path,{
        method:body?'POST':'GET',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
        ...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(15000)
      });
      const result=await response.json();
      if(response.ok)return result;
      const error=fail(502,'Meta no confirmó la operación. Revisá el estado antes de volver a intentar.');
      if(Number.isInteger(result.error?.code))error.metaCode=result.error.code;
      throw error;
    }catch(error){if(error.status)throw error;throw fail(502,'No se pudo confirmar el resultado en Meta. No repitas el envío sin verificarlo.');}
  }
  async update(row,config){
    row.config={...row.config,...config};
    await this.directory.request('vm_integrations?'+query({business_id:'eq.'+row.business_id,provider:'eq.meta'}),{method:'PATCH',body:{config:row.config,updated_at:new Date().toISOString()}});
  }
  async prepare(businessId){
    if(this.env.META_WEBHOOKS_ENABLED!=='true')throw fail(503,'Primero se debe verificar el receptor de eventos de Meta.');
    const row=await this.integration(businessId);
    const phone=await this.graph(row,row.config.phoneId+'?fields=id,is_on_biz_app,platform_type');
    if(phone.is_on_biz_app!==true||phone.platform_type!=='CLOUD_API')throw fail(409,'Meta no confirmó coexistencia. Se conserva la autorización sin migrar ni registrar el número.');
    await this.update(row,{coexistenceVerified:true});
    if(!row.config.subscribed){
      const result=await this.graph(row,row.config.wabaId+'/subscribed_apps',{});
      if(result.success!==true)throw fail(502,'Meta no confirmó la suscripción a eventos.');
      await this.update(row,{subscribed:true});
    }
    const existing=await this.directory.request('vm_channels?'+query({kind:'eq.whatsapp',external_account_id:'eq.'+row.config.phoneId,select:'id,business_id'}));
    if(existing.some(x=>x.business_id!==businessId))throw fail(409,'El número ya está asociado a otra empresa.');
    if(existing.length)await this.directory.request('vm_channels?'+query({id:'eq.'+existing[0].id}),{method:'PATCH',body:{enabled:true}});
    else await this.directory.request('vm_channels',{method:'POST',body:{business_id:businessId,kind:'whatsapp',external_account_id:row.config.phoneId,enabled:true}});
    await this.update(row,{receivingEnabled:true});
    for(const type of ['smb_app_state_sync','history']){
      if(row.config.sync?.[type])continue;
      // These requests can only be made once. Claim durably before calling Meta;
      // uncertain results require inspection, never an automatic retry.
      const claim=await this.directory.request('vm_meta_event_receipts',{method:'POST',body:{business_id:businessId,event_key:'sync:'+businessId+':'+row.config.phoneId+':'+type,payload:{type},state:'pending'}}).catch(error=>{if(error.status===409)throw fail(409,'La sincronización ya fue solicitada. Verificá su estado; no se repetirá automáticamente.');throw error;});
      const result=await this.graph(row,row.config.phoneId+'/smb_app_data',{messaging_product:'whatsapp',sync_type:type});
      if(!result.request_id)throw fail(502,'Meta no confirmó la solicitud de sincronización.');
      await this.update(row,{sync:{...row.config.sync,[type]:{requestId:result.request_id,status:'requested',at:new Date().toISOString()}}});
      await this.directory.request('vm_meta_event_receipts?'+query({event_key:'eq.'+claim[0].event_key}),{method:'PATCH',body:{state:'processed'}});
    }
    return {coexistenceVerified:true,receivingEnabled:true,syncRequested:true,outbound:false};
  }
  async receive(body){
    // Persist each signed change before any processing. Contacts/history can be
    // large, arrive in chunks and must survive serverless restarts and retries.
    for(const entry of body.entry||[])for(const change of entry.changes||[]){
      const value=change.value||{};
      const phoneId=value.metadata?.phone_number_id;
      const wabaId=value.waba_info?.waba_id||entry.id;
      const rows=await this.directory.request('vm_integrations?'+query({provider:'eq.meta',...(phoneId?{'config->>phoneId':'eq.'+phoneId}:{'config->>wabaId':'eq.'+wabaId})}));
      if(rows.length!==1)continue;
      const row=rows[0];
      const payload={entryId:entry.id,change};
      const eventKey=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      await this.directory.request('vm_meta_event_receipts',{method:'POST',body:{business_id:row.business_id,event_key:eventKey,payload,state:'received'}}).catch(error=>{if(error.status!==409)throw error;});
      if(change.field==='account_update'&&['PARTNER_REMOVED','ACCOUNT_DELETED','ACCOUNT_DISABLED'].includes(value.event)){
        await this.directory.request('vm_channels?'+query({business_id:'eq.'+row.business_id,kind:'eq.whatsapp',external_account_id:'eq.'+row.config.phoneId}),{method:'PATCH',body:{enabled:false}});
        await this.update(row,{disconnected:true,receivingEnabled:false,disconnectedAt:new Date().toISOString()});
      }
    }
  }
  async sendTest(businessId,input){
    if(input?.confirm!==true||! /^[0-9a-f-]{36}$/.test(input?.requestId||''))throw fail(400,'Confirmá el envío de prueba.');
    const recipient=this.env.META_REVIEW_RECIPIENT;
    if(!/^\d{8,15}$/.test(recipient||''))throw fail(503,'Falta un destinatario de prueba autorizado.');
    const row=await this.integration(businessId);
    if(!row.config.coexistenceVerified||!row.config.receivingEnabled)throw fail(409,'Primero completá la validación de coexistencia y recepción.');
    const templates=await this.graph(row,row.config.wabaId+'/message_templates?name=hello_world&fields=name,status,language&limit=100');
    if(!templates.data?.some(t=>t.name==='hello_world'&&t.status==='APPROVED'&&t.language==='en_US'))throw fail(409,'Esta cuenta no tiene hello_world en inglés aprobada. Prepará una plantilla de prueba antes de enviar.');
    const key='send:'+businessId+':'+input.requestId;
    await this.directory.request('vm_meta_event_receipts',{method:'POST',body:{business_id:businessId,event_key:key,payload:{operation:'test_message'},state:'pending'}});
    const result=await this.graph(row,row.config.phoneId+'/messages',{messaging_product:'whatsapp',to:recipient,type:'template',template:{name:'hello_world',language:{code:'en_US'}}});
    const messageId=result.messages?.[0]?.id;
    if(!messageId)throw fail(502,'Meta no devolvió un identificador de mensaje. Verificá el resultado antes de repetir.');
    await this.directory.request('vm_meta_event_receipts?'+query({event_key:'eq.'+key}),{method:'PATCH',body:{state:'processed',payload:{operation:'test_message',messageId}}});
    return {accepted:true,messageId,delivered:false};
  }
}
