import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PanelAuth} from '../lib/panel-auth.mjs';
const makeFetcher=({confirmed=true,role='owner',valid=true}={})=>async(url,options)=>{
  const path=new URL(url).pathname;
  if(path==='/auth/v1/token')return {ok:valid,status:valid?200:400,
    json:async()=>valid?{access_token:'user-token-long-enough',expires_in:3600}:{error:'invalid_credentials'}};
  if(path==='/auth/v1/user')return {ok:valid,status:valid?200:401,json:async()=>valid?
    {id:'61eeb1f8-2ceb-4243-9be9-9d9349c6964a',email:'valentino@example.com',
      email_confirmed_at:confirmed?'2026-10-31T00:00:00Z':null}:{}};
  if(path==='/rest/v1/vm_businesses')return {ok:true,status:200,json:async()=>[{id:'business-id'}]};
  if(path==='/rest/v1/vm_staff')return {ok:true,status:200,json:async()=>role?[{business_id:'11111111-1111-4111-8111-111111111111',role,active:true,business:{id:'11111111-1111-4111-8111-111111111111',display_name:'Empresa autorizada'}}]:[]};
  throw new Error('Unexpected resource '+path);
};
const mock=options=>new PanelAuth({url:'https://example.supabase.co',publishableKey:'public-value',
  secretKey:'server-secret',fetcher:makeFetcher(options)});
test('solo usuario confirmado y miembro autorizado puede abrir panel',async()=>{
  const a=mock();
  const session=await a.signIn('valentino@example.com','temporary-password');
  assert.equal(session.user.role,'owner');
  assert.equal(session.access_token,'user-token-long-enough');
  await assert.rejects(()=>mock({role:null}).authenticate('user-token-long-enough'),e=>e.status===403);
  await assert.rejects(()=>mock({confirmed:false}).authenticate('user-token-long-enough'),e=>e.status===401);
});
test('credenciales inválidas y token insuficiente no acceden',async()=>{
  await assert.rejects(()=>mock({valid:false}).signIn('valentino@example.com','wrong'),e=>e.status===401);
  await assert.rejects(()=>mock().authenticate('short'),e=>e.status===401);
});
test('modo producción requiere autenticación individual',async()=>{
  const {createApp}=await import('../server.mjs');
  await assert.rejects(()=>createApp({NODE_ENV:'production',STORAGE:'local'}),/Production requires/);
  await assert.rejects(()=>createApp({NODE_ENV:'production',STORAGE:'supabase',
     SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fake-value'}),/Supabase Auth/);
});
test('a forged business header cannot select another business',async()=>{
 await assert.rejects(()=>mock().authenticate('user-token-long-enough','22222222-2222-4222-8222-222222222222'),e=>e.status===403);
 const user=await mock().authenticate('user-token-long-enough','11111111-1111-4111-8111-111111111111');
 assert.equal(user.businessId,'11111111-1111-4111-8111-111111111111');
});
