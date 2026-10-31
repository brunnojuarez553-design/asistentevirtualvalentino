import {createHmac,timingSafeEqual} from 'node:crypto';
export function same(a,b) {const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length && x.length>0 && timingSafeEqual(x,y);}
export function signature(raw, header, secret) {return !!secret && same(header,'sha256='+createHmac('sha256',secret).update(raw).digest('hex'));}
export function metaEvents(body) {
  const result=[];
  for(const e of body.entry||[]) {
    for(const m of e.messaging||[]) if(m.message?.mid && m.message?.text && !m.message.is_echo) result.push({id:m.message.mid,contact:m.sender?.id,text:m.message.text,channel:'instagram'});
    for (const change of e.changes || []) {
      const value = change.value || {};
      // Comentarios públicos de Instagram: solo se guardan como casos para revisión humana.
      if (change.field === 'comments' && value.id && typeof value.text === 'string') {
        result.push({id:'ig-comment:'+value.id,contact:String(value.from?.id||value.from?.username||'instagram'),text:value.text,channel:'instagram_comentario'});
      }
      for (const m of value.messages || []) if (m.type === 'text' && m.id && m.from && typeof m.text?.body === 'string')
        result.push({id:'wa:'+m.id,contact:m.from,text:m.text.body,channel:'whatsapp'});
    }
  }
  return result;
}
