let data,selected=null,token='';
const $=s=>document.querySelector(s);
const labels={ia:'IA',revision:'Revisión',humano:'Humano'};
const channelLabels={simulador:'Simulador',whatsapp:'WhatsApp',instagram:'Instagram DM',instagram_comentario:'Instagram comentario'};
async function api(path,body){const r=await fetch('/api/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}
function node(tag,text,className){const e=document.createElement(tag);e.textContent=text;if(className)e.className=className;return e;}
function fail(e){$('#error').textContent=e.message;}
async function refresh(){try{data=await api('workspace');$('#error').textContent='';render();}catch(e){fail(e);}}
function render(){
 $('#total').textContent=data.conversations.length;$('#reviewCount').textContent=data.conversations.filter(c=>c.state==='revision').length;$('#humanCount').textContent=data.conversations.filter(c=>c.state==='humano').length;$('#alertCount').textContent=data.alerts.filter(a=>!a.resolved).length;
 const list=$('#conversations');list.replaceChildren();const filtered=data.conversations.filter(c=>!$('#filter').value||c.state===$('#filter').value);
 if(!filtered.length)list.append(node('p','Todavía no hay conversaciones en esta vista.','muted'));
 for(const c of filtered){const b=node('button','','item'+(c.id===selected?' selected':''));b.append(node('strong',c.contact),node('span',labels[c.state],'badge '+c.state),node('small',(channelLabels[c.channel]||c.channel)+' · '+(c.messages.at(-1)?.text.slice(0,90)||'')));b.onclick=()=>{selected=c.id;render();};list.append(b);}
 const c=data.conversations.find(c=>c.id===selected);$('#contact').textContent=c?.contact||'Probemos el asistente';$('#channel').textContent=c?(channelLabels[c.channel]||c.channel)+' · Sin envíos externos':'Una consulta simulada, una respuesta segura.';const simChannel=$('#simulationChannel');if(c)simChannel.value=['whatsapp','instagram','instagram_comentario'].includes(c.channel)?c.channel:'whatsapp';simChannel.disabled=!!c;$('#state').value=c?.state||'ia';$('#state').disabled=!c;$('#reply').hidden=!c;$('#reason').textContent=c?.reason||'';
 const messages=$('#messages');messages.replaceChildren();if(!c)messages.append(node('div','Tu bandeja está lista. Escribí una consulta para probar el recorrido.','empty'));for(const m of c?.messages||[]){const el=node('article','','message '+(m.role==='cliente'?'customer':'team'));el.append(node('small',m.role==='cliente'?'CLIENTE':m.role==='equipo'?'EQUIPO · SIMULADO':'ASISTENTE · SIMULADO'),node('p',m.text));messages.append(el);}messages.scrollTop=messages.scrollHeight;$('#replyText').value=c?.draft||'';
 const alerts=$('#alerts');alerts.replaceChildren();for(const a of data.alerts.filter(a=>!a.resolved).slice(0,30)){const b=node('button',a.text,'alert');b.onclick=()=>{selected=a.conversationId;render();};alerts.append(b);}if(!alerts.children.length)alerts.append(node('p','Sin alertas pendientes.','muted'));
 const service=$('#service');const prev=service.value;service.replaceChildren(new Option('Elegir servicio aprobado',''));for(const s of data.config.services.filter(s=>s.approved===true))service.add(new Option(s.name,s.id));service.value=prev;
 $('#configJson').value=JSON.stringify(data.config,null,2);
}
$('#access').onclick=()=>{token=prompt('Clave de acceso al panel (solo si está configurada en el servidor)')||'';refresh();};
$('#new').onclick=()=>{selected=null;$('#name').value='';render();$('#text').focus();};$('#filter').onchange=render;
$('#simulate').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const c=await api('simulate',{text:$('#text').value,channel:$('#simulationChannel').value,serviceId:$('#service').value,vehicle:Object.fromEntries(['make','model','year','engine'].map(k=>[k,$('#'+k).value])),contact:$('#name').value||'Cliente de prueba',...(selected?{conversationId:selected}:{contact:$('#name').value||'Prueba '+(data.conversations.length+1)})});selected=c.id;$('#text').value='';await refresh();}catch(e){fail(e);}finally{b.disabled=false;}};
$('#state').onchange=async()=>{try{await api('conversation',{id:selected,action:'state',state:$('#state').value});await refresh();}catch(e){fail(e);}};
$('#reply').onsubmit=async e=>{e.preventDefault();try{await api('conversation',{id:selected,action:'reply',text:$('#replyText').value});await refresh();}catch(e){fail(e);}};
$('#saveConfig').onclick=async()=>{try{await api('config',JSON.parse($('#configJson').value));$('#saved').textContent='Configuración guardada.';await refresh();}catch(e){fail(e);}};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{$('#inbox').hidden=b.dataset.view!=='inbox';$('#config').hidden=b.dataset.view!=='config';document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));});
refresh();
