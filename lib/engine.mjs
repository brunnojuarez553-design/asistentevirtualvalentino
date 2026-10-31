export const normalize = s => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
export function quote(config, serviceId, vehicle, now = new Date()) {
  const service = config.services.find(s => s.id === serviceId && s.approved === true);
  if (!service || !vehicle || !['make','model','year','engine'].every(k => String(vehicle[k] ?? '').trim())) return null;
  const matches = (service.prices || []).filter(p => p && p.approved === true && Number.isFinite(p.amount) && p.amount > 0 && /^[A-Z]{3}$/.test(p.currency) && new Date(p.validUntil) > now && ['make','model','year','engine'].every(k => normalize(p[k]) === normalize(vehicle[k])));
  if (matches.length !== 1) return null;
  return {amount:matches[0].amount,currency:matches[0].currency,validUntil:matches[0].validUntil,conditions:matches[0].conditions || 'Sujeto a evaluación técnica.',service:service.name};
}
// Provider interface: only drafts may come from an external model. Pricing is always deterministic.
export async function respond({text, conversation, config, vehicle, serviceId, provider}) {
  if (conversation.state !== 'ia') return {state:conversation.state,reply:null,reason:'Atención pausada para intervención del equipo.'};
  const n = normalize(text);
  // Los comentarios públicos nunca se contestan a ciegas: una persona revisa el borrador.
  if (conversation.channel === 'instagram_comentario') return {
    state:'revision',reply:null,reason:'Comentario de Instagram: moderar y aprobar respuesta pública.',
    draft:'Saludos, con gusto le ayudamos. ¿Nos indica el modelo y año de su vehículo para orientarle?'
  };
  if (/humano|persona|reclamo|garantia|enojad|devolucion|abogado|hablar con valentino/.test(n))
    return {state:'humano',reply:null,reason:'El cliente solicita atención humana o plantea un reclamo.'};
  if (/frena|humo|incendio|accidente|pierde combustible|fuga de gasolina/.test(n))
    return {state:'revision',reply:null,reason:'Consulta de seguridad: necesita evaluación humana.'};
  // Un turno siempre es manual. No dar disponibilidad, reservar ni confirmar.
  if (/turno|reserv|\bcita\b|agenda|agendar|disponib|quiero ir al taller/.test(n))
    return {state:'revision',reply:null,reason:'Solicitud de turno: Valentino confirma personalmente la agenda.',
      draft:'Saludos, con gusto le ayudamos. Para solicitar la cita, ¿nos indica nombre, vehículo, servicio requerido y día de preferencia? Valentino confirmará personalmente la disponibilidad.'};
  const q = quote(config,serviceId,vehicle);
  if (/precio|cuanto|cotiz|costo|vale/.test(n)) {
    if (!q) return {state:'revision',reply:null,reason:'Cotización sin coincidencia exacta, vigente y aprobada.',draft:'Para cotizar necesitamos marca, modelo, año y motorización. El equipo revisará la compatibilidad y el valor antes de confirmarlo.'};
    return {state:'ia',reply:`${q.service}: ${q.currency} ${q.amount}. ${q.conditions} Vigente hasta ${q.validUntil}. El turno requiere confirmación del equipo.`,quote:q};
  }

  const approved = config.services.filter(s => s.approved === true);
  const firstReply = !conversation.messages?.some(m=>m.role==='asistente');
  const reply = `${firstReply ? config.tone.greeting+' ' : ''}Indíquenos qué servicio necesita y la marca, modelo, año y motor de su vehículo.${approved.length ? ' Podemos orientarle sobre: '+approved.map(s=>s.name).join(', ')+'.' : ' Nuestro equipo confirmará los detalles del servicio.'}`;
  if (provider) {
    try { const draft = await provider.draft({text,history:conversation.messages.slice(-12),tone:config.tone,services:approved}); return {state:'revision',reply:null,draft:String(draft).slice(0,3000),reason:'Borrador generado por IA: requiere aprobación humana.'}; }
    catch { return {state:'revision',reply:null,reason:'Proveedor de IA no disponible.'}; }
  }
  return {state:'ia',reply,reason:'Simulador local de reglas; proveedor de IA pendiente.'};
}
