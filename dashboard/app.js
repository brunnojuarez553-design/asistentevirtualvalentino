import {mediaPresentation} from './media-presentation.mjs';
let data,selected=null,token='',catalogServices=[],editingServiceId=null,authMode='token',activeView='overview',onboardingStep=0,aiStatus={enabled:false};
const $=s=>document.querySelector(s);
const labels={ia:'IA',revision:'Revisión',humano:'Humano'};
const channelLabels={simulador:'Simulador',whatsapp:'WhatsApp',instagram:'Instagram DM',instagram_comentario:'Instagram comentario'};
async function api(path,body){const r=await fetch('/api/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}
function node(tag,text,className){const e=document.createElement(tag);e.textContent=text;if(className)e.className=className;return e;}
function fail(e){$('#error').textContent=e.message;}
async function refresh(){try{const [workspace,services,ai]=await Promise.all([api('workspace'),api('services'),api('ai/status')]);data=workspace;catalogServices=services.services;aiStatus={...ai,verified:aiStatus?.verified===true&&aiStatus?.model===ai.model};$('#error').textContent='';render();renderCatalog();}catch(e){if(authMode==='supabase' && /sesión|autorizado|401|expirada/i.test(String(e.message))){token='';showLogin(true);}else fail(e);}}
function render(){
 const businessName=data.config?.business?.name||'Negocio activo';
 $('#activeBusinessName').textContent=businessName;
 $('.business-avatar').textContent=businessName.split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase();
 $('#total').textContent=data.conversations.length;$('#reviewCount').textContent=data.conversations.filter(c=>c.state==='revision').length;$('#humanCount').textContent=data.conversations.filter(c=>c.state==='humano').length;$('#alertCount').textContent=data.alerts.filter(a=>!a.resolved).length;
 const list=$('#conversations');list.replaceChildren();const filtered=data.conversations.filter(c=>!$('#filter').value||c.state===$('#filter').value);
 if(!filtered.length)list.append(node('p','Todavía no hay conversaciones en esta vista.','muted'));
 for(const c of filtered){const b=node('button','','item'+(c.id===selected?' selected':''));b.append(node('strong',c.contact),node('span',labels[c.state],'badge '+c.state),node('small',(channelLabels[c.channel]||c.channel)+' · '+(c.messages.at(-1)?.text.slice(0,90)||'')));b.onclick=()=>{selected=c.id;render();};list.append(b);}
 const c=data.conversations.find(c=>c.id===selected);renderAiStatus(!!c);$('#contact').textContent=c?.contact||'Probemos el asistente';$('#channel').textContent=c?(channelLabels[c.channel]||c.channel)+' · Sin envíos externos':'Una consulta simulada, una respuesta segura.';const simChannel=$('#simulationChannel');if(c)simChannel.value=['whatsapp','instagram','instagram_comentario'].includes(c.channel)?c.channel:'whatsapp';simChannel.disabled=!!c;$('#state').value=c?.state||'ia';$('#state').disabled=!c;$('#reply').hidden=!c;$('#reason').textContent=c?.reason||'';
 const messages=$('#messages');messages.replaceChildren();if(!c)messages.append(node('div','Tu bandeja está lista. Escribí una consulta para probar el recorrido.','empty'));for(const m of c?.messages||[]){const el=node('article','','message '+(m.role==='cliente'?'customer':'team'));el.append(node('small',m.role==='cliente'?'CLIENTE':m.role==='equipo'?'EQUIPO · SIMULADO':'ASISTENTE · SIMULADO'),node('p',m.text));const media=mediaPresentation(m);if(media)el.append(node('small',media.type+' · '+media.status,'muted'));messages.append(el);}messages.scrollTop=messages.scrollHeight;$('#replyText').value=c?.draft||'';
 const alerts=$('#alerts');alerts.replaceChildren();for(const a of data.alerts.filter(a=>!a.resolved).slice(0,30)){const b=node('button',a.text,'alert');b.onclick=()=>{selected=a.conversationId;render();};alerts.append(b);}if(!alerts.children.length)alerts.append(node('p','Sin alertas pendientes.','muted'));
 const service=$('#service');const prev=service.value;service.replaceChildren(new Option('Elegir servicio aprobado',''));for(const s of data.config.services.filter(s=>s.approved===true))service.add(new Option(s.name,s.id));service.value=prev;
 renderOverview();
 syncSettings();

}
$('#access').onclick=()=>{if(authMode==='supabase'){token='';showLogin(true);return;}token=prompt('Clave de acceso al panel (solo si está configurada en el servidor)')||'';refresh();};
$('#new').onclick=()=>{selected=null;$('#name').value='';render();$('#text').focus();};$('#filter').onchange=render;
$('#simulate').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const c=await api('simulate',{text:$('#text').value,channel:$('#simulationChannel').value,serviceId:$('#service').value,vehicle:Object.fromEntries(['make','model','year','engine'].map(k=>[k,$('#'+k).value])),contact:$('#name').value||'Cliente de prueba',...(selected?{conversationId:selected}:{contact:$('#name').value||'Prueba '+(data.conversations.length+1)})});selected=c.id;$('#text').value='';await refresh();}catch(e){fail(e);}finally{b.disabled=false;}};
$('#state').onchange=async()=>{try{await api('conversation',{id:selected,action:'state',state:$('#state').value});await refresh();}catch(e){fail(e);}};
$('#reply').onsubmit=async e=>{e.preventDefault();try{await api('conversation',{id:selected,action:'reply',text:$('#replyText').value});await refresh();}catch(e){fail(e);}};
// La configuración se guarda mediante formularios accesibles; nunca mostrando JSON técnico al cliente.
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.go)));
// Se inicia luego de registrar todas las interacciones.


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
  if(s.approved)return s.needs_technical_review||s.needs_legal_review?'Texto aprobado · revisión técnica/legal pendiente':'Texto comercial aprobado';
  return 'Pendiente de aprobación';
}
function renderCatalog(){
  if(!Array.isArray(catalogServices))return;
  const active=catalogServices.filter(s=>s.active);
  $('#catalogTotal').textContent=active.length+' servicios activos';
  $('#catalogEnabled').textContent=active.filter(s=>s.approved).length+' textos aprobados';
  $('#catalogDraft').textContent=catalogServices.filter(s=>!s.approved&&s.active).length+' pendientes';
  const q=($('#serviceSearch').value||'').trim().toLocaleLowerCase('es');
  const list=$('#serviceCards');list.replaceChildren();
  for(const s of catalogServices.filter(s=>(s.name+' '+(s.category||'')).toLocaleLowerCase('es').includes(q))){
    const b=node('button','','catalog-entry'+(s.id===editingServiceId?' selected':''));
    b.type='button';b.setAttribute('aria-label','Editar '+s.name);
    if(s.image_url && /^https:\/\//i.test(s.image_url)){
      const thumb=document.createElement('img');thumb.src=s.image_url;thumb.loading='lazy';thumb.alt='';thumb.referrerPolicy='no-referrer';b.append(thumb);
    }else {
      // Foto de perfil / logo tomado de la cabecera de valentinomotors.com.
      const placeholder=document.createElement('img');
      placeholder.src='https://res.cloudinary.com/dvvuwigmy/image/upload/w_80,h_80,c_fill,f_auto,q_70/v1779059651/IMG_6676_jbholt.jpg';
      placeholder.alt='';placeholder.loading='lazy';
      placeholder.className='catalog-placeholder official-service-placeholder';
      b.append(placeholder);
    }
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
  $('#svcFile').value='';
  const preview=$('#svcPreview');
  const image=s?.image_url||'';
  preview.hidden=!/^https:\/\//i.test(image);
  if(!preview.hidden)preview.src=image;else preview.removeAttribute('src');
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
    $('#serviceFeedback').textContent='Servicio guardado correctamente en el catálogo.';notify('Servicio guardado correctamente.');
  }catch(error){$('#serviceFeedback').textContent=error.message;}
  finally{button.disabled=false;}
};
$('#svcUpload').onclick=async()=>{
  const file=$('#svcFile').files?.[0];
  if(!file){$('#serviceFeedback').textContent='Elegí una imagen para subir.';return;}
  if(file.size>5242880){$('#serviceFeedback').textContent='La imagen debe pesar menos de 5 MB.';return;}
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)){
    $('#serviceFeedback').textContent='Solo JPG, PNG o WebP.';return;
  }
  $('#svcUpload').disabled=true;$('#serviceFeedback').textContent='Subiendo imagen...';
  try{
    const response=await fetch('/api/service-image',{
      method:'POST',headers:{'Content-Type':file.type,...(token?{Authorization:'Bearer '+token}:{})},
      body:file
    });
    const json=await response.json();
    if(!response.ok)throw Error(json.error||'No se pudo subir la imagen.');
    $('#svcImage').value=json.image_url;
    $('#svcPreview').src=json.image_url;$('#svcPreview').hidden=false;
    $('#serviceFeedback').textContent='Imagen subida. Guardá el servicio para asociarla a su ficha.';
    notify('Imagen cargada. Guardá el servicio para aplicar el cambio.');
  }catch(error){$('#serviceFeedback').textContent=error.message;}
  finally{$('#svcUpload').disabled=false;}
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


function showLogin(visible){
  document.body.classList.remove('await-auth');
  document.body.classList.toggle('login-required',visible);
  $('#loginScreen').hidden=!visible;
  if(visible){$('#loginPassword').value='';$('#loginError').textContent='';$('#loginEmail').focus();}
}
async function initPanel(){
  try{
    const response=await fetch('/auth/mode',{cache:'no-store'});
    if(!response.ok)throw Error('No se pudo comprobar el estado de autenticación');
    const mode=await response.json();
    authMode=mode.mode==='supabase'?'supabase':'token';
    if(authMode==='supabase'){
      $('#access').textContent='Cerrar sesión';
      showLogin(true);
    }else{
      showLogin(false);
      await refresh();
    }
  }catch(error){$('#loginScreen').hidden=false;document.body.classList.add('login-required');$('#loginError').textContent=error.message;}
}
$('#loginForm').onsubmit=async event=>{
  event.preventDefault();
  const submit=$('#loginSubmit');
  submit.disabled=true;
  $('#loginError').textContent='';
  try{
    const response=await fetch('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:$('#loginEmail').value.trim(),password:$('#loginPassword').value})});
    const result=await response.json();
    if(!response.ok||!result.access_token)throw Error(result.error||'No se pudo ingresar');
    token=result.access_token;
    $('#loginPassword').value='';
    showLogin(false);
    await refresh();
  }catch(error){token='';showLogin(true);$('#loginError').textContent=error.message;}
  finally{submit.disabled=false;}
};


/* Navegación, indicadores y onboarding V1 */
const views=['overview','inbox','catalog','config','onboarding','channels','metaReview'];
function showView(view){
  const v=views.includes(view)?view:'overview';activeView=v;
  views.forEach(name=>{const section=document.getElementById(name);if(section)section.hidden=name!==v;});
  document.querySelectorAll('[data-view]').forEach(b=>{
    const selected=b.dataset.view===v;
    b.classList.toggle('active',selected);
    if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
  });
  document.body.classList.remove('nav-open');
  const menu=$('#mobileMenu');if(menu)menu.setAttribute('aria-expanded','false');
  history.replaceState(null,'',location.pathname+location.search+'#'+v);
  if(v==='onboarding')updateOnboardingStep();
  if(v==='metaReview')refreshMetaReview();
  window.scrollTo({top:0,behavior:'instant'});
}
function renderOverview(){
  if(!data)return;
  const conversations=data.conversations||[];
  const services=catalogServices||[];
  $('#overviewConversations').textContent=conversations.length;
  $('#overviewPending').textContent=conversations.filter(c=>c.state==='revision'||c.state==='humano').length;
  $('#overviewServices').textContent=services.filter(s=>s.active).length;
  $('#overviewApproved').textContent=services.filter(s=>s.active&&s.approved).length;
  const recent=$('#overviewActivity');recent.replaceChildren();
  if(!conversations.length){
    const wrap=node('div','','activity-empty');
    const lead=node('strong','Todavía no hay interacciones registradas.');
    const p=node('p','Usá el simulador para probar el recorrido de consultas y derivación humana.','muted');
    const btn=node('button','Abrir simulador','ghost-btn');btn.type='button';
    btn.onclick=()=>showView('inbox');
    wrap.append(lead,p,btn);recent.append(wrap);
  }else{
    for(const c of conversations.slice(0,5)){
      const entry=node('button','','activity-item activity-action');entry.type='button';
      const left=node('span','','activity-details');
      left.append(node('strong',c.contact||'Contacto de prueba'),node('small',(channelLabels[c.channel]||c.channel||'Simulador')+' · '+(c.messages?.at(-1)?.text||'Sin mensajes').slice(0,95)));
      entry.append(left,node('span',labels[c.state]||c.state||'IA','activity-status'));
      entry.onclick=()=>{selected=c.id;showView('inbox');render();};
      recent.append(entry);
    }
  }
}
function syncSettings(){
  if(!data?.config)return;
  const t=data.config.tone||{},b=data.config.business||{};
  if(!$('#toneForm').contains(document.activeElement)){
    $('#toneGreeting').value=t.greeting||'';
    $('#toneStyle').value=t.style||'';
    $('#toneExamples').value=Array.isArray(t.examples)?t.examples.join('\n'):'';
    const verified=$('#verifiedVoiceList');
    if(verified){verified.replaceChildren();for(const phrase of (t.verifiedPhrases||[])) verified.append(node('li',phrase));}
  }
  if(!$('#onboardingForm').contains(document.activeElement)){
    $('#obName').value=b.name||'Valentino Motors LG';
    $('#obLocation').value=b.location||'';
    $('#obHours').value=b.hours||'';
    $('#obBooking').value=b.booking||'Valentino confirma cada solicitud de turno personalmente.';
    $('#obHandoff').value=b.humanHandoff||'';
  }
}
$('#toneForm').onsubmit=async e=>{
  e.preventDefault();const btn=e.submitter;btn.disabled=true;
  const feedback=$('#toneSaved');feedback.textContent='Guardando configuración...';
  try{
    const tone={...data.config.tone,greeting:$('#toneGreeting').value.trim(),style:$('#toneStyle').value.trim(),
      examples:$('#toneExamples').value.split(/\r?\n/).map(t=>t.trim()).filter(Boolean).slice(0,30)};
    if(!tone.greeting||!tone.style)throw Error('Completá el saludo y el estilo de comunicación.');
    await api('config',{tone,business:data.config.business,notice:data.config.notice});
    await refresh();feedback.textContent='Configuración guardada correctamente.';notify('La personalidad de la IA se guardó correctamente.');
  }catch(error){feedback.textContent=error.message;}finally{btn.disabled=false;}
};
function updateOnboardingStep(){
  document.querySelectorAll('.onboarding-step').forEach(e=>e.hidden=Number(e.dataset.step)!==onboardingStep);
  $('#onboardingStepLabel').textContent='PASO 0'+(onboardingStep+1)+' / 03';
  $('#onboardingProgressText').textContent=Math.round((onboardingStep+1)/3*100)+' % completado';
  $('#onboardingProgress').style.width=((onboardingStep+1)/3*100)+'%';
  $('#obBack').hidden=onboardingStep===0;
  $('#obNext').hidden=onboardingStep===2;
  $('#obSave').hidden=onboardingStep!==2;
  $('#obFeedback').textContent='';
  if(onboardingStep===2){
    const lines=$('#onboardingReview');lines.replaceChildren();
    for(const [label,id] of [
      ['NOMBRE COMERCIAL','obName'],['UBICACIÓN','obLocation'],['HORARIOS','obHours'],
      ['TURNOS','obBooking'],['DERIVACIÓN A HUMANO','obHandoff']
    ]){
      const box=node('div','');box.append(node('strong',label),node('span',$('#'+id).value||'Pendiente de completar'));lines.append(box);
    }
  }
}
$('#obNext').onclick=()=>{
  const step=document.querySelector('.onboarding-step[data-step="'+onboardingStep+'"]');
  const fields=[...step.querySelectorAll('input,textarea')];
  const invalid=fields.find(f=>!f.checkValidity());
  if(invalid){invalid.reportValidity();return;}
  onboardingStep=Math.min(2,onboardingStep+1);updateOnboardingStep();
};
$('#obBack').onclick=()=>{onboardingStep=Math.max(0,onboardingStep-1);updateOnboardingStep();};
$('#onboardingForm').onsubmit=async e=>{
  e.preventDefault();if(onboardingStep!==2)return;
  const button=$('#obSave');button.disabled=true;
  const feedback=$('#obFeedback');feedback.textContent='Guardando datos del taller...';
  try{
    const business={...data.config.business,name:$('#obName').value.trim(),location:$('#obLocation').value.trim(),
      hours:$('#obHours').value.trim(),booking:$('#obBooking').value.trim(),
      humanHandoff:$('#obHandoff').value.trim()};
    if(Object.values(business).some(value=>typeof value==='string'&&!value.trim()))
      throw Error('Completá todos los datos del relevamiento.');
    await api('config',{tone:data.config.tone,business,notice:data.config.notice});
    await refresh();feedback.textContent='Datos del taller guardados correctamente.';notify('Datos del taller actualizados correctamente.');
  }catch(error){feedback.textContent=error.message;}finally{button.disabled=false;}
};
$('#overviewSimulate').onclick=()=>{selected=null;showView('inbox');render();$('#text').focus();};
$('#overviewAll').onclick=()=>showView('inbox');
$('#mobileMenu').onclick=()=>{
  const open=document.body.classList.toggle('nav-open');
  $('#mobileMenu').setAttribute('aria-expanded',String(open));
};
$('#togglePassword').onclick=()=>{
  const input=$('#loginPassword');const visible=input.type==='password';
  input.type=visible?'text':'password';
  $('#togglePassword').textContent=visible?'Ocultar':'Ver';
  $('#togglePassword').setAttribute('aria-label',visible?'Ocultar contraseña':'Mostrar contraseña');
};
showView(views.includes(location.hash.slice(1))?location.hash.slice(1):'overview');

/* Feedback coherente con el design system. */
let toastTimeout;
function notify(message,type='success'){
  const el=$('#appToast');if(!el)return;
  el.textContent=message;
  el.dataset.type=type;
  el.hidden=false;
  if(toastTimeout)clearTimeout(toastTimeout);
  toastTimeout=setTimeout(()=>{el.hidden=true;},3700);
}


/* Estado de Groq seguro: nunca revela API keys al navegador. */
function renderAiStatus(hasConversation){
  const configured=aiStatus?.enabled===true;
  const verified=configured&&aiStatus?.verified===true;
  const status=$('#groqStatus'),help=$('#groqHelp'),settings=$('#groqSettingsStatus'),btn=$('#regenerateDraft');
  const model=aiStatus?.model||'modelo sin definir';
  status.textContent=!configured?'Groq no configurado':verified?'Groq conectado y verificado · '+model:'Groq configurado (sin comprobar) · '+model;
  const migrated=aiStatus?.migratedModel===true?' Se sustituyó automáticamente un modelo retirado.':'';
  help.textContent=!configured?'Configurá tu API key desde Vercel para probar respuestas.':
    verified?'Conexión comprobada. Las pruebas NO se envían a WhatsApp ni Instagram.':
    'Usá «Probar conexión» para comprobar que Groq realmente responde.'+migrated;
  settings.textContent=!configured?'Motor inactivo. Configurá AI_ENABLED, AI_PROVIDER, GROQ_MODEL y GROQ_API_KEY en Vercel.':
    verified?'Groq verificado con '+model+'. Respuestas de prueba listas.':
    'Variables detectadas. Todavía no se verificó la API. Modelo efectivo: '+model+'.'+migrated;
  $('#groqDot').classList.toggle('on',verified);
  btn.disabled=!configured||!hasConversation;
  btn.title=!configured?'Primero configurá Groq en Vercel.':
    !hasConversation?'Seleccioná una conversación para crear el borrador.':'Redactar sin enviar mensajes.';
  $('#checkGroq').disabled=!configured;
}
$('#checkGroq').onclick=async()=>{
  if(!aiStatus?.enabled)return;
  const btn=$('#checkGroq');btn.disabled=true;btn.textContent='Verificando…';
  try{
    const result=await api('ai/check',{});
    aiStatus.verified=result.ok===true;
    renderAiStatus(!!data?.conversations?.some(c=>c.id===selected));
    if(result.ok)notify('Conexión con Groq verificada. Modelo: '+result.model+'.');
    else{
      const message=result.message||'No se pudo verificar Groq.';
      $('#groqHelp').textContent=message;
      $('#groqSettingsStatus').textContent=message;
      notify(message,'error');
    }
  }catch(error){
    aiStatus.verified=false;renderAiStatus(!!selected);
    $('#groqHelp').textContent=error.message;
    notify(error.message,'error');
  }finally{
    btn.textContent='Probar conexión';
    btn.disabled=!aiStatus?.enabled;
  }
};
$('#regenerateDraft').onclick=async()=>{
  if(!selected || !aiStatus?.enabled)return;
  const btn=$('#regenerateDraft');btn.disabled=true;
  btn.textContent='Redactando…';
  try{
    const result=await api('ai/draft',{id:selected});
    $('#replyText').value=result.draft||'';
    await refresh();
    if(typeof notify==='function')notify('Borrador de Groq listo para revisión.');
  }catch(error){fail(error);if(typeof notify==='function')notify(error.message,'error');}
  finally{btn.textContent='Redactar borrador con Groq';btn.disabled=!aiStatus?.enabled||!selected;}
};


// App Review is separate from simulation and only available to approved operators.
const metaCheckLabels={enabled:'Pruebas manuales habilitadas',testAssetsConfirmed:'Activos de prueba confirmados',tokenConfigured:'Token privado configurado',versionConfigured:'Versión de Graph configurada',wabaConfigured:'WABA de prueba configurada',phoneConfigured:'Número de prueba configurado',recipientConfigured:'Destinatario autorizado configurado',operatorsConfigured:'Operadores autorizados configurados'};
let reviewTemplates=[];
function reviewBusy(busy){for(const id of ['metaReviewConnect','metaReviewLoadTemplates','metaReviewSendButton','metaReviewCreateButton'])$('#'+id).disabled=busy;}
async function refreshMetaReview(){
 reviewBusy(true);
 try{
  const status=await api('meta/review/status');
  $('#metaReviewStatus').textContent=status.configured?'Configuración completa. Comprobá la conexión real antes de grabar.':'Falta configuración privada. No se habilitaron las operaciones.';
  $('#metaReviewChecks').replaceChildren(...Object.entries(status.checks).map(([key,ok])=>node('li',(ok?'✓ ':'Pendiente: ')+(metaCheckLabels[key]||key))));
  $('#metaReviewRecipient').textContent=status.recipient||'Sin configurar';
  reviewBusy(!status.configured);
 }catch(e){$('#metaReviewStatus').textContent=e.message;}
}
$('#metaReviewRefresh').onclick=refreshMetaReview;
$('#metaReviewConnect').onclick=async e=>{e.target.disabled=true;try{await api('meta/review/connection',{});$('#metaReviewConnection').textContent='Conexión verificada: el número pertenece a la WABA de prueba. Falta demostrar envío y recepción.';}catch(e){$('#metaReviewConnection').textContent=e.message;}finally{e.target.disabled=false;}};
$('#metaReviewLoadTemplates').onclick=async e=>{e.target.disabled=true;try{
 const d=await api('meta/review/templates');reviewTemplates=d.templates.filter(t=>t.sendable);
 const select=$('#metaReviewTemplate');select.replaceChildren(new Option('Seleccioná una plantilla',''));
 reviewTemplates.forEach((t,i)=>select.add(new Option(t.name+' · '+t.language,String(i))));
 $('#metaReviewSendResult').textContent=reviewTemplates.length?'Plantillas aprobadas consultadas en Meta.'+(d.hasMore?' Se muestran los primeros 100 resultados.':''):'No hay plantillas aprobadas de texto sin variables en los primeros 100 resultados.';
 }catch(e){$('#metaReviewSendResult').textContent=e.message;}finally{e.target.disabled=false;}};
async function reviewSubmit(event,action,payload,resultId){
 event.preventDefault();const button=event.submitter;button.disabled=true;
 try{
  const result=await api('meta/review/'+action,{...payload,confirm:true,requestId:crypto.randomUUID()});
  $('#'+resultId).textContent=result.message+' '+(result.messageId?'ID de mensaje: '+result.messageId:'ID de plantilla: '+result.id+' · Estado: '+result.status);
 }catch(e){$('#'+resultId).textContent=e.message+' No reintentes sin verificar antes el resultado en Meta o WhatsApp.';}
 finally{button.disabled=false;}
}
$('#metaReviewSend').onsubmit=async e=>{
 const template=reviewTemplates[Number($('#metaReviewTemplate').value)];
 if(!template||$('#metaReviewTemplate').value===''){e.preventDefault();return;}
 await reviewSubmit(e,'send',{name:template.name,language:template.language},'metaReviewSendResult');
};
$('#metaReviewCreate').onsubmit=e=>reviewSubmit(e,'template',{name:$('#metaReviewName').value,language:$('#metaReviewLanguage').value,text:$('#metaReviewBody').value},'metaReviewCreateResult');

initPanel();
