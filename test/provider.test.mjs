import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProvider} from '../lib/provider.mjs';
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
 assert.ok(body.messages[0].content.includes('turnos los confirma Valentino'));
 assert.ok(!request.body.includes('secret-test'));
});
test('Groq requiere clave y modelo explícitos al activarse',()=>{
 assert.throws(()=>createProvider({AI_ENABLED:'true',AI_PROVIDER:'groq',GROQ_MODEL:'modelo'}));
 assert.throws(()=>createProvider({AI_ENABLED:'true',AI_PROVIDER:'desconocido'}));
});
