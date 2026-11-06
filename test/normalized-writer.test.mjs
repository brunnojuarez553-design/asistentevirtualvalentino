import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stableUuid,NormalizedWriter} from '../lib/normalized-writer.mjs';
test('stable ids are deterministic and scoped',()=>{
 assert.equal(stableUuid('a'),stableUuid('a'));
 assert.notEqual(stableUuid('a'),stableUuid('b'));
 assert.match(stableUuid('wa:123'),/^[0-9a-f]{8}-[0-9a-f-]{27}$/);
});
test('writer sends a bounded server-side RPC payload and preserves draft semantics',async()=>{
 const calls=[];
 const writer=new NormalizedWriter({url:'https://example.supabase.co',key:'private-key',
 businessId:'7e06ba8f-2df5-41c1-8d6c-8fe471b3b6e4',fetcher:async(url,opts)=>{
  calls.push({url,opts});return {ok:true,json:async()=>({inserted:2})};
 }});
 const conversation={id:'local-1',contact:'test',channel:'whatsapp',state:'revision',reason:'audio',messages:[
  {id:'wa:123',role:'cliente',text:'[Archivo adjunto]',mediaType:'audio'},
  {id:'answer',role:'asistente',text:'draft',at:'2026-11-06T00:00:00Z'}
 ]};
 assert.deepEqual(await writer.ingest(conversation),{inserted:2});
 await writer.ingest(conversation);
 assert.equal(calls[0].url,calls[1].url);
 const first=JSON.parse(calls[0].opts.body),second=JSON.parse(calls[1].opts.body);
 assert.deepEqual(first,second);
 assert.equal(first.p_messages[0].mediaType,'audio');
 assert.equal(calls[0].opts.headers.apikey,'private-key');
 assert.ok(!calls[0].url.includes('private-key'));
});
