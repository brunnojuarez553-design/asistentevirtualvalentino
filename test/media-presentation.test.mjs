import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mediaPresentation} from '../dashboard/media-presentation.mjs';
test('audio transcript remains explicitly subject to review',()=>{
 assert.deepEqual(mediaPresentation({mediaType:'audio',mediaAnalysisKind:'transcription'}),{type:'Audio',status:'Transcripción automática · requiere revisión',hasPreview:false});
});
test('unprocessed photo is not presented as analyzed or available to preview',()=>{
 assert.deepEqual(mediaPresentation({mediaType:'image'}),{type:'Fotografía',status:'Pendiente de revisión humana',hasPreview:false});
 assert.equal(mediaPresentation({text:'Hola'}),null);
});
