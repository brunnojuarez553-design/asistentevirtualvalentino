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
