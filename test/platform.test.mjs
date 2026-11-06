import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {CredentialVault} from '../lib/credential-vault.mjs';
import {businessDefaults} from '../lib/tenants.mjs';
import {bookingInput,GoogleCalendar} from '../lib/google-calendar.mjs';
const id='11111111-1111-4111-8111-111111111111';
const business={id,slug:'otro-negocio',display_name:'Otra empresa',timezone:'America/Argentina/Buenos_Aires'};
test('credentials are encrypted and bound to exactly one business',()=>{
 const vault=new CredentialVault(randomBytes(32).toString('base64'));
 const sealed=vault.seal({refreshToken:'private-test-token'},id);
 assert.ok(!sealed.includes('private-test-token'));
 assert.deepEqual(vault.open(sealed,id),{refreshToken:'private-test-token'});
 assert.throws(()=>vault.open(sealed,'another-business'));
 const parts=sealed.split('.');parts[2]=randomBytes(16).toString('base64url');
 assert.throws(()=>vault.open(parts.join('.'),id));
});
test('new businesses never inherit Valentino services or automotive identity',()=>{
 const legacy={business:{name:'Valentino'},services:[{name:'EGR'}]};
 const config=businessDefaults(business,legacy);
 assert.equal(config.business.industry,'general');assert.deepEqual(config.services,[]);
 assert.equal(config.business.name,'Otra empresa');
 assert.deepEqual(businessDefaults({...business,slug:'valentino-motors'},legacy),legacy);
});
const start=new Date(Date.now()+86400000).toISOString(),end=new Date(Date.now()+90000000).toISOString();
test('bookings require explicit confirmation, future zoned timestamps and bounded duration',()=>{
 const valid={requestId:id,confirm:true,summary:'Consulta',start,end};
 assert.equal(bookingInput(valid).start,start);
 for(const input of [{...valid,confirm:false},{...valid,requestId:'other'},{...valid,start:'2026-11-06T10:00'},{...valid,end:new Date(Date.now()+86400000+9*3600000).toISOString()}])assert.throws(()=>bookingInput(input));
});
test('missing Google settings fail closed without network calls',async()=>{
 const calendar=new GoogleCalendar({},null,{fetcher:()=>{throw Error('Must not call');}});
 await assert.rejects(()=>calendar.start({}),e=>e.status===503);
});
test('Google busy lookup errors never produce available time slots',async()=>{
 const calendar=new GoogleCalendar({}, {request:async()=>[]});
 calendar.request=async()=>({calendars:{primary:{errors:[{reason:'notFound'}]}}});
 await assert.rejects(()=>calendar.availability(business,{start,end},{token:'test',calendarId:'primary'}),e=>e.status===502);
 calendar.request=async()=>({calendars:{primary:{busy:[{start,end}]}}});
 assert.equal((await calendar.availability(business,{start,end},{token:'test',calendarId:'primary'})).available,false);
});
test('OAuth callback rejects missing cookie or mismatched state before consuming challenge',async()=>{
 let calls=0;
 const calendar=new GoogleCalendar({GOOGLE_CALENDAR_ENABLED:'true',GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test',PUBLIC_APP_URL:'https://example.com',INTEGRATION_ENCRYPTION_KEY:randomBytes(32).toString('base64')},{request:async()=>{calls++;return [];}});
 await assert.rejects(()=>calendar.callback(new URLSearchParams({state:'a'.repeat(43),code:'test'}),'b'.repeat(43)),e=>e.status===400);
 assert.equal(calls,0);
});
