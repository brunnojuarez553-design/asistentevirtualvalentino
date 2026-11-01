// Compatibilidad entre Node HTTP y Vercel Functions. No serializar mensajes firmados de Meta.
export async function readBody(req,maxBytes=65536){
  let result;
  if(req.body!==undefined && req.body!==null){
    result=Buffer.isBuffer(req.body)?req.body:
      typeof req.body==='string'?Buffer.from(req.body,'utf8'):
      typeof req.body==='object'?Buffer.from(JSON.stringify(req.body),'utf8'):
      null;
    if(!result)throw Object.assign(Error('Formato de solicitud no permitido'),{status:400});
  }else{
    let total=0;const chunks=[];
    for await(const chunk of req){
      total+=Buffer.byteLength(chunk);
      if(total>maxBytes)throw Object.assign(Error('Solicitud demasiado grande'),{status:413});
      chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
    }
    result=Buffer.concat(chunks);
  }
  if(result.length>maxBytes)throw Object.assign(Error('Solicitud demasiado grande'),{status:413});
  return result;
}
export function requireRawWebhook(req){
  // Si un middleware convirtió el JSON a objeto, se perdió la representación original
  // firmada por Meta. Rechazamos la solicitud, sin intentar reconstruirla.
  if(req.body!==undefined && req.body!==null &&
      !(Buffer.isBuffer(req.body)||typeof req.body==='string'))
    throw Object.assign(Error('Webhook requiere cuerpo original sin parsear'),{status:400});
}
