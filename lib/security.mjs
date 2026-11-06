import {createHmac,timingSafeEqual} from 'node:crypto';
export function same(a,b) {const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length && x.length>0 && timingSafeEqual(x,y);}
export function signature(raw, header, secret) {return !!secret && same(header,'sha256='+createHmac('sha256',secret).update(raw).digest('hex'));}
export function metaEvents(body) {
  const result=[];
  for(const e of body.entry||[]) {
    for(const m of e.messaging||[]) {
      if(!m.message?.mid || !m.sender?.id || m.message.is_echo)continue;
      if(typeof m.message.text==='string')result.push({...(e.id?{externalAccountId:String(e.id)}:{}),id:'ig:'+m.message.mid,contact:m.sender.id,text:m.message.text,channel:'instagram'});
      else if(Array.isArray(m.message.attachments) && m.message.attachments.length)
        result.push({...(e.id?{externalAccountId:String(e.id)}:{}),id:'ig:'+m.message.mid,contact:m.sender.id,text:'[Archivo adjunto de Instagram]',channel:'instagram',mediaType:(m.message.attachments[0]?.type==='image'?'image':m.message.attachments[0]?.type==='audio'?'audio':'attachment'),mediaSource:'instagram'});
    }
    for (const change of e.changes || []) {
      if(change.field==='smb_message_echoes'){
        const value=change.value||{};
        for(const m of value.messages||[]){
          if(m.id && m.to && m.from && m.from!==m.to)
            result.push({...(value.metadata?.phone_number_id?{externalAccountId:String(value.metadata.phone_number_id)}:{}),id:'wa-echo:'+m.id,channel:'whatsapp',contact:String(m.to),outboundHuman:true,text:typeof m.text?.body==='string'?m.text.body:'[Mensaje enviado desde WhatsApp Business]'});
        }
      }
      if(change.field==='smb_message_echoes')continue;
      const value = change.value || {};
      // Comentarios públicos de Instagram: solo se guardan como casos para revisión humana.
      if (change.field === 'comments' && value.id && typeof value.text === 'string') {
        result.push({...(e.id?{externalAccountId:String(e.id)}:{}),id:'ig-comment:'+value.id,contact:String(value.from?.id||value.from?.username||'instagram'),text:value.text,channel:'instagram_comentario'});
      }
      for (const m of value.messages || []) {
        if(!m.id || !m.from)continue;
        if(m.type==='text' && typeof m.text?.body==='string')
          result.push({...(value.metadata?.phone_number_id?{externalAccountId:String(value.metadata.phone_number_id)}:{}),id:'wa:'+m.id,contact:m.from,text:m.text.body,channel:'whatsapp'});
        else if(['audio','image','video','document','sticker'].includes(m.type))
          result.push({...(value.metadata?.phone_number_id?{externalAccountId:String(value.metadata.phone_number_id)}:{}),id:'wa:'+m.id,contact:m.from,text:'[Archivo adjunto de WhatsApp]',channel:'whatsapp',mediaType:m.type,mediaId:m[m.type]?.id});
      }
    }
  }
  return result;
}
