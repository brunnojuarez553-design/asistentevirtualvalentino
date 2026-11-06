// Preserve previously shared panel links while reserving / for the public home.
const panelViews=new Set(['overview','inbox','catalog','config','onboarding','channels','metaReview']);
if(panelViews.has(location.hash.slice(1)))location.replace('/dashboard'+location.hash);
const scenarios={
 consulta:{question:'Hola, ¿qué incluye el servicio de diagnóstico?',context:'Consulta la información aprobada del negocio',answer:'Incluye la revisión de los sistemas electrónicos y un informe de los resultados. El alcance y el presupuesto se confirman después de evaluar tu vehículo.',result:'Consulta organizada',detail:'Respuesta basada en el contenido del negocio.'},
 turno:{question:'Quiero llevar el auto mañana. ¿Me reservan un turno?',context:'Identifica una solicitud que necesita confirmación',answer:'Tomamos tu solicitud y la derivamos al equipo. Una persona revisa la disponibilidad y confirma el día y el horario. Esta consulta no reserva un turno automáticamente.',result:'Pendiente de confirmación humana',detail:'La solicitud se deriva; no se confirma una cita automáticamente.'},
 humano:{question:'Necesito hablar con alguien sobre un trabajo que me hicieron.',context:'Prioriza la intervención de una persona',answer:'Entiendo. Derivamos tu consulta al equipo para que pueda revisar el caso y continuar la atención personalmente.',result:'Atención humana',detail:'La conversación queda señalada para el equipo.'}
};
document.querySelectorAll('[data-scenario]').forEach(button=>button.addEventListener('click',()=>{
 const scenario=scenarios[button.dataset.scenario];
 document.querySelectorAll('[data-scenario]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
 for(const field of ['question','context','answer','result','detail'])document.getElementById('demo-'+field).textContent=scenario[field];
}));

// Progressive enhancement: content remains readable if JS, observer or motion is unavailable.
(function setupScrollReveal(){
 const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
 if(preference.matches || !('IntersectionObserver' in window))return;
 const targets=[...document.querySelectorAll('.principle-strip span, .section-title, .steps article, .feature, .control-copy, .control-list article, .readiness, .faq-list details, .cta')];
 let observer;
 const show=element=>{element.classList.add('reveal-visible');element.classList.remove('reveal-pending');};
 const showAll=()=>{observer?.disconnect();targets.forEach(show);};
 try{
  observer=new IntersectionObserver(entries=>{
   for(const entry of entries){
    if(!entry.isIntersecting)continue;
    show(entry.target);observer.unobserve(entry.target);
   }
  },{threshold:0,rootMargin:'0px 0px -28px 0px'});
  for(const element of targets){
   // Items already on screen never disappear during initialization or history restoration.
   if(element.getBoundingClientRect().top<window.innerHeight-28)continue;
   element.classList.add('scroll-reveal','reveal-pending');
   if(element.matches('.steps article, .feature, .control-list article, .faq-list details')){
    const siblings=[...element.parentElement.children];
    element.dataset.revealOrder=String(siblings.indexOf(element)%3);
   }
   observer.observe(element);
  }
  // Keyboard navigation and fragment links must never leave their destination hidden.
  document.addEventListener('focusin',event=>{
   const target=event.target.closest('.reveal-pending');if(target){show(target);observer.unobserve(target);}
  });
  window.addEventListener('hashchange',()=>{
   const id=location.hash.slice(1);const target=document.getElementById(id);
   if(!target)return;
   for(const element of targets)if(element===target||target.contains(element)){show(element);observer.unobserve(element);}
  });
  window.addEventListener('pageshow',event=>{if(event.persisted)showAll();});
  preference.addEventListener('change',event=>{if(event.matches)showAll();});
 }catch{showAll();}
})();

(function setupAtmosphere(){
 const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
 const header=document.querySelector('.topbar');
 let scrollFrame=0;
 const updateHeader=()=>{header?.classList.toggle('is-scrolled',window.scrollY>24);scrollFrame=0;};
 window.addEventListener('scroll',()=>{if(!scrollFrame)scrollFrame=requestAnimationFrame(updateHeader);},{passive:true});
 updateHeader();
 if(!preference.matches && 'IntersectionObserver' in window){
  const observer=new IntersectionObserver(entries=>{
   for(const entry of entries)entry.target.classList.toggle('fx-active',entry.isIntersecting);
  },{threshold:0});
  document.querySelectorAll('.ambient-scene,.product-preview').forEach(element=>observer.observe(element));
  preference.addEventListener('change',event=>{if(event.matches){observer.disconnect();document.querySelectorAll('.fx-active').forEach(element=>element.classList.remove('fx-active'));}});
 }
 if(preference.matches || !window.matchMedia('(hover: hover) and (pointer: fine)').matches)return;
 document.querySelectorAll('.feature,.product-preview').forEach(card=>{
  let frame=0;
  const reset=()=>{if(frame)cancelAnimationFrame(frame);frame=0;card.style.removeProperty('--spot-x');card.style.removeProperty('--spot-y');};
  card.addEventListener('pointermove',event=>{
   if(preference.matches)return;
   if(frame)cancelAnimationFrame(frame);
   const {clientX,clientY}=event;
   frame=requestAnimationFrame(()=>{
    const rect=card.getBoundingClientRect();
    card.style.setProperty('--spot-x',`${clientX-rect.left}px`);
    card.style.setProperty('--spot-y',`${clientY-rect.top}px`);
    frame=0;
   });
  });
  card.addEventListener('pointerleave',reset);
  preference.addEventListener('change',event=>{if(event.matches)reset();});
 });
})();
