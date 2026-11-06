import {test} from 'node:test';
import assert from 'node:assert/strict';
import {metaEvents} from '../lib/security.mjs';
test('coexistence outgoing echo is a human takeover, not customer inbound',()=>{
 const events=metaEvents({entry:[{changes:[{field:'smb_message_echoes',value:{messages:[{id:'echo123',from:'business123',to:'customer123',type:'text',text:{body:'Buenas tardes, le atiendo personalmente'}}]}}]}]});
 assert.equal(events.length,1);
 assert.deepEqual(events[0],{id:'wa-echo:echo123',channel:'whatsapp',contact:'customer123',outboundHuman:true,text:'Buenas tardes, le atiendo personalmente'});
});
test('coexistence echo with no recipient is ignored',()=>{
 assert.equal(metaEvents({entry:[{changes:[{field:'smb_message_echoes',value:{messages:[{id:'echo',from:'business'}]}}]}]}).length,0);
});
