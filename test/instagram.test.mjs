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

import {CredentialVault} from '../lib/credential-vault.mjs';
function outboundFixture(){
 const receipts=new Map(),calls=[];
 const connection={account_id:'17841459500184656',config:{receiving:true,expiresAt:new Date(Date.now()+86400000).toISOString()},encrypted_credentials:new CredentialVault(env.INTEGRATION_ENCRYPTION_KEY).seal({accessToken:'secret-token'},'instagram:'+user.businessId)};
 const db={request:async(path,opt)=>{
  if(path.startsWith('vm_instagram_integrations?'))return [connection];
  if(path==='vm_meta_event_receipts'){
   if(receipts.has(opt.body.event_key))throw Object.assign(Error('unique'),{status:409});
   receipts.set(opt.body.event_key,opt.body);return [opt.body];
  }
  if(path.startsWith('vm_meta_event_receipts?')){
   const key=new URLSearchParams(path.split('?')[1]).get('event_key').slice(3);
   if(opt){Object.assign(receipts.get(key),opt.body);return [];}
   return receipts.has(key)?[receipts.get(key)]:[];
  }throw Error(path);
 }};
 const fetcher=async(url,opt)=>{calls.push({url,body:JSON.parse(opt.body)});return new Response(JSON.stringify({message_id:'mid.confirmed',id:'17999999999999'}));};
 const ig=new Instagram(env,db,fetcher);
 const c={id:'conversation-1',channel:'instagram',instagramSource:{accountId:connection.account_id,recipientId:'123456789',inboundId:'ig:real-message',at:new Date().toISOString()}};
 return {ig,c,calls,receipts,connection};
}
test('manual reply only targets a verified tenant account and existing inbound, never simulations',async()=>{
 const {ig,c,calls,connection}=outboundFixture();
 await assert.rejects(ig.sendReply(user,{...c,instagramSource:null},'Hola'),{status:409});
 await assert.rejects(ig.sendReply({...user,role:'agent'},c,'Hola'),{status:403});
 await assert.rejects(ig.sendReply(user,c,'x'.repeat(1001)),{status:400});
 connection.account_id='999999999';await assert.rejects(ig.sendReply(user,c,'Hola'),{status:409});assert.equal(calls.length,0);
});
test('DM reply respects 24h, requires a valid inbound timestamp and claims before network',async()=>{
 const {ig,c,calls}=outboundFixture();
 for(const at of [null,'invalid',new Date(Date.now()-86400001).toISOString(),new Date(Date.now()+60000).toISOString()])await assert.rejects(ig.sendReply(user,{...c,instagramSource:{...c.instagramSource,at}},'Hola'),{status:409});
 assert.equal(calls.length,0);
 const result=await ig.sendReply(user,c,'Hola');assert.equal(result.delivery,'aceptado_por_meta');assert.equal(calls.length,1);
 assert.deepEqual(calls[0].body,{recipient:{id:c.instagramSource.recipientId},message:{text:'Hola'}});
 assert.equal((await ig.sendReply(user,c,'Otra respuesta')).externalId,result.externalId);assert.equal(calls.length,1);
});
test('concurrent clicks produce exactly one upstream request',async()=>{
 const {ig,c,calls}=outboundFixture();
 const result=await Promise.allSettled([ig.sendReply(user,c,'Hola'),ig.sendReply(user,c,'Hola')]);
 assert.equal(calls.length,1);assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
});
test('ambiguous network failures block automatic retries',async()=>{
 const {ig,c}=outboundFixture();let attempts=0;ig.fetcher=async()=>{attempts++;throw Error('timeout');};
 await assert.rejects(ig.sendReply(user,c,'Hola'),{status:502});await assert.rejects(ig.sendReply(user,c,'Hola'),{status:409});assert.equal(attempts,1);
});
test('comment reply uses only the comment target stored from a signed webhook',async()=>{
 const {ig,c,calls}=outboundFixture();c.channel='instagram_comentario';c.instagramSource.commentId='179123456789';
 await ig.sendReply(user,c,'Gracias por consultar');assert.match(calls[0].url,/179123456789\/replies$/);assert.deepEqual(calls[0].body,{message:'Gracias por consultar'});
});

import {metaEvents} from '../lib/security.mjs';
test('DM response window is derived from the Meta message timestamp, not receive time',()=>{
 const at=Date.now()-3600000;
 const [event]=metaEvents({object:'instagram',entry:[{id:'17841459500184656',messaging:[{sender:{id:'123456789'},timestamp:at,message:{mid:'real-mid',text:'Consulta'}}]}]});
 assert.equal(event.at,new Date(at).toISOString());
});

test('diagnostics query only the connected tenant assets and never return tokens or private messages',async()=>{
 const {ig,c,connection}=outboundFixture(),urls=[];
 ig.fetcher=async(url,opt)=>{urls.push(url);assert.equal(opt.method,'GET');return new Response(JSON.stringify(url.includes('fields=id,username')?{id:connection.account_id,username:'workshop'}:url.includes('/media?')?{data:[{id:'17999999999999'}]}:{data:[{id:'private-id',message:'private-message'}]}));};
 const result=await ig.diagnose(user);assert.equal(result.checks.length,4);assert.ok(result.checks.every(x=>x.status==='ok'));assert.ok(urls.every(x=>x.startsWith('https://graph.facebook.com/v27.0/')));assert.ok(urls[1].includes(connection.account_id+'/conversations'));
 assert.ok(!JSON.stringify(result).includes('secret-token'));assert.ok(!JSON.stringify(result).includes('private-message'));assert.ok(!JSON.stringify(result).includes('private-id'));
 await assert.rejects(ig.diagnose({...user,role:'agent'}),{status:403});
});
test('diagnostics expose safe Meta error codes and stop when profile cannot be verified',async()=>{
 const {ig}=outboundFixture();let requests=0;ig.fetcher=async()=>{requests++;return new Response(JSON.stringify({error:{code:10,error_subcode:123,message:'sensitive upstream detail'}}),{status:403});};
 const result=await ig.diagnose(user);assert.equal(requests,1);assert.equal(result.checks[0].status,'error');assert.equal(result.checks[0].code,10);assert.ok(!JSON.stringify(result).includes('sensitive upstream detail'));
});
test('diagnostics mark unavailable comment sample as pending, never a successful test',async()=>{
 const {ig,connection}=outboundFixture();ig.fetcher=async url=>new Response(JSON.stringify(url.includes('fields=id,username')?{id:connection.account_id}:{data:[]}));
 const result=await ig.diagnose(user);assert.equal(result.checks.at(-1).name,'Comentarios');assert.equal(result.checks.at(-1).status,'pending');
 connection.config.expiresAt='invalid';await assert.rejects(ig.diagnose(user),{status:409});
});
