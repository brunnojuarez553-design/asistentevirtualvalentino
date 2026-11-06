import {test} from 'node:test';
import assert from 'node:assert/strict';
import {migrationPreflight} from '../lib/migration-preflight.mjs';
test('preflight reports counts and state without leaking customer data',()=>{
 const preview=migrationPreflight({conversations:[{id:'a',contact:'PRIVATE',state:'revision',messages:[{text:'SECRET'}]},{id:'b',state:'humano',messages:[{text:'OTHER'}]}],events:['x']});
 assert.deepEqual(preview,{conversations:2,messages:2,events:1,invalidConversations:0,duplicateConversationIds:0,reviewConversations:1,humanConversations:1,ready:true});
 assert.doesNotMatch(JSON.stringify(preview),/PRIVATE|SECRET|OTHER/);
});
test('preflight blocks duplicate and malformed legacy conversations',()=>{
 const preview=migrationPreflight({conversations:[{id:'x'},{id:'x'},{state:'ia'}]});
 assert.equal(preview.ready,false);assert.equal(preview.duplicateConversationIds,1);assert.equal(preview.invalidConversations,1);
});
