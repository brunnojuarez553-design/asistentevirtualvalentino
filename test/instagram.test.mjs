import test from 'node:test';
import assert from 'node:assert/strict';
import {Instagram,instagramRules,defaultInstagramRules,selectInstagramEvent} from '../lib/instagram.mjs';
const user={id:'user-a',businessId:'business-a',role:'owner'};
const env={INSTAGRAM_ONBOARDING_ENABLED:'true',META_APP_ID:'1578184030288164',INSTAGRAM_CONFIG_ID:'1900101397728957',META_APP_SECRET:'private-test-secret',INTEGRATION_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),PUBLIC_APP_URL:'https://example.com'};
test('Instagram selects only configured channels, phrases and publications, with human escalation',()=>{
 const rules=instagramRules({...defaultInstagramRules(),mediaIds:['123456']});
 assert.equal(selectInstagramEvent({channel:'instagram',text:'¿Cuál es el precio?'},rules).selected,true);
 assert.equal(selectInstagramEvent({channel:'instagram',text:'Hermoso auto'},rules).selected,false);
 assert.equal(selectInstagramEvent({channel:'instagram_comentario',text:'precio',mediaId:'999999'},rules).selected,false);
 assert.equal(selectInstagramEvent({channel:'instagram_comentario',text:'precio',mediaId:'123456'},rules).selected,true);
 assert.equal(selectInstagramEvent({channel:'instagram',text:'reclamo de garantía y precio'},rules).handoff,true);
 assert.equal(selectInstagramEvent({channel:'instagram',text:'precio',mediaType:'image'},rules).handoff,true);
 assert.equal(selectInstagramEvent({channel:'instagram',text:'precio'},{...rules,messages:false}).selected,false);
 assert.equal(selectInstagramEvent({channel:'instagram',text:'precio'},{...rules,keywords:[]}).selected,false);
 assert.throws(()=>instagramRules({...rules,mode:'automatic'}));
});
test('Instagram OAuth creates single-use company-bound state and limited authorization URL',async()=>{
 const calls=[];const ig=new Instagram(env,{request:async(path,opt)=>{calls.push({path,opt});return [];}});
 const result=await ig.start(user);const url=new URL(result.url);
 assert.equal(url.origin,'https://www.facebook.com');assert.equal(url.searchParams.get('config_id'),env.INSTAGRAM_CONFIG_ID);
 assert.equal(url.searchParams.get('redirect_uri'),'https://example.com/integrations/instagram/callback');
 assert.match(result.cookie,/HttpOnly; Secure; SameSite=Lax/);assert.equal(calls[0].opt.body.business_id,user.businessId);
 assert.equal(calls[0].opt.body.verifier,'instagram-unified');assert.ok(!JSON.stringify(result).includes(env.META_APP_SECRET));
});
test('Instagram callback rejects CSRF and expired state before contacting Meta',async()=>{
 let called=false;const ig=new Instagram(env,{request:async()=>[]},async()=>{called=true;});
 const params=new URLSearchParams({state:'a'.repeat(43),code:'one-time-code'});
 await assert.rejects(ig.callback(params,'b'.repeat(43)),{status:400});
 await assert.rejects(ig.callback(params,'a'.repeat(43)),{status:400});assert.equal(called,false);
});
test('Instagram callback checks active role, account selection and encrypts token without exposure',async()=>{
 let saved;const db={request:async(path,opt)=>{
  if(path.startsWith('rpc/'))return [{verifier:'instagram-unified',business_id:user.businessId,user_id:user.id}];
  if(path.startsWith('vm_staff'))return [{role:'owner'}];
  if(path.startsWith('vm_instagram_integrations?'))return [];
  if(path==='vm_instagram_integrations'){saved=opt.body;return [saved];}throw Error(path);
 }};
 const ig=new Instagram(env,db,async url=>new Response(JSON.stringify(url.includes('oauth/access_token')?{access_token:'private-test-token',expires_in:5184000}:url.includes('assigned_instagram_accounts')?{data:[{id:'123456789',username:'workshop'}]}:{client_business_id:'456789123'}),{status:200}));
 assert.equal(await ig.callback(new URLSearchParams({state:'a'.repeat(43),code:'one-time-code'}),'a'.repeat(43)),user.businessId);
 assert.equal(saved.account_id,'123456789');assert.equal(saved.config.receiving,false);
 assert.ok(!JSON.stringify(saved).includes('private-test-token'));assert.equal(saved.config.rules.mode,'drafts');
});
test('Instagram callback rejects a removed administrator and ambiguous accounts',async()=>{
 let upstream=false;const db={request:async path=>path.startsWith('rpc/')?[{verifier:'instagram-unified',business_id:user.businessId,user_id:user.id}]:[]};
 const ig=new Instagram(env,db,async()=>{upstream=true;});await assert.rejects(ig.callback(new URLSearchParams({state:'a'.repeat(43),code:'one-time-code'}),'a'.repeat(43)),{status:403});assert.equal(upstream,false);
});
