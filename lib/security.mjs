import {createHmac,timingSafeEqual} from 'node:crypto';
export function same(a,b) {const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length && x.length>0 && timingSafeEqual(x,y);}
export function signature(raw, header, secret) {return !!secret && same(header,'sha256='+createHmac('sha256',secret).update(raw).digest('hex'));}
export function metaEvents(body) {
  const result=[];
  for(const e of body.entry||[]) {
    for(const m of e.messaging||[]) {
      if(!m.message?.mid || !m.sender?.id)continue;
      if(m.message.is_echo){if(m.recipient?.id&&String(m.sender.id)===String(e.id))result.push({externalAccountId:String(e.id),id:'ig-echo:'+m.message.mid,contact:String(m.recipient.id),channel:'instagram',outboundHuman:true,text:typeof m.message.text==='string'?m.message.text:'[Mensaje enviado desde Instagram]'});continue;}
      if(typeof m.message.text==='string')result.push({...(e.id?{externalAccountId:String(e.id)}:{}),id:'ig:'+m.message.mid,contact:m.sender.id,at:Number.isFinite(Number(m.timestamp))&&Number(m.timestamp)>0?new Date(Number(m.timestamp)).toISOString():null,text:m.message.text,channel:'instagram'});
      else if(Array.isArray(m.message.attachments) && m.message.attachments.length)
        result.push({...(e.id?{externalAccountId:String(e.id)}:{}),id:'ig:'+m.message.mid,contact:m.sender.id,text:'[Archivo adjunto de Instagram]',channel:'instagram',mediaType:(m.message.attachments[0]?.type==='image'?'image':m.message.attachments[0]?.type==='audio'?'audio':'attachment'),mediaSource:'instagram'});
    }
    for (const change of e.changes || []) {
      if(change.field==='smb_message_echoes'){
        const value=change.value||{};
        for(const m of value.message_echoes||value.messages||[]){
          if(m.id && (m.to||m.to_user_id) && m.from && m.from!==m.to)
            result.push({...(value.metadata?.phone_number_id?{externalAccountId:String(value.metadata.phone_number_id)}:{}),id:'wa-echo:'+m.id,channel:'whatsapp',contact:String(m.to||m.to_user_id),outboundHuman:true,text:typeof m.text?.body==='string'?m.text.body:'[Mensaje enviado desde WhatsApp Business]'});
        }
      }
      if(change.field==='smb_message_echoes')continue;
      if(change.field==='history'){
        const value=change.value||{};
        for(const chunk of value.history||[])for(const thread of chunk.threads||[])for(const m of thread.messages||[]){
          const contact=thread.id||thread.context?.wa_id||thread.context?.user_id;
          if(!m.id||!contact)continue;
          const seconds=Number(m.timestamp);
          result.push({externalAccountId:String(value.metadata?.phone_number_id||''),id:'wa:'+m.id,channel:'whatsapp',contact:String(contact),historical:true,outboundHuman:String(m.from)===String(value.metadata?.display_phone_number),text:typeof m.text?.body==='string'?m.text.body:'[Archivo del historial de WhatsApp]',...(Number.isFinite(seconds)&&seconds>0&&seconds<8640000000000?{at:new Date(seconds*1000).toISOString()}: {})});
        }
        continue;
      }
      const value = change.value || {};
      // Comentarios públicos de Instagram: solo se guardan como casos para revisión humana.
      if (change.field === 'comments' && value.id && typeof value.text === 'string' && String(value.from?.id)!==String(e.id)) {
        result.push({...(e.id?{externalAccountId:String(e.id)}:{}),id:'ig-comment:'+value.id,contact:String(value.from?.id||value.from?.username||'instagram'),text:value.text,channel:'instagram_comentario',threadKey:'ig-comment:'+value.id,mediaId:String(value.media?.id||'')});
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


