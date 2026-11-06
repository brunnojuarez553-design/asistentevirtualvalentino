import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../lib/store.mjs';
import {createApp} from '../server.mjs';
import http from 'node:http';

test('Supabase CAS rejects stale snapshots without overwriting newer writes',async()=>{
 let row={version:0,payload:{config:null,conversations:[],alerts:[],audit:[],events:[]}};
 const fetcher=async(url,options)=>{
   if(url.includes('/rpc/')){
     const body=JSON.parse(options.body);
     if(body.expected_version!==row.version)return {ok:true,json:async()=>false};
     row={version:row.version+1,payload:structuredClone(body.new_payload)};
     return {ok:true,json:async()=>true};
   }
   return {ok:true,json:async()=>[structuredClone(row)]};
 };
 const store=new Store({url:'https://example.supabase.co',key:'server-only',fetcher});
 const a=await store.loadSnapshot(),b=await store.loadSnapshot();
 a.data.events.push('a');
 assert.equal(await store.saveConditional(a.data,a.version),true);
 b.data.events.push('b');
 assert.equal(await store.saveConditional(b.data,b.version),false);
 assert.deepEqual((await store.load()).events,['a']);
});

test('separate app instances retry conflicting writes instead of losing messages',async t=>{
 let state={config:null,conversations:[],alerts:[],audit:[],events:[]},version=0;
 const makeStore=()=>({
   loadSnapshot:async()=>({data:structuredClone(state),version}),
   saveConditional:async(data,expected)=>{
     await new Promise(resolve=>setTimeout(resolve,2));
     if(expected!==version)return false;
     state=structuredClone(data);version++;return true;
   }
 });
 const apps=await Promise.all([createApp({DASHBOARD_TOKEN:'secret'},makeStore()),createApp({DASHBOARD_TOKEN:'secret'},makeStore())]);
 await Promise.all(apps.map(app=>new Promise(resolve=>app.listen(0,'127.0.0.1',resolve))));
 t.after(()=>Promise.all(apps.map(app=>new Promise(resolve=>app.close(resolve)))));
 const send=async(app,id)=>{
   const response=await fetch('http://127.0.0.1:'+app.address().port+'/api/simulate',{
     method:'POST',headers:{Authorization:'Bearer secret','Content-Type':'application/json'},
     body:JSON.stringify({id,text:'Hola, quisiera consultar',contact:'Contacto '+id})});
   assert.equal(response.status,200);
 };
 await Promise.all([send(apps[0],'first'),send(apps[1],'second')]);
 assert.equal(state.conversations.length,2);
 assert.equal(state.events.length,2);
 assert.equal(new Set(state.events).size,2);
});
