import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProvider,resolveGroqModel,AIProviderError} from '../lib/provider.mjs';
test('adaptador desactivado sin claves; activación exige configuración',()=>{assert.equal(createProvider({}),undefined);assert.throws(()=>createProvider({AI_ENABLED:'true'}));});
test('adaptador usa Responses sin almacenamiento, limita salida y no expone clave',async()=>{
 let request;const p=createProvider({AI_ENABLED:'true',OPENAI_API_KEY:'fake-key',OPENAI_MODEL:'configured-model'},async(url,options)=>{request={url,...options};return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Borrador'}]}]})};});
 assert.equal(await p.draft({text:'Hola',history:[],tone:{},services:[]}),'Borrador');const body=JSON.parse(request.body);assert.equal(body.store,false);assert.equal(body.model,'configured-model');assert.ok(!request.body.includes('fake-key'));
});
test('rechaza errores, salida vacía y respuestas incompletas',async()=>{for(const response of [{ok:false},{ok:true,json:async()=>({status:'incomplete'})},{ok:true,json:async()=>({status:'completed',output:[]})}]){const p=createProvider({AI_ENABLED:'true',OPENAI_API_KEY:'fake',OPENAI_MODEL:'model'},async()=>response);await assert.rejects(()=>p.draft({text:'hola',history:[],tone:{},services:[]}));}});

test('Groq prepara borrador por API oficial sin publicar ni inventar citas',async()=>{
 let request;const p=createProvider({AI_ENABLED:'true',AI_PROVIDER:'groq',GROQ_API_KEY:'secret-test',GROQ_MODEL:'modelo-configurado'},async(url,options)=>{
   request={url,...options};return {ok:true,json:async()=>({choices:[{message:{content:'Saludos, ¿qué modelo y año tiene su vehículo?'}}]})};
 });
 const message=await p.draft({text:'Quiero una cita',history:[],tone:{greeting:'Saludos'},services:[]});
 assert.match(message,/Saludos/);
 assert.equal(request.url,'https://api.groq.com/openai/v1/chat/completions');
 const body=JSON.parse(request.body);assert.equal(body.model,'modelo-configurado');
 assert.ok(body.messages[0].content.includes('Valentino confirma personalmente el turno'));
 assert.ok(!request.body.includes('secret-test'));
});
test('Groq requiere clave y modelo explícitos al activarse',()=>{
 assert.throws(()=>createProvider({AI_ENABLED:'true',AI_PROVIDER:'groq',GROQ_MODEL:'modelo'}));
 assert.throws(()=>createProvider({AI_ENABLED:'true',AI_PROVIDER:'desconocido'}));
});

test('Groq recibe el estilo guardado, el historial y contexto comercial sin revelar tarifas internas',async()=>{
 let request;
 const provider=createProvider({AI_ENABLED:'true',AI_PROVIDER:'groq',GROQ_API_KEY:'private-key-test',
   GROQ_MODEL:'llama-3.3-70b-versatile'},async(url,options)=>{
   request={url,...options};return {ok:true,json:async()=>({choices:[{message:{content:'Con gusto, ¿me confirma la motorización exacta de su vehículo?'}}]})};
 });
 const reply=await provider.draft({text:'¿Cuánto vale el servicio?',history:[
   {role:'cliente',text:'Tengo un Corolla 2025'},
   {role:'asistente',text:'Saludos, ¿en qué le ayudamos?'},
   {role:'cliente',text:'¿Cuánto vale el servicio?'}],
   tone:{greeting:'Saludos, con gusto le ayudamos.',style:'Trato de tú y te con español venezolano',
     examples:['Saludos, buen día. ¿En qué podemos ayudarle?']},
   business:{location:'Catia La Mar',hours:'L-V 7:30 a 12:00'},
   services:[],catalog:[{name:'EGR Toyota',approved:false,referencePriceUsd:665}],
   firstReply:false,kind:'price',channel:'whatsapp'});
 assert.match(reply,/motorización exacta/);
 const body=JSON.parse(request.body);
 assert.equal(body.messages.at(-1).content,'¿Cuánto vale el servicio?');
 assert.equal(body.messages.at(-2).role,'assistant');
 assert.match(body.messages[0].content,/Trato de tú y te/);
 assert.match(body.messages[0].content,/Catia La Mar/);
 assert.match(body.messages[0].content,/NOMBRES DE SERVICIOS PENDIENTES/);
 assert.doesNotMatch(body.messages[0].content,/665/);
 assert.doesNotMatch(request.body,/private-key-test/);
 assert.match(body.messages[0].content,/No vuelva a saludar/);
});

test('la IA recibe solo copy comercial cuando revisión técnica/legal continúa pendiente',async()=>{
 let request;
 const p=createProvider({AI_ENABLED:'true',AI_PROVIDER:'groq',GROQ_API_KEY:'fake-secret',GROQ_MODEL:'test-model'},
 async(url,options)=>{request=options;return {ok:true,json:async()=>({choices:[{message:{content:'Con gusto te ayudamos, ¿nos confirmas el motor?'}}]})};});
 const service={name:'Blindaje Toyota',description:'Procedimiento sin validación',publicCopy:'Te orientamos para confirmar la motorización.',approved:true,
  needs_technical_review:true,needs_legal_review:true,referencePriceUsd:665,active:true};
 await p.draft({text:'¿cuánto sale?',history:[],tone:{style:'Tú y te'},business:{},services:[service],catalog:[service]});
 const prompt=JSON.parse(request.body).messages[0].content;
 assert.match(prompt,/Te orientamos para confirmar la motorización/);
 assert.doesNotMatch(prompt,/Procedimiento sin validación|665/);
 assert.match(prompt,/pendiente: no confirmar compatibilidad/);
 assert.match(prompt,/ni voseo argentino/);
});

test('modelo Llama retirado se migra automáticamente a GPT-OSS 120B con razonamiento corto',async()=>{
 let request;
 const p=createProvider({AI_ENABLED:'true',AI_PROVIDER:'groq',GROQ_API_KEY:'key-test',
  GROQ_MODEL:'llama-3.3-70b-versatile'},async(url,options)=>{
  request=options;
  return {ok:true,json:async()=>({choices:[{message:{content:'LISTO'}}]})};
 });
 assert.equal(resolveGroqModel('llama-3.3-70b-versatile'),'openai/gpt-oss-120b');
 assert.equal(p.model,'openai/gpt-oss-120b');
 assert.equal(p.configuredModel,'llama-3.3-70b-versatile');
 const check=await p.check();
 assert.equal(check.ok,true);
 const payload=JSON.parse(request.body);
 assert.equal(payload.model,'openai/gpt-oss-120b');
 assert.equal(payload.reasoning_effort,'low');
 assert.equal(payload.max_completion_tokens,900);
 assert.equal(request.headers.Authorization,'Bearer key-test');
});
test('diagnóstico Groq categoriza errores 401, 404 y 429 sin repetir cuerpo privado',async()=>{
 for(const [http,code] of [[401,'invalid_key'],[404,'model_unavailable'],[429,'rate_limited']]){
  const provider=createProvider({AI_ENABLED:'true',AI_PROVIDER:'groq',GROQ_API_KEY:'very-secret-token',
    GROQ_MODEL:'openai/gpt-oss-120b'},async()=>({ok:false,status:http,
      json:async()=>({error:'very-secret-token'})}));
  await assert.rejects(()=>provider.check(),e=>e instanceof AIProviderError&&e.code===code
    &&e.status===http&&!e.publicMessage.includes('very-secret-token'));
 }
});
test('la API Groq no revela la clave y no fuerza pruebas al inicializar',()=>{
 let calls=0;
 const provider=createProvider({AI_ENABLED:'true',AI_PROVIDER:'groq',GROQ_API_KEY:'hidden',
  GROQ_MODEL:'openai/gpt-oss-120b'},async()=>{calls++;throw Error('unreachable')});
 assert.equal(calls,0);
 assert.equal(provider.model,'openai/gpt-oss-120b');
});

test('frases reales de Valentino y el Corolla 2.0 quedan en el contexto de Groq',async()=>{
 let request;
 const provider=createProvider({AI_ENABLED:'true',AI_PROVIDER:'groq',GROQ_API_KEY:'test-key',GROQ_MODEL:'openai/gpt-oss-120b'},
 async(url,options)=>{request=options;return {ok:true,json:async()=>({choices:[{message:{content:'Con gusto le orientamos.'}}]})};});
 await provider.draft({
   text:'Hola, ¿cuánto sale una eliminación de EGR para mi Toyota Corolla 2.0?',
   history:[{role:'cliente',text:'Hola, ¿cuánto sale una eliminación de EGR para mi Toyota Corolla 2.0?'}],
   tone:{greeting:'Saludos.',style:'Trato de usted, le y su'},
   business:{},services:[],catalog:[],firstReply:true,kind:'price'
 });
 const prompt=JSON.parse(request.body).messages[0].content;
 assert.match(prompt,/Indíquenos su requerimiento/);
 assert.match(prompt,/Gracias por comunicarte con VALENTINO MOTOR'S/);
 assert.match(prompt,/"hasEngine":true/);
 assert.match(prompt,/"hasYear":false/);
 assert.match(prompt,/NO vuelva a preguntar la motorización/);
 assert.match(prompt,/usted\/le\/su/);
});
