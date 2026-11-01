// Reglas de lenguaje fundamentadas en textos que Valentino proporcionó anteriormente.
// Las citas reales son fragmentos: no se reconstruyen conversaciones ni videos inexistentes.
export const verifiedValentinoPhrases=[
  "Gracias por comunicarte con VALENTINO MOTOR'S",
  "Indíquenos su requerimiento",
  "Para brindarle una atención de excelencia y formalizar su cita en nuestro sistema, le solicitamos cordialmente"
];
export function knownVehicleDetails(text,history=[],vehicle={}){
  const context=[...(history||[]).filter(m=>m?.role==='cliente').map(m=>m.text||''),String(text||'')].join(' ');
  const model=(context.match(/\b(corolla(?:\s+cross)?|tacoma|hilux|rav4|swift|yaris|4runner|camry)\b/i)||[])[0]||vehicle.model||'';
  const brand=(context.match(/\b(toyota|suzuki|nissan|mitsubishi|ford|chevrolet|jeep|hyundai|kia)\b/i)||[])[0]||vehicle.make||'';
  const year=(context.match(/\b(?:19|20)\d{2}\b/)||[])[0]||String(vehicle.year||'');
  const displacement=(context.match(/\b(?:motor\s+)?\d[.,]\d(?:\s*(?:l|litros?))?\b/i)||[])[0]||String(vehicle.engine||'');
  return {brand,model,year,engine:displacement,
    hasYear:Boolean(year),hasEngine:Boolean(displacement)};
}
export function isInformalReply(reply){
  const text=String(reply||'').replace(/Gracias por comunicarte con VALENTINO MOTOR'S/ig,'');
  // Sin falsear los mensajes de Valentino: el encabezado de marca es una excepción
  // mientras que el cuerpo de cotizaciones y citas usa usted/le/su.
  return /\b(?:te ayudamos|te ayudaremos|te confirmamos|te podemos|te orientamos|te enviamos|te esperamos|te confirma|nos confirmas|nos indicas|cu[eé]ntanos|env[ií]anos|ind[ií]canos|tu veh[ií]culo|tu auto|tu cita|tu motor|tu nombre|ten[eé]s|pod[eé]s|decime|contanos)\b/i.test(text);
}
export const valentinoVoicePolicy=[
  "IDENTIDAD VERBAL PRIORITARIA: escriba como el equipo de VALENTINO MOTOR'S, no como un chatbot genérico y no simule ser Valentino en persona.",
  "Los mensajes originales proporcionados por el taller usan saludos 'Saludos' o 'Saludos, buen día', fórmulas 'Con gusto' y trato profesional de usted/le/su: 'Indíquenos su requerimiento'. No use tuteo casual en el cuerpo (te ayudamos, nos confirmas, tu vehículo), ni voseo argentino (vos, tenés, podés).",
  "Una bienvenida real de la marca contiene 'Gracias por comunicarte con VALENTINO MOTOR’S'; consérvela solo cuando encaje como primer contacto, no la repita ni la agregue a cada respuesta. Esa frase puede usar 'comunicarte' como excepción documental.",
  "Cuando el cliente ya hizo una pregunta concreta, responda con una orientación antes de pedir datos; no pegue saludos prefabricados ni repita 'Con gusto' en la misma respuesta.",
  "WhatsApp e Instagram DM: 1 a 3 frases naturales y respetuosas normalmente. Para formalizar una cita o enviar un presupuesto, se admite un mensaje más estructurado: 'Para brindarle una atención de excelencia y formalizar su cita en nuestro sistema, le solicitamos cordialmente…'.",
  "No hable de planes ni procesos internos de la IA, ni use frases robóticas como 'Para orientarte mejor' repetidas en todos los casos.",
  "Nunca invente precios, compatibilidades, garantías, servicios, diagnósticos o disponibilidad de citas. Valentino confirma personalmente el turno.",
  "Los fragmentos citados son verificables del material recibido; cualquier respuesta adicional es una redacción nueva basada en su patrón, no una cita textual del dueño."
].join('\n');
