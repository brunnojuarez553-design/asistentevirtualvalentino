import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MetaOnboarding} from '../lib/meta-onboarding.mjs';
import {CredentialVault} from '../lib/credential-vault.mjs';

const env = {
  META_ONBOARDING_ENABLED:'true', META_APP_ID:'12345', META_SIGNUP_CONFIG_ID:'12346',
  META_GRAPH_VERSION:'v25.0', META_APP_SECRET:'test-secret',
  INTEGRATION_ENCRYPTION_KEY:Buffer.alloc(32, 8).toString('base64')
};
const user = {id:'operator',businessId:'company-a',role:'owner'};

function fixture(){
  const states = new Set();
  const saved = [];
  let exchanged = 0;
  const db = {async request(path, options){
    if(path.startsWith('vm_integrations?'))return [];
    if(path==='vm_oauth_states'){states.add(options.body.state_hash);return [];}
    if(path==='rpc/vm_consume_oauth_state')return states.delete(options.body.p_hash) ? [{}] : [];
    if(path==='vm_integrations'){saved.push(options.body);return [];}
    throw Error('Unexpected database request');
  }};
  const service = new MetaOnboarding(env,db,async url=>{
    if(url.includes('/oauth/access_token?')){exchanged++;return Response.json({access_token:'private-token'});}
    return Response.json({data:[{id:'55555',display_phone_number:'+123456789'}]});
  });
  return {service,saved,exchanges:()=>exchanged};
}

test('Meta authorization is bound to one company and consumed once',async()=>{
  const {service,saved,exchanges}=fixture();
  const {state}=await service.start(user);
  const input={state,code:'test-code',wabaId:'66666',phoneId:'55555'};
  await assert.rejects(service.finish({...user,businessId:'company-b'},input),{status:400});
  assert.equal(exchanges(),0);
  assert.deepEqual(await service.finish(user,input),{connected:true,phone:'+123456789'});
  assert.equal(saved[0].business_id,user.businessId);
  assert.equal(new CredentialVault(env.INTEGRATION_ENCRYPTION_KEY).open(saved[0].encrypted_credentials,'meta:'+user.businessId).accessToken,'private-token');
  await assert.rejects(service.finish(user,input),{status:400});
  assert.equal(exchanges(),1);
});

test('a number outside the authorized WABA is never stored',async()=>{
  const {service,saved}=fixture();
  const {state}=await service.start(user);
  await assert.rejects(service.finish(user,{state,code:'test-code',wabaId:'66666',phoneId:'77777'}),{status:403});
  assert.equal(saved.length,0);
});
