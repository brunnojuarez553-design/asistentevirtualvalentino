import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MetaChannel} from '../lib/meta-channel.mjs';
import {CredentialVault} from '../lib/credential-vault.mjs';
import {metaEvents} from '../lib/security.mjs';

const env={META_WEBHOOKS_ENABLED:'true',META_GRAPH_VERSION:'v25.0',INTEGRATION_ENCRYPTION_KEY:Buffer.alloc(32,3).toString('base64'),META_REVIEW_RECIPIENT:'543518504556'};
function fixture({bizApp=true}={}){
 const row={business_id:'company-a',config:{phoneId:'55555',wabaId:'66666'},encrypted_credentials:new CredentialVault(env.INTEGRATION_ENCRYPTION_KEY).seal({accessToken:'company-a-only'},'meta:company-a')};
 const receipts=new Map(),calls=[];let channels=[];
 const directory={async request(path,options={}){
   if(path.startsWith('vm_integrations?')){if(options.method==='PATCH')Object.assign(row,options.body);return path.includes('company-b')?[]:[structuredClone(row)];}
   if(path==='vm_meta_event_receipts'){
     if(receipts.has(options.body.event_key))throw Object.assign(Error('duplicate'),{status:409});
     receipts.set(options.body.event_key,options.body);return [options.body];
   }
   if(path.startsWith('vm_meta_event_receipts?'))return [];
   if(path==='vm_channels'){channels.push(options.body);return [options.body];}
   if(path.startsWith('vm_channels?'))return channels;
   throw Error('Unexpected database request: '+path);
 }};
 const service=new MetaChannel(env,directory,async(url,options)=>{
   calls.push({url,options});
   assert.equal(options.headers.Authorization,'Bearer company-a-only');
   if(url.includes('/message_templates?'))return Response.json({data:[{name:'hello_world',status:'APPROVED',language:'en_US'}]});
   if(url.includes('?fields='))return Response.json({id:'55555',is_on_biz_app:bizApp,platform_type:'CLOUD_API'});
   if(url.endsWith('/subscribed_apps'))return Response.json({success:true});
   if(url.endsWith('/messages'))return Response.json({messages:[{id:'wamid.test'}]});
   return Response.json({request_id:'sync-request'});
 });
 return {service,row,calls,receipts};
}
test('coexistence must be verified before subscription or synchronization',async()=>{
 const {service,calls,row}=fixture({bizApp:false});
 await assert.rejects(service.prepare('company-a'),{status:409});
 assert.equal(calls.length,1);assert.equal(row.config.receivingEnabled,undefined);
 assert.ok(calls.every(x=>!x.url.includes('/register')));
});
test('prepare subscribes and requests each sync once, with tenant-bound credentials',async()=>{
 const {service,calls,row}=fixture();
 assert.equal((await service.prepare('company-a')).outbound,false);
 assert.equal(row.config.receivingEnabled,true);
 await service.prepare('company-a');
 assert.equal(calls.filter(x=>x.url.endsWith('/smb_app_data')).length,2);
 await assert.rejects(service.prepare('company-b'),{status:409});
 assert.ok(calls.every(x=>!x.url.includes('/register')));
});
test('one-shot test message requires confirmation, fixed recipient and unique request ID',async()=>{
 const {service,calls}=fixture();await service.prepare('company-a');
 const input={confirm:true,requestId:'9c7d35a5-a540-4ec8-9056-1f5563cfc6f6'};
 await assert.rejects(service.sendTest('company-a',{...input,confirm:false}),{status:400});
 assert.equal((await service.sendTest('company-a',input)).delivered,false);
 await assert.rejects(service.sendTest('company-a',input),{status:409});
 const sends=calls.filter(x=>x.url.endsWith('/messages'));assert.equal(sends.length,1);
 assert.equal(JSON.parse(sends[0].options.body).to,env.META_REVIEW_RECIPIENT);
});
test('signed webhook persistence is idempotent and records tenant without exposing tokens',async()=>{
 const {service,receipts}=fixture();
 const body={entry:[{id:'66666',changes:[{field:'history',value:{metadata:{phone_number_id:'55555'},history:[]}}]}]};
 await service.receive(body);await service.receive(body);
 assert.equal(receipts.size,1);assert.equal([...receipts.values()][0].business_id,'company-a');
 assert.ok(!JSON.stringify([...receipts.values()]).includes('company-a-only'));
});
test('official message_echoes payload pauses the right customer thread',()=>{
 const events=metaEvents({entry:[{changes:[{field:'smb_message_echoes',value:{metadata:{phone_number_id:'55555'},message_echoes:[{id:'m1',from:'1234',to_user_id:'scoped-user',text:{body:'Hola'}}]}}]}]});
 assert.equal(events[0].outboundHuman,true);assert.equal(events[0].contact,'scoped-user');
});
test('history is imported without being treated as a new customer request',()=>{
 const [event]=metaEvents({entry:[{changes:[{field:'history',value:{metadata:{phone_number_id:'55555',display_phone_number:'1234'},history:[{threads:[{id:'9876',messages:[{id:'m1',from:'9876',timestamp:'1700255121',text:{body:'Historial'}}]}]}]}}]}]});
 assert.equal(event.historical,true);assert.equal(event.outboundHuman,false);assert.equal(event.id,'wa:m1');
});
