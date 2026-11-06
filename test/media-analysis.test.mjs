import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeMetaMedia} from '../lib/media-analysis.mjs';
test('rejects unsafe media identifiers before network requests',async()=>{
 await assert.rejects(analyzeMetaMedia({mediaId:'https://evil.test',type:'audio',token:'x',groqKey:'x'}),{code:'invalid_media'});
});
test('transcribes private audio without exposing Meta credentials to Groq',async()=>{
 const calls=[];
 const fetcher=async(url,opts)=>{
  calls.push({url,opts});
  if(url.includes('graph.facebook.com'))return {ok:true,json:async()=>({url:'https://lookaside.facebook.com/media/123',mime_type:'audio/ogg',file_size:4})};
  if(url.includes('lookaside.facebook.com'))return {ok:true,headers:new Headers({'content-length':'4'}),body:ReadableStream.from([new Uint8Array([79,103,103,83])])};
  return {ok:true,json:async()=>({text:'Tengo una Hilux 2023'})};
 };
 const result=await analyzeMetaMedia({mediaId:'123456',type:'audio',token:'meta-private',groqKey:'groq-private',fetcher});
 assert.equal(result.text,'Tengo una Hilux 2023');
 assert.equal(result.reviewRequired,true);
 assert.ok(!calls[2].opts.headers.Authorization.includes('meta-private'));
});
test('rejects untrusted media download host',async()=>{
 const fetcher=async()=>({ok:true,json:async()=>({url:'https://evil.test/media',mime_type:'image/jpeg',file_size:4})});
 await assert.rejects(analyzeMetaMedia({mediaId:'123456',type:'image',token:'meta',visionKey:'vision',fetcher}),{code:'untrusted_media_host'});
});
