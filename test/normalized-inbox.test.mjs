import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NormalizedInbox} from '../lib/normalized-inbox.mjs';
import {createApp} from '../server.mjs';
const business='11111111-1111-4111-8111-111111111111';
const conversation='22222222-2222-4222-8222-222222222222';
const makeInbox=(requests=[])=>new NormalizedInbox({url:'https://example.supabase.co',key:'server-only',businessId:business,
 fetcher:async(url,opts)=>{requests.push({url,opts});return {ok:true,json:async()=>{
   if(url.includes('vm_conversations'))return [{id:conversation,state:'review'}];
   if(url.includes('vm_messages'))return [{id:'m1',body:'hola'}];
   if(url.includes('vm_handoffs'))return [{id:'h1',status:'pending'}];
   return [];
 }};}});
test('inbox queries are business-scoped and never expose the service key in URL',async()=>{
 const requests=[],inbox=makeInbox(requests);
 const list=await inbox.list({state:'review',limit:15});
 assert.equal(list[0].state,'review');
 const url=new URL(requests[0].url);
 assert.equal(url.searchParams.get('business_id'),'eq.'+business);
 assert.equal(url.searchParams.get('state'),'eq.review');
 assert.equal(url.searchParams.get('limit'),'15');
 assert.equal(requests[0].opts.headers.apikey,'server-only');
 assert.ok(!requests[0].url.includes('server-only'));
});
test('conversation detail validates ID and scopes lookup before reading messages',async()=>{
 const requests=[],inbox=makeInbox(requests);
 await assert.rejects(()=>inbox.detail('bad'),e=>e.status===400);
 await assert.rejects(()=>inbox.list({state:'unknown'}),e=>e.status===400);
 await assert.rejects(()=>inbox.list({limit:999}),e=>e.status===400);
 assert.equal(requests.length,0);
 const result=await inbox.detail(conversation);
 assert.equal(result.messages.length,1);
 assert.equal(result.handoffs[0].status,'pending');
 assert.equal(requests.length,3);
 assert.ok(requests[0].url.includes('business_id=eq.'));
});
test('normalized inbox endpoints stay disabled by default',async t=>{
 const store={load:async()=>({config:null,conversations:[],alerts:[],audit:[],events:[]}),save:async()=>{}};
 const app=await createApp({DASHBOARD_TOKEN:'secret'},store);
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>app.close(resolve)));
 const url='http://127.0.0.1:'+app.address().port+'/api/normalized/conversations';
 assert.equal((await fetch(url)).status,401);
 const res=await fetch(url,{headers:{Authorization:'Bearer secret'}});
 assert.equal(res.status,503);
});
