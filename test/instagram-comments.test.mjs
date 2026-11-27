import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createApp} from '../server.mjs';
import {Instagram} from '../lib/instagram.mjs';
import {CredentialVault} from '../lib/credential-vault.mjs';
import {InstagramComments,commentAutomation,commentPlan} from '../lib/instagram-comments.mjs';
import {metaEvents} from '../lib/security.mjs';
const businessId='11111111-1111-4111-8111-111111111111',account='17841459500184656';
const services=[{code:'diagnostico',name:'Diagnóstico de 54 puntos',public_copy:'Evaluamos los sistemas del vehículo. Indíquenos modelo y año para confirmar el alcance.',active:true,approved:true}];
const automation=()=>({...commentAutomation({enabled:true,campaigns:[{serviceCode:'diagnostico',keywords:['diagnóstico','54 puntos'],mediaIds:[],publicReply:'Le enviamos la información por privado. Revise sus DMs.'}]},services),enabledSince:new Date(Date.now()-60000).toISOString()});
const event=()=>({id:'ig-comment:17957774265038898',externalAccountId:account,contact:'123456789',text:'Quiero información del diagnóstico',mediaId:'17911111111111',channel:'instagram_comentario',threadKey:'ig-comment:17957774265038898',at:new Date().toISOString(),receivedAt:new Date().toISOString()});
const env={META_WEBHOOKS_ENABLED:'true',INSTAGRAM_ONBOARDING_ENABLED:'true',META_APP_ID:'1578184030288164',INSTAGRAM_CONFIG_ID:'1900101397728957',META_APP_SECRET:'private-test-secret',INTEGRATION_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),PUBLIC_APP_URL:'https://example.com',DASHBOARD_TOKEN:'test'};
function fixture(){
 const rows=new Map(),calls=[];
 const connection={account_id:account,config:{receiving:true,expiresAt:new Date(Date.now()+86400000).toISOString()},encrypted_credentials:new CredentialVault(env.INTEGRATION_ENCRYPTION_KEY).seal({accessToken:'secret'},'instagram:'+businessId)};
 const db={request:async(path,opt)=>{
  if(path.startsWith('vm_integrations?'))return [];
  if(path.startsWith('vm_instagram_integrations?'))return [connection];
  if(path==='vm_meta_event_receipts'){
   if(rows.has(opt.body.event_key))throw Object.assign(Error('duplicate'),{status:409});
   const row={...structuredClone(opt.body),created_at:new Date().toISOString()};rows.set(row.event_key,row);return [row];
  }
  if(path.startsWith('vm_meta_event_receipts?')){
   const q=new URLSearchParams(path.split('?')[1]),k=q.get('event_key'),b=q.get('business_id')?.slice(3);
   const found=[...rows.values()].filter(r=>(!b||r.business_id===b)&&(!k||k.startsWith('like.')?r.event_key.startsWith(k?.slice(5,-1)||''):r.event_key===k.slice(3))&&(!q.get('state')||r.state===q.get('state').slice(3)));
   if(opt){for(const r of found)Object.assign(r,structuredClone(opt.body));return found;}
   return found.slice(0,Number(q.get('limit')||100));
  }throw Error(path);
 }};
 const fetcher=async(url,opt)=>{
  calls.push({url,method:opt.method,body:opt.body?JSON.parse(opt.body):null});
  return new Response(JSON.stringify(opt.method==='GET'?{id:'17957774265038898',timestamp:new Date(Date.now()-10000).toISOString()}:url.endsWith('/replies')?{id:'17999999999999'}:{message_id:'mid.confirmed'}));
 };
 const ig=new Instagram(env,db,fetcher),comments=new InstagramComments(ig);
 return {ig,comments,db,calls,rows,connection,fetcher};
}
test('comment rules select an approved tenant service, normalize accents, scope media and hand off ambiguity',()=>{
 const config=automation(),e=event();assert.equal(commentPlan(e,config,services).serviceCode,'diagnostico');
 assert.equal(commentPlan({...e,text:'Hermoso auto'},config,services).matched,false);
 assert.equal(commentPlan({...e,text:'diagnóstico por un reclamo de garantía'},config,services).handoff,true);
 assert.equal(commentPlan({...e,live:true},config,services).matched,false);
 config.campaigns[0].mediaIds=['999999'];assert.equal(commentPlan(e,config,services).matched,false);
 const extra={...services[0],code:'otro'};config.campaigns[0].mediaIds=[];config.campaigns.push({...config.campaigns[0],serviceCode:'otro'});
 assert.equal(commentPlan(e,config,[...services,extra]).handoff,true);
 assert.throws(()=>commentAutomation({enabled:true,campaigns:[{...automation().campaigns[0],serviceCode:'foreign-service'}]},services));
 assert.equal(commentPlan(e,automation(),[{...services[0],approved:false}]).matched,false);
});
test('private reply uses comment_id, then public notice; duplicate/concurrent deliveries cannot resend',async()=>{
 const {comments,calls}=fixture(),e=event();
 const outcomes=await Promise.all([comments.run(businessId,e,automation(),services),comments.run(businessId,e,automation(),services)]);
 assert.equal(calls.filter(c=>c.method==='POST'&&c.url.endsWith('/messages')).length,1);
 assert.equal(calls.filter(c=>c.method==='POST'&&c.url.endsWith('/replies')).length,1);
 const sent=calls.filter(c=>c.method==='POST');assert.deepEqual(sent[0].body.recipient,{comment_id:'17957774265038898'});assert.equal(sent[0].body.message.text,services[0].public_copy);
 assert.ok(outcomes.some(o=>o.status==='accepted'));
 await comments.run(businessId,e,automation(),services);assert.equal(calls.filter(c=>c.method==='POST').length,2);
});
test('uncertain private sends never produce a public promise and remain blocked on redelivery',async()=>{
 const {ig,comments,calls}=fixture();ig.fetcher=async(url,opt)=>{calls.push({url,method:opt.method});if(opt.method==='POST')throw Error('timeout');return new Response(JSON.stringify({id:'17957774265038898',timestamp:new Date().toISOString()}));};
 assert.equal((await comments.run(businessId,event(),automation(),services)).status,'review');
 await comments.run(businessId,event(),automation(),services);assert.equal(calls.filter(c=>c.method==='POST').length,1);assert.ok(!calls.some(c=>c.url.endsWith('/replies')));
});
test('expired window, disconnected/wrong tenant, human takeover and pre-activation events do not send',async()=>{
 const {ig,comments,calls,connection}=fixture(),e=event();
 await comments.run(businessId,e,automation(),services,{human:true});
 await comments.run(businessId,{...e,receivedAt:new Date(Date.now()-3600000).toISOString()},automation(),services);
 connection.account_id='999999999';await comments.run(businessId,e,automation(),services);connection.account_id=account;
 ig.fetcher=async()=>new Response(JSON.stringify({id:'17957774265038898',timestamp:new Date(Date.now()-8*86400000).toISOString()}));
 assert.equal((await comments.run(businessId,e,automation(),services)).status,'review');assert.equal(calls.length,0);
});
test('public failure preserves accepted private receipt and never duplicates the private',async()=>{
 const {comments,ig,fetcher,calls}=fixture();let fail=true;ig.fetcher=async(url,opt)=>{if(url.endsWith('/replies')&&fail){fail=false;return new Response(JSON.stringify({error:{code:10}}),{status:403});}return fetcher(url,opt);};
 const first=await comments.run(businessId,event(),automation(),services);assert.equal(first.status,'review');assert.equal(first.messages.length,1);
 const second=await comments.run(businessId,event(),automation(),services);assert.equal(second.status,'review');assert.equal(calls.filter(c=>c.method==='POST').length,1);
});
test('parser captures comments without keywords/text, skips self replies and carries Meta time safely',()=>{
 const payload={entry:[{id:account,time:Math.floor(Date.now()/1000),changes:[{field:'comments',value:{id:'179123456789',text:'Hermoso auto',from:{id:'123456789'},media:{id:'999999999'}}},{field:'comments',value:{id:'179123456790',from:{id:'123456789'}}},{field:'comments',value:{id:'179123456791',text:'Le enviamos información',from:{id:account}}}]}]};
 const events=metaEvents(payload);assert.equal(events.length,2);assert.ok(events.every(e=>e.at));assert.equal(events[1].mediaType,'attachment');
 assert.doesNotThrow(()=>metaEvents({entry:[{messaging:[{sender:{id:'123'},timestamp:1e30,message:{mid:'m',text:'x'}}]}]}));
});
test('signed webhook stores all comments, executes selected pairs and deduplicates across requests',async t=>{
 const f=fixture();let state={config:{instagramCommentAutomation:automation(),services:[],business:{industry:'general'}},conversations:[],events:[],alerts:[],audit:[]};
 const store={load:async()=>structuredClone(state),save:async next=>{state=structuredClone(next);}};
 const directory={...f.db,channelBusiness:async id=>{if(id!==account)throw Object.assign(Error('unknown'),{status:409});return {id:businessId,slug:'test'};},context:business=>({business,store,catalog:{list:async()=>services}})};
 const app=await createApp(env,store,{tenantDirectory:directory,metaChannelFetcher:f.fetcher});await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));
 const root='http://127.0.0.1:'+app.address().port;
 const body=JSON.stringify({object:'instagram',entry:[{id:account,time:Math.floor(Date.now()/1000),changes:[{field:'comments',value:{id:'17957774265038898',text:'Información del diagnóstico',from:{id:'123456789'},media:{id:'999999999'}}},{field:'comments',value:{id:'17957774265038899',text:'Hermoso auto',from:{id:'234567891'},media:{id:'999999999'}}}]}]});
 const send=signature=>fetch(root+'/webhooks/meta',{method:'POST',headers:{'Content-Type':'application/json','x-hub-signature-256':signature},body});
 assert.equal((await send('sha256=invalid')).status,403);assert.equal(f.rows.size,0);
 const sign='sha256='+createHmac('sha256',env.META_APP_SECRET).update(body).digest('hex');
 assert.equal((await send(sign)).status,200);assert.equal(state.conversations.length,2);assert.equal(f.calls.filter(c=>c.method==='POST').length,2);
 assert.equal((await send(sign)).status,200);assert.equal(state.conversations.length,2);assert.equal(f.calls.filter(c=>c.method==='POST').length,2);
 assert.equal([...f.rows.values()].filter(r=>r.event_key.startsWith('ig-inbound:')&&r.state==='processed').length,2);
});
test('serverless webhook acknowledges a durable event while processing waits for Meta',async t=>{
 const f=fixture(),tasks=[];let release;const gate=new Promise(r=>release=r);let state={config:{instagramCommentAutomation:automation(),services:[],business:{industry:'general'}},conversations:[],events:[],alerts:[],audit:[]};
 const store={load:async()=>structuredClone(state),save:async next=>{state=structuredClone(next);}};
 const directory={...f.db,channelBusiness:async()=>({id:businessId,slug:'test'}),context:business=>({business,store,catalog:{list:async()=>services}})};
 const app=await createApp(env,store,{tenantDirectory:directory,metaChannelFetcher:async(...args)=>{await gate;return f.fetcher(...args);},backgroundTask:task=>tasks.push(task)});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));
 const body=JSON.stringify({object:'instagram',entry:[{id:account,time:Math.floor(Date.now()/1000),changes:[{field:'comments',value:{id:'17957774265038898',text:'diagnóstico',from:{id:'123456789'},media:{id:'999999999'}}}]}]});
 const r=await fetch('http://127.0.0.1:'+app.address().port+'/webhooks/meta',{method:'POST',headers:{'Content-Type':'application/json','x-hub-signature-256':'sha256='+createHmac('sha256',env.META_APP_SECRET).update(body).digest('hex')},body});
 assert.equal(r.status,200);assert.equal([...f.rows.values()].filter(x=>x.event_key.startsWith('ig-inbound:')).length,1);assert.equal(f.calls.length,0);
 release();await Promise.all(tasks);assert.equal(f.calls.filter(c=>c.method==='POST').length,2);
});
