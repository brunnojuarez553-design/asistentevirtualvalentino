// Reglas de lenguaje fundamentadas en textos que Valentino proporcionó anteriormente.
// Las citas reales son fragmentos: no se reconstruyen conversaciones ni videos inexistentes.
export const verifiedValentinoPhrases=[
  "Gracias por comunicarte con VALENTINO MOTOR'S",
  "Indíquenos su requerimiento",
  "Para brindarle una atención de excelencia y formalizar su cita en nuestro sistema, le solicitamos cordialmente"
];
// The most recent customer statement wins. Never combine a new model with an old
// model's year/engine: that would produce a false exact-vehicle quotation.
const MODEL=/\b(corolla(?:\s+cross)?|tacoma|hilux|rav4|swift|yaris|4runner|camry)\b/i;
const BRAND=/\b(toyota|suzuki|nissan|mitsubishi|ford|chevrolet|jeep|hyundai|kia)\b/i;
const YEAR=/\b(?:19|20)\d{2}\b/;
const ENGINE=/\b(?:motor\s+)?\d[.,]\d(?:\s*(?:l|litros?))?\b/i;
const clean=value=>String(value??'').trim();
const match=(text,re)=>clean((text.match(re)||[])[0]);
export function knownVehicleDetails(text,history=[],vehicle={}){
  const customerMessages=(history||[]).filter(m=>m?.role==='cliente').map(m=>clean(m.text)).filter(Boolean);
  const messages=[...customerMessages,clean(text)].filter(Boolean);
  let facts={brand:clean(vehicle.make),model:clean(vehicle.model),year:clean(vehicle.year),engine:clean(vehicle.engine)};
  for(const message of messages){
    const model=match(message,MODEL),brand=match(message,BRAND);
    const year=match(message,YEAR),engine=match(message,ENGINE);
    if(model && facts.model && model.toLowerCase()!==facts.model.toLowerCase()){
      facts={brand:'',model:'',year:'',engine:''};
    }else if(brand && facts.brand && brand.toLowerCase()!==facts.brand.toLowerCase() && !model){
      facts={brand:'',model:'',year:'',engine:''};
    }
    if(model)facts.model=model;
    if(brand)facts.brand=brand;
    if(year)facts.year=year;
    if(engine)facts.engine=engine;
  }
  return {...facts,hasYear:Boolean(facts.year),hasEngine:Boolean(facts.engine)};
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
