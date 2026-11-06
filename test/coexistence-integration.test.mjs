import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createApp} from '../server.mjs';
const sign=body=>'sha256='+createHmac('sha256','test-secret').update(body).digest('hex');
test('WhatsApp Business manual reply pauses AI until explicit authorized resume',async t=>{
 let data={config:null,conversations:[],alerts:[],audit:[],events:[]};
 const store={load:async()=>structuredClone(data),save:async next=>{data=structuredClone(next);}};
 const app=await createApp({DASHBOARD_TOKEN:'panel-secret',META_WEBHOOKS_ENABLED:'true',META_APP_SECRET:'test-secret'},store);
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>app.close(resolve)));
 const root='http://127.0.0.1:'+app.address().port;
 async function webhook(value){
  const body=JSON.stringify({entry:[{changes:[value]}]});
  const r=await fetch(root+'/webhooks/meta',{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':sign(body)},body});
  assert.equal(r.status,200);
 }
 await webhook({field:'messages',value:{messages:[{id:'incoming1',from:'customer123',type:'text',text:{body:'Hola'}}]}});
 await webhook({field:'smb_message_echoes',value:{messages:[{id:'echo1',from:'business123',to:'customer123',type:'text',text:{body:'Yo le atiendo'}}]}});
 assert.equal(data.conversations.length,1);
 assert.equal(data.conversations[0].state,'humano');
 assert.equal(data.conversations[0].messages.filter(x=>x.delivery==='enviado_desde_whatsapp_business').length,1);
 await webhook({field:'smb_message_echoes',value:{messages:[{id:'echo1',from:'business123',to:'customer123',type:'text',text:{body:'Yo le atiendo'}}]}});
 assert.equal(data.conversations[0].messages.filter(x=>x.delivery==='enviado_desde_whatsapp_business').length,1);
 await webhook({field:'messages',value:{messages:[{id:'incoming2',from:'customer123',type:'text',text:{body:'Gracias'}}]}});
 assert.equal(data.conversations[0].state,'humano');
 assert.equal(data.conversations[0].messages.filter(x=>x.role==='asistente').length,1);
 const id=data.conversations[0].id;
 const unauthorized=await fetch(root+'/api/conversation',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,action:'state',state:'ia'})});
 assert.equal(unauthorized.status,401);
 const authorized=await fetch(root+'/api/conversation',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer panel-secret'},body:JSON.stringify({id,action:'state',state:'ia'})});
 assert.equal(authorized.status,200);
 assert.equal(data.conversations[0].state,'ia');
});
