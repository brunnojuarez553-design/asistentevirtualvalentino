import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NormalizedWriter} from '../lib/normalized-writer.mjs';
import {reconcileNormalized} from '../lib/normalized-reconcile.mjs';
test('reconciliation replays stable message IDs after a partial failure',async()=>{
 const seen=new Set();let calls=0;
 const writer=new NormalizedWriter({url:'https://example.supabase.co',key:'private',businessId:'7e06ba8f-2df5-41c1-8d6c-8fe471b3b6e4',
 fetcher:async(_url,opts)=>{
  calls++;if(calls===2)return {ok:false,status:503};
  const data=JSON.parse(opts.body);let inserted=0;
  for(const m of data.p_messages)if(!seen.has(m.id)){seen.add(m.id);inserted++;}
  return {ok:true,json:async()=>({inserted})};
 }});
 const conversations=[{id:'one',messages:[{id:'a',role:'cliente',text:'hola'}]},{id:'two',messages:[{id:'b',role:'cliente',text:'hola'}]}];
 await assert.rejects(reconcileNormalized(writer,conversations),/Normalized ingestion failed/);
 assert.deepEqual(await reconcileNormalized(writer,conversations),{processed:2,inserted:1});
 assert.equal(seen.size,2);
});
test('reconciliation rejects malformed workspace',async()=>{
 const writer=new NormalizedWriter({url:'https://example.supabase.co',key:'private',businessId:'7e06ba8f-2df5-41c1-8d6c-8fe471b3b6e4'});
 await assert.rejects(reconcileNormalized(writer,{}),/Invalid workspace conversations/);
});
