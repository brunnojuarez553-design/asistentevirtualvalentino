import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {MetaReview} from '../lib/meta-review.mjs';
import {createApp} from '../server.mjs';
import {PanelAuth} from '../lib/panel-auth.mjs';
const env={META_REVIEW_ENABLED:'true',META_REVIEW_TEST_ASSETS_CONFIRMED:'true',META_REVIEW_ACCESS_TOKEN:'server-only-secret',
 META_REVIEW_GRAPH_VERSION:'v25.0',META_REVIEW_WABA_ID:'123456789',META_REVIEW_PHONE_NUMBER_ID:'987654321',
 META_REVIEW_RECIPIENT:'5491112345678',META_REVIEW_OPERATOR_IDS:'operator-1'};
const template={id:'12345',name:'hello_world',language:'en_US',status:'APPROVED',category:'UTILITY',components:[{type:'BODY',text:'Hello'}]};
function graph(calls){return async(url,options)=>{
 calls.push({url,options});
 if(url.includes('/phone_numbers'))return Response.json({data:[{id:env.META_REVIEW_PHONE_NUMBER_ID}]});
 if(options.method==='POST'&&url.endsWith('/messages'))return Response.json({messages:[{id:'wamid.test'}]});
 if(options.method==='POST')return Response.json({id:'45678',status:'PENDING',category:'UTILITY'});
 return Response.json({data:[template]});
};}
test('review is disabled by default and requires allowlisted owner/admin; status masks recipient and secrets',()=>{
 const review=new MetaReview(env);
 assert.equal(new MetaReview({}).status().configured,false);
 for(const user of [null,{id:'other',role:'owner'},{id:'operator-1',role:'agent'}])assert.throws(()=>review.authorize(user),e=>e.status===403);
 review.authorize({id:'operator-1',role:'admin'});
 const status=JSON.stringify(review.status());
 assert.ok(!status.includes(env.META_REVIEW_ACCESS_TOKEN));assert.ok(!status.includes(env.META_REVIEW_RECIPIENT));
 assert.equal(review.status().connectionVerified,false);
});
test('approved template is sent only to server-configured recipient and API acceptance is not delivery',async()=>{
 const calls=[];const review=new MetaReview(env,{fetcher:graph(calls)});
 const result=await review.send({name:'hello_world',language:'en_US',confirm:true,to:'untrusted-recipient'});
 const sent=JSON.parse(calls.at(-1).options.body);
 assert.equal(sent.to,env.META_REVIEW_RECIPIENT);assert.equal(result.accepted,true);assert.equal(result.deliveryConfirmed,false);
 assert.equal(sent.type,'template');assert.ok(!calls.at(-1).url.includes(env.META_REVIEW_ACCESS_TOKEN));
});
test('review blocks unapproved templates, variable templates, mismatched WABA, and missing confirmation',async()=>{
 await assert.rejects(()=>new MetaReview(env).send({name:'hello_world',language:'en_US'}),e=>e.status===400);
 const review=new MetaReview(env,{fetcher:async url=>Response.json({data:url.includes('/phone_numbers')?[{id:env.META_REVIEW_PHONE_NUMBER_ID}]:[{...template,components:[{type:'BODY',text:'Hi {{1}}'}]}]})});
 await assert.rejects(()=>review.send({name:'hello_world',language:'en_US',confirm:true}),e=>e.status===400);
 await assert.rejects(()=>new MetaReview(env,{fetcher:async()=>Response.json({data:[]})}).connection(),e=>e.status===409);
});
test('template creation uses management endpoint, limited fields and reports pending review',async()=>{
 const calls=[];const review=new MetaReview(env,{fetcher:graph(calls)});
 const result=await review.createTemplate({name:'aws_review_demo',language:'es',text:'Recibimos su solicitud.',confirm:true});
 assert.equal(result.status,'PENDING');assert.match(calls.at(-1).url,/123456789\/message_templates$/);
 const body=JSON.parse(calls.at(-1).options.body);assert.equal(body.category,'UTILITY');assert.equal(body.components[0].type,'BODY');
 await assert.rejects(()=>review.createTemplate({name:'customer_template',language:'es',text:'Hello',confirm:true}),e=>e.status===400);
});
test('Graph failures never expose credentials or upstream private error text',async()=>{
 const review=new MetaReview(env,{fetcher:async()=>Response.json({error:{code:190,message:env.META_REVIEW_ACCESS_TOKEN}},{status:401})});
 await assert.rejects(()=>review.connection(),e=>e.status===502&&!e.message.includes(env.META_REVIEW_ACCESS_TOKEN));
});
test('review API persists intent and prevents duplicate external sends across replay',async t=>{
 const original=PanelAuth.prototype.authenticate;
 PanelAuth.prototype.authenticate=async()=>({id:'operator-1',role:'owner'});
 t.after(()=>{PanelAuth.prototype.authenticate=original;});
 let state={config:null,conversations:[],alerts:[],audit:[],events:[]};
 const store={load:async()=>structuredClone(state),save:async d=>{state=structuredClone(d);}};
 const calls=[];
 const app=await createApp({...env,AUTH_MODE:'supabase',SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'secret'},store,{metaReviewFetcher:graph(calls)});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));
 const root='http://127.0.0.1:'+app.address().port;
 assert.equal((await fetch(root+'/api/meta/review/status')).status,401);
 const body={requestId:randomUUID(),name:'hello_world',language:'en_US',confirm:true};
 const request=()=>fetch(root+'/api/meta/review/send',{method:'POST',headers:{Authorization:'Bearer authenticated-test','Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await request()).status,200);
 const replay=await request();assert.equal(replay.status,200);assert.equal((await replay.json()).replayed,true);
 assert.equal(calls.filter(c=>c.url.endsWith('/messages')).length,1);
 assert.equal(state.metaReviewOperations[0].state,'accepted');
 assert.equal((await fetch(root+'/health').then(r=>r.json())).outbound,false);
});

test('legal URLs are publicly reachable without exposing private workspace',async t=>{
 const app=await createApp({DASHBOARD_TOKEN:'private-panel'});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));
 const base='http://127.0.0.1:'+app.address().port;
 for(const path of ['/privacy','/terms','/data-deletion']){
  const r=await fetch(base+path);assert.equal(r.status,200);assert.match(await r.text(),/Austral Web Studio/);
 }
 assert.equal((await fetch(base+'/api/workspace')).status,401);
});
