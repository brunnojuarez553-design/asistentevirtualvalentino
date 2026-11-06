import {knownVehicleDetails,isInformalReply} from './valentino-voice.mjs';
export const normalize = s => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
export function quote(config, serviceId, vehicle, now = new Date()) {
  const service = (config.services||[]).find(s=>s.id===serviceId && s.approved===true && s.active!==false);
  if(!service || service.needs_technical_review===true || service.needs_legal_review===true || !vehicle || !['make','model','year','engine'].every(k=>String(vehicle[k]??'').trim()))return null;
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
  const firstReply=!history.some(m=>m.role==='asistente'||m.role==='equipo');
  const greeting=firstReply?(config.tone?.greeting||'Saludos, buen día.').trim()+' ':'';
  const facts=knownVehicleDetails(text,history,vehicle);
  const model=facts.model?facts.model.replace(/^./,c=>c.toUpperCase()):'vehículo';
  const make=facts.brand?facts.brand.replace(/^./,c=>c.toUpperCase()):'';
  const vehicleName=make && !model.toLowerCase().startsWith(make.toLowerCase())?make+' '+model:model;
  const n=normalize(text);
  if(kind==='price'){
    const egr=/\begr\b|eliminacion de emisiones|anulacion de emisiones/.test(n);
    const preamble=egr?'Con gusto le orientamos sobre su consulta. Antes de confirmar cualquier intervención de EGR, es necesario validar la compatibilidad técnica y la normativa aplicable.':
      'Con gusto le orientamos sobre el servicio y su presupuesto.';
    const question= !facts.hasEngine?'¿Nos indica la motorización de su '+vehicleName+'?':
      !facts.hasYear?'¿Nos indica de qué año es su '+vehicleName+(facts.engine?' '+facts.engine:'')+'?':
      'Nuestro equipo revisará la configuración de su '+vehicleName+' y le confirmará la viabilidad y el presupuesto.';
    return greeting+preamble+' '+question;
  }
  if(kind==='booking'){
    return greeting+'Con gusto le ayudamos a coordinar su cita. Indíquenos el servicio que requiere y el día de su preferencia. Valentino le confirmará personalmente la disponibilidad.';
  }
  if(kind==='hours')return greeting+'Nuestro horario de atención es '+(config.business?.hours||'a confirmar con el equipo')+'. ¿En qué podemos ayudarle?';
  if(kind==='location')return greeting+'Estamos ubicados en '+(config.business?.location||'Catia La Mar, estado La Guaira')+'. Si requiere indicaciones para llegar, con gusto le orientamos.';
  if(facts.brand||facts.model)return greeting+'Con gusto le atendemos. Indíquenos qué requiere revisar en su vehículo para orientarle correctamente.';
  return greeting+'Gracias por contactar a VALENTINO MOTOR\'S. Indíquenos su requerimiento y con gusto le atenderemos.';
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
    let draft='Saludos, con gusto le atendemos. ¿Nos indica el modelo y año de su vehículo para orientarle?';
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
      // Evitar redacciones informales o preguntas duplicadas aun cuando Groq ignore el prompt.
      const facts=knownVehicleDetails(text,conversation.messages||[],vehicle);
      const repeatsMotor=facts.hasEngine && !facts.hasYear
        && /(?:nos (?:confirma|indica).*motor|qué motor tiene|motorizaci[oó]n exacta|cu[aá]l es la cilindrada)/i.test(message);
      const repeatedOpening=/(?:con gusto[^.!?]{0,90}con gusto|saludos[^.!?]{0,90}saludos)/i.test(message);
      if(isInformalReply(message)||repeatsMotor||repeatedOpening)
        return {state:'ia',reply:friendlyFallback({text,config,conversation,kind,vehicle}),
          reason:'La redacción de IA no respetó el estilo o repitió datos; se usó el texto comercial seguro.'};
      const moneyPattern=/(?:\$\s*\d|\bUSD\b|\bEUR\b|\bBs\.?\s*\d|\b\d+(?:[.,]\d+)?\s*(?:d[oó]lares|euros|bol[ií]vares)\b)/i;
      if(!q&&moneyPattern.test(message))
        return {state:'ia',reply:friendlyFallback({text,config,conversation,kind,vehicle}),
          reason:'Se bloqueó un importe generado sin una tarifa exacta aprobada.'};
      const unapprovedGuarantee=/\\b(?:garant[ií]a|garantizado|garantizamos)\\b/i.test(message) && !approved.some(s=>s.warranty && normalize(message).includes(normalize(s.warranty)));\n      if(unapprovedGuarantee)return {state:'ia',reply:friendlyFallback({text,config,conversation,kind,vehicle}),reason:'Se bloqueó una garantía no validada contra el catálogo.'};\n      return {state:'ia',reply:message,
        reason:kind==='price'?'Precio sujeto a evaluación del equipo; no hay tarifa exacta aprobada.':null};
    }catch(error){
      return {state:'ia',reply:friendlyFallback({text,config,conversation,kind,vehicle}),
        reason:(error?.publicMessage||'Groq no respondió; se usó una respuesta de respaldo sin precios.')};
    }
  }
  return {state:'ia',reply:friendlyFallback({text,config,conversation,kind,vehicle}),
    reason:'Respuesta de respaldo; activá Groq para obtener redacción personalizada.'};
}
