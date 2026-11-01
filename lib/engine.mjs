export const normalize = s => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
export function quote(config, serviceId, vehicle, now = new Date()) {
  const service = (config.services||[]).find(s=>s.id===serviceId && s.approved===true && s.active!==false);
  if(!service || !vehicle || !['make','model','year','engine'].every(k=>String(vehicle[k]??'').trim()))return null;
  const matches=(service.prices||[]).filter(p=>p && p.approved===true && Number.isFinite(p.amount)
    && p.amount>0 && /^[A-Z]{3}$/.test(p.currency) && new Date(p.validUntil)>now
    && ['make','model','year','engine'].every(k=>normalize(p[k])===normalize(vehicle[k])));
  if(matches.length!==1)return null;
  return {amount:matches[0].amount,currency:matches[0].currency,validUntil:matches[0].validUntil,
    conditions:matches[0].conditions||'Sujeto a evaluación técnica.',service:service.name};
}
const handoff=(state,reason,draft=null)=>({state,reply:null,reason,draft});
export function friendlyFallback({text,config={},conversation={},kind,vehicle={}}){
  const history=conversation.messages||[];
  const greeting=history.some(m=>m.role==='asistente'||m.role==='equipo')?'':(config.tone?.greeting||'Saludos, ¡con gusto te ayudamos!').trim()+' ';
  const n=normalize(text);
  const priorCustomer=history.filter(m=>m.role==='cliente').map(m=>m.text).join(' ');
  const context=normalize(priorCustomer+' '+String(text||''));
  const year=/(?:19|20)\d{2}/.test(context)||Boolean(vehicle.year);
  const motor=/(?:\b(?:motor(?:izacion)?\s*)?\d[.,]\d\b|\b[a-z0-9-]{3,}\s+(?:motor|engine)\b)/.test(context)||Boolean(vehicle.engine);
  const brand=/(toyota|corolla|tacoma|suzuki|swift|hilux|yaris|rav4|4runner|camry)/.test(context)||Boolean(vehicle.make||vehicle.model);
  if(kind==='price'){
    const egr=/\begr\b|eliminacion de emisiones|anulacion de emisiones/.test(n);
    let question;
    if(!motor)question='¿Nos confirmas qué motor tiene tu vehículo?';
    else if(!year)question='¿Nos confirmas de qué año es?';
    else question='¿Nos compartes el código de motor o la versión exacta para que el equipo lo revise?';
    const lead=egr?'Para revisar las opciones compatibles y las condiciones técnicas y legales de ese trabajo,':'Para darte un presupuesto correcto,';
    return greeting+lead+' '+question+' Valentino confirma la viabilidad y el valor antes de avanzar.';
  }
  if(kind==='booking'){
    return greeting+'Para coordinar tu visita, cuéntanos qué servicio necesitas y qué día te gustaría venir. Valentino te confirma personalmente la disponibilidad.';
  }
  if(kind==='hours'){
    return greeting+'Nuestro horario de atención es '+(config.business?.hours||'a confirmar con el equipo')+'. ¿En qué podemos ayudarte?';
  }
  if(kind==='location'){
    return greeting+'Estamos ubicados en '+(config.business?.location||'Catia La Mar, estado La Guaira')+'. ¿Quieres que te compartamos indicaciones para llegar?';
  }
  if(brand)return greeting+'Claro, cuéntanos qué necesitas revisar en tu vehículo y con gusto te orientamos.';
  return greeting+'¿Nos cuentas qué vehículo tienes y qué servicio necesitas? Así podemos orientarte mejor.';
}
export async function respond({text,conversation,config,vehicle,serviceId,provider}){
  if(conversation.state!=='ia')return {state:conversation.state,reply:null,
    reason:'Atención pausada para intervención del equipo.'};
  const n=normalize(text);
  const kind= /\b(turno|turnos|reservar?|reserva|cita|citas|agendar?|agenda|disponibilidad|disponible|quiero ir al taller)\b/.test(n) ?'booking'
    :/\b(precio|precios|cuanto|cotiza|cotizacion|cotizar|costo|costos|vale|valor|tarifa|presupuesto)\b/.test(n)?'price'
    :/horario|a que hora|abren|cierran/.test(n)?'hours'
    :/ubicacion|direccion|donde queda|donde estan|como llegar/.test(n)?'location':'general';
  const firstReply=!(conversation.messages||[]).some(m=>m.role==='asistente'||m.role==='equipo');
  const approved=(config.services||[]).filter(s=>s.approved===true&&s.active!==false);
  const catalog=(config.services||[]).filter(s=>s.active!==false);
  // Un comentario público siempre requiere moderación, jamás publicación automática.
  if(conversation.channel==='instagram_comentario'){
    let draft='Saludos, con gusto te ayudamos. ¿Nos confirmas qué vehículo tienes y de qué año es para orientarte?';
    if(provider)try{draft=await provider.draft({text,history:conversation.messages||[],tone:config.tone,business:config.business,
      services:approved,catalog,firstReply,kind,channel:conversation.channel,vehicle});}catch{}
    return handoff('revision','Comentario público de Instagram: aprobación humana antes de publicar.',String(draft).slice(0,3000));
  }
  if(/\b(humano|persona|reclamo|garantia|enojado|devolucion|abogado|hablar con valentino)\b/.test(n))
    return handoff('humano','Cliente solicita atención humana o plantea un reclamo.');
  if(/frena|sin frenos|humo|incendio|accidente|pierde combustible|fuga de gasolina/.test(n))
    return handoff('revision','Consulta de seguridad: requiere evaluación humana.');
  const q=quote(config,serviceId,vehicle);
  if(kind==='price'&&q){
    return {state:'ia',reply:`${firstReply?(config.tone?.greeting||'Saludos, con gusto le ayudamos.')+' ':''}${q.service}: ${q.currency} ${q.amount}. ${q.conditions} Vigente hasta ${q.validUntil}. La disponibilidad del turno la confirma Valentino personalmente.`,quote:q};
  }
  if(kind==='booking'){
    // Responde con solicitud de datos, pero deja la conversación en revisión.
    const reply=friendlyFallback({text,config,conversation,kind,vehicle});
    return {state:'revision',reply,reason:'Solicitud de turno: Valentino confirma personalmente la agenda.',draft:null};
  }
  if(provider){
    try{
      const reply=await provider.draft({text,history:conversation.messages||[],tone:config.tone,
        business:config.business,services:approved,catalog,firstReply,kind,channel:conversation.channel||'whatsapp',vehicle});
      // Defensa adicional: si Groq propone un importe sin tarifa aprobada, no se muestra.
      const message=String(reply).trim().slice(0,3000);
      const moneyPattern=/(?:\$\s*\d|\bUSD\b|\bEUR\b|\bBs\.?\s*\d|\b\d+(?:[.,]\d+)?\s*(?:d[oó]lares|euros|bol[ií]vares)\b)/i;
      if(kind==='price'&&!q&&moneyPattern.test(message))
        return {state:'ia',reply:friendlyFallback({text,config,conversation,kind,vehicle}),
          reason:'Se bloqueó un importe generado sin una tarifa exacta aprobada.'};
      return {state:'ia',reply:message,
        reason:kind==='price'?'Precio sujeto a evaluación del equipo; no hay tarifa exacta aprobada.':null};
    }catch(error){
      return {state:'ia',reply:friendlyFallback({text,config,conversation,kind,vehicle}),
        reason:(error?.publicMessage||'Groq no respondió; se usó una respuesta de respaldo sin precios.')};
    }
  }
  return {state:'ia',reply:friendlyFallback({text,config,conversation,kind,vehicle}),
    reason:'Respuesta de respaldo; activá Groq para obtener redacción personalizada.'};
}
