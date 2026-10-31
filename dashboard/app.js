let data,selected=null,token='',catalogServices=[],editingServiceId=null;
const $=s=>document.querySelector(s);
const labels={ia:'IA',revision:'Revisión',humano:'Humano'};
const channelLabels={simulador:'Simulador',whatsapp:'WhatsApp',instagram:'Instagram DM',instagram_comentario:'Instagram comentario'};
async function api(path,body){const r=await fetch('/api/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}
function node(tag,text,className){const e=document.createElement(tag);e.textContent=text;if(className)e.className=className;return e;}
function fail(e){$('#error').textContent=e.message;}
async function refresh(){try{const [workspace,services]=await Promise.all([api('workspace'),api('services')]);data=workspace;catalogServices=services.services;$('#error').textContent='';render();renderCatalog();}catch(e){fail(e);}}
function render(){
 $('#total').textContent=data.conversations.length;$('#reviewCount').textContent=data.conversations.filter(c=>c.state==='revision').length;$('#humanCount').textContent=data.conversations.filter(c=>c.state==='humano').length;$('#alertCount').textContent=data.alerts.filter(a=>!a.resolved).length;
 const list=$('#conversations');list.replaceChildren();const filtered=data.conversations.filter(c=>!$('#filter').value||c.state===$('#filter').value);
 if(!filtered.length)list.append(node('p','Todavía no hay conversaciones en esta vista.','muted'));
 for(const c of filtered){const b=node('button','','item'+(c.id===selected?' selected':''));b.append(node('strong',c.contact),node('span',labels[c.state],'badge '+c.state),node('small',(channelLabels[c.channel]||c.channel)+' · '+(c.messages.at(-1)?.text.slice(0,90)||'')));b.onclick=()=>{selected=c.id;render();};list.append(b);}
 const c=data.conversations.find(c=>c.id===selected);$('#contact').textContent=c?.contact||'Probemos el asistente';$('#channel').textContent=c?(channelLabels[c.channel]||c.channel)+' · Sin envíos externos':'Una consulta simulada, una respuesta segura.';const simChannel=$('#simulationChannel');if(c)simChannel.value=['whatsapp','instagram','instagram_comentario'].includes(c.channel)?c.channel:'whatsapp';simChannel.disabled=!!c;$('#state').value=c?.state||'ia';$('#state').disabled=!c;$('#reply').hidden=!c;$('#reason').textContent=c?.reason||'';
 const messages=$('#messages');messages.replaceChildren();if(!c)messages.append(node('div','Tu bandeja está lista. Escribí una consulta para probar el recorrido.','empty'));for(const m of c?.messages||[]){const el=node('article','','message '+(m.role==='cliente'?'customer':'team'));el.append(node('small',m.role==='cliente'?'CLIENTE':m.role==='equipo'?'EQUIPO · SIMULADO':'ASISTENTE · SIMULADO'),node('p',m.text));messages.append(el);}messages.scrollTop=messages.scrollHeight;$('#replyText').value=c?.draft||'';
 const alerts=$('#alerts');alerts.replaceChildren();for(const a of data.alerts.filter(a=>!a.resolved).slice(0,30)){const b=node('button',a.text,'alert');b.onclick=()=>{selected=a.conversationId;render();};alerts.append(b);}if(!alerts.children.length)alerts.append(node('p','Sin alertas pendientes.','muted'));
 const service=$('#service');const prev=service.value;service.replaceChildren(new Option('Elegir servicio aprobado',''));for(const s of data.config.services.filter(s=>s.approved===true))service.add(new Option(s.name,s.id));service.value=prev;
 $('#configJson').value=JSON.stringify({tone:data.config.tone,business:data.config.business,notice:data.config.notice},null,2);
}
$('#access').onclick=()=>{token=prompt('Clave de acceso al panel (solo si está configurada en el servidor)')||'';refresh();};
$('#new').onclick=()=>{selected=null;$('#name').value='';render();$('#text').focus();};$('#filter').onchange=render;
$('#simulate').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const c=await api('simulate',{text:$('#text').value,channel:$('#simulationChannel').value,serviceId:$('#service').value,vehicle:Object.fromEntries(['make','model','year','engine'].map(k=>[k,$('#'+k).value])),contact:$('#name').value||'Cliente de prueba',...(selected?{conversationId:selected}:{contact:$('#name').value||'Prueba '+(data.conversations.length+1)})});selected=c.id;$('#text').value='';await refresh();}catch(e){fail(e);}finally{b.disabled=false;}};
$('#state').onchange=async()=>{try{await api('conversation',{id:selected,action:'state',state:$('#state').value});await refresh();}catch(e){fail(e);}};
$('#reply').onsubmit=async e=>{e.preventDefault();try{await api('conversation',{id:selected,action:'reply',text:$('#replyText').value});await refresh();}catch(e){fail(e);}};
$('#saveConfig').onclick=async()=>{try{await api('config',JSON.parse($('#configJson').value));$('#saved').textContent='Configuración guardada.';await refresh();}catch(e){fail(e);}};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{$('#inbox').hidden=b.dataset.view!=='inbox';$('#catalog').hidden=b.dataset.view!=='catalog';$('#config').hidden=b.dataset.view!=='config';document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));});
refresh();

/* =============================================================
   CATALOGO: edición segura mediante API autenticada del servidor.
   El navegador nunca recibe credenciales de Supabase.
   ============================================================= */
const serviceFields={
  name:'svcName',category:'svcCategory',description:'svcDescription',
  inclusions:'svcInclusions',compatibility:'svcCompatibility',
  reference_price_usd:'svcPrice',image_url:'svcImage',
  public_copy:'svcPublicCopy',warranty_terms:'svcWarranty'
};
function serviceStatus(s) {
  if(!s.active)return 'Archivado';
  if(s.approved)return 'Aprobado para IA';
  return 'Pendiente de aprobación';
}
function renderCatalog(){
  if(!Array.isArray(catalogServices))return;
  const active=catalogServices.filter(s=>s.active);
  $('#catalogTotal').textContent=active.length+' servicios activos';
  $('#catalogEnabled').textContent=active.filter(s=>s.approved).length+' habilitados para IA';
  $('#catalogDraft').textContent=catalogServices.filter(s=>!s.approved&&s.active).length+' pendientes';
  const q=($('#serviceSearch').value||'').trim().toLocaleLowerCase('es');
  const list=$('#serviceCards');list.replaceChildren();
  for(const s of catalogServices.filter(s=>(s.name+' '+(s.category||'')).toLocaleLowerCase('es').includes(q))){
    const b=node('button','','catalog-entry'+(s.id===editingServiceId?' selected':''));
    b.type='button';b.setAttribute('aria-label','Editar '+s.name);
    if(s.image_url && /^https:\/\//i.test(s.image_url)){
      const thumb=document.createElement('img');thumb.src=s.image_url;thumb.loading='lazy';thumb.alt='';thumb.referrerPolicy='no-referrer';b.append(thumb);
    }else b.append(node('span','VM','catalog-placeholder'));
    const info=node('span','','catalog-entry-info');
    info.append(node('strong',s.name),node('small',s.category||'General'),node('small',serviceStatus(s),'service-state'+(s.approved?' approved':'')));
    b.append(info);
    b.onclick=()=>{openService(s);renderCatalog();};
    list.append(b);
  }
  if(!list.children.length)list.append(node('p','No hay servicios que coincidan con la búsqueda.','muted'));
}
function openService(s=null){
  editingServiceId=s?.id||null;
  $('#svcId').value=editingServiceId||'';
  $('#serviceEditorTitle').textContent=s?'Editar servicio':'Nuevo servicio';
  for(const [key,id] of Object.entries(serviceFields))$('#'+id).value=s?.[key]??'';
  $('#svcActive').checked=s?s.active===true:true;
  $('#svcTechnical').checked=s?s.needs_technical_review===true:true;
  $('#svcLegal').checked=s?.needs_legal_review===true;
  $('#svcApproved').checked=s?.approved===true;
  $('#svcArchive').hidden=!s||!s.active;
  $('#serviceFeedback').textContent='';
  if(s)$('#catalog').scrollIntoView({behavior:'smooth',block:'start'});
}
$('#addService').onclick=()=>{openService();renderCatalog();$('#svcName').focus();};
$('#serviceSearch').oninput=renderCatalog;
$('#serviceEditor').onsubmit=async e=>{
  e.preventDefault();
  const button=$('#svcSave');button.disabled=true;
  $('#serviceFeedback').textContent='Guardando servicio...';
  try{
    const payload={id:editingServiceId,...Object.fromEntries(Object.entries(serviceFields).map(([k,id])=>[k,$('#'+id).value])),
      active:$('#svcActive').checked,needs_technical_review:$('#svcTechnical').checked,
      needs_legal_review:$('#svcLegal').checked,approved:$('#svcApproved').checked};
    const result=await api('services',payload);
    editingServiceId=result.service.id;
    await refresh();
    const saved=catalogServices.find(s=>s.id===editingServiceId);
    if(saved)openService(saved);
    renderCatalog();
    $('#serviceFeedback').textContent='Servicio guardado correctamente en '+(data.mode==='simulation'?'el catálogo configurado.':'Supabase.');
  }catch(error){$('#serviceFeedback').textContent=error.message;}
  finally{button.disabled=false;}
};
$('#svcArchive').onclick=async()=>{
  if(!editingServiceId)return;
  if(!confirm('¿Archivar este servicio? No se eliminarán las conversaciones ni el historial.'))return;
  $('#svcArchive').disabled=true;
  try{
    await api('services',{action:'archive',id:editingServiceId});
    editingServiceId=null;openService();await refresh();
  }catch(error){$('#serviceFeedback').textContent=error.message;}
  finally{$('#svcArchive').disabled=false;}
};
