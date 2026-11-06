export function mediaPresentation(message){
 const m=message||{};
 if(!m.mediaType)return null;
 const labels={audio:'Audio',image:'Fotografía',video:'Video',document:'Documento',sticker:'Sticker',attachment:'Archivo adjunto'};
 const type=labels[m.mediaType]||'Archivo';
 const interpreted=m.mediaAnalysisKind==='transcription'?'Transcripción automática':m.mediaAnalysisKind==='image_description'?'Descripción automática':null;
 return {type,status:interpreted?interpreted+' · requiere revisión':'Pendiente de revisión humana',hasPreview:false};
}
