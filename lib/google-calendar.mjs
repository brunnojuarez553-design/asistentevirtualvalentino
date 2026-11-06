import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {CredentialVault} from './credential-vault.mjs';
import {UUID,fail} from './tenants.mjs';
const scopes=['https://www.googleapis.com/auth/calendar.events','https://www.googleapis.com/auth/calendar.events.freebusy'];
const digest=s=>createHash('sha256').update(s).digest('hex');
export const googleCookie='__Host-aws-google-state';
const same=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&x.length>0&&timingSafeEqual(x,y);};
export function bookingInput(raw,now=Date.now()){
 if(!UUID.test(raw?.requestId||'')||raw.confirm!==true)throw fail(400,'Confirmá la operación y su identificador');
 const summary=typeof raw.summary==='string'?raw.summary.trim():'';
 const contact=typeof raw.contact==='string'?raw.contact.trim():'';
 const validTime=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
 if(!validTime(raw.start)||!validTime(raw.end)||Date.parse(raw.start)<=now||Date.parse(raw.start)>now+366*86400000||Date.parse(raw.end)<=Date.parse(raw.start)||Date.parse(raw.end)-Date.parse(raw.start)>8*3600000||summary.length<3||summary.length>200||contact.length>250)throw fail(400,'Revisá el título y el horario. Usá una fecha futura y una duración de hasta 8 horas.');
 return {requestId:raw.requestId,summary,contact,start:new Date(raw.start).toISOString(),end:new Date(raw.end).toISOString()};
}
export class GoogleCalendar {
 constructor(env,directory,{fetcher=fetch}={}){this.env=env;this.db=directory;this.fetcher=fetcher;}
 configuration(){
  const e=this.env;let origin;
  try{const u=new URL(e.PUBLIC_APP_URL);if(u.protocol==='https:'&&u.pathname==='/'&&!u.username&&!u.password&&!u.search&&!u.hash)origin=u.origin;}catch{}
  return {enabled:e.GOOGLE_CALENDAR_ENABLED==='true',clientIdConfigured:Boolean(e.GOOGLE_CLIENT_ID),clientSecretConfigured:Boolean(e.GOOGLE_CLIENT_SECRET),encryptionConfigured:/^[A-Za-z0-9+/]{43}=$/.test(e.INTEGRATION_ENCRYPTION_KEY||''),originConfigured:Boolean(origin),origin};
 }
 ready(){const c=this.configuration();if(!c.enabled||!c.clientIdConfigured||!c.clientSecretConfigured||!c.encryptionConfigured||!c.originConfigured||!this.db)throw fail(503,'Google Calendar requiere configurar las credenciales privadas y la URL pública de la app.');return c;}
 vault(){return new CredentialVault(this.env.INTEGRATION_ENCRYPTION_KEY);}
 binding(id){return 'google_calendar:'+id;}
 async request(url,{method='GET',body,token,form}={}){
  let r;try{r=await this.fetcher(url,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':form?'application/x-www-form-urlencoded':'application/json'},...(body?{body:form?new URLSearchParams(body).toString():JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000),redirect:'error'});}catch{throw fail(502,'Google no confirmó la operación. Revisá el estado antes de repetirla.');}
  const data=r.status===204?{}:await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(fail(502,r.status===401?'Google requiere volver a conectar la cuenta.':'Google rechazó la operación. Revisá permisos y estado de la agenda.'),{upstreamStatus:r.status});
  return data;
 }
 async connection(businessId){return (await this.db.request('vm_integrations?'+new URLSearchParams({select:'encrypted_credentials,config,updated_at',business_id:'eq.'+businessId,provider:'eq.google_calendar',limit:'1'})))[0]||null;}
 async status(business){
  const c=this.configuration();const checks={...c};delete checks.origin;
  const connection=this.db?await this.connection(business.id):null;
  return {checks,configured:Object.values(checks).every(Boolean),connected:Boolean(connection),calendarId:connection?.config?.calendarId||null,timezone:business.timezone,bookingMode:'manual_confirmation',automaticBooking:false};
 }
 async start(user){
  const c=this.ready();const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
  // Expired authorization challenges contain no provider tokens and can be pruned safely.
  await this.db.request('vm_oauth_states?expires_at=lt.'+encodeURIComponent(new Date().toISOString()),{method:'DELETE'});
  await this.db.request('vm_oauth_states',{method:'POST',body:{state_hash:digest(state),business_id:user.businessId,user_id:user.id,provider:'google_calendar',verifier:this.vault().seal({verifier},this.binding(user.businessId)),expires_at:new Date(Date.now()+600000).toISOString()}});
  const params=new URLSearchParams({client_id:this.env.GOOGLE_CLIENT_ID,redirect_uri:c.origin+'/integrations/google/callback',response_type:'code',scope:scopes.join(' '),access_type:'offline',prompt:'consent',state,code_challenge: createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
  return {url:'https://accounts.google.com/o/oauth2/v2/auth?'+params,cookie:`${googleCookie}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`};
 }
 async callback(params,cookie){
  const c=this.ready(),state=params.get('state'),code=params.get('code');
  if(!state||!/^[A-Za-z0-9_-]{43}$/.test(state)||!same(state,cookie))throw fail(400,'La autorización no pertenece a esta sesión o venció.');
  const rows=await this.db.request('rpc/vm_consume_oauth_state',{method:'POST',body:{p_hash:digest(state),p_provider:'google_calendar'}});
  if(rows.length!==1)throw fail(400,'La autorización venció o ya se utilizó.');
  const row=rows[0];
  const member=await this.db.request('vm_staff?'+new URLSearchParams({select:'role',business_id:'eq.'+row.business_id,user_id:'eq.'+row.user_id,active:'eq.true',limit:'1'}));
  if(!['owner','admin'].includes(member[0]?.role))throw fail(403,'Ya no tenés permisos para conectar esta empresa.');
  if(params.get('error')||!code||code.length>3000)throw fail(400,'Google no autorizó la conexión. Volvé al panel para intentar de nuevo.');
  const {verifier}=this.vault().open(row.verifier,this.binding(row.business_id));
  const tokens=await this.request('https://oauth2.googleapis.com/token',{method:'POST',form:true,body:{client_id:this.env.GOOGLE_CLIENT_ID,client_secret:this.env.GOOGLE_CLIENT_SECRET,redirect_uri:c.origin+'/integrations/google/callback',grant_type:'authorization_code',code,code_verifier:verifier}});
  if(!tokens.refresh_token||!tokens.access_token||!scopes.every(s=>String(tokens.scope||'').split(' ').includes(s)))throw fail(400,'Google no concedió todos los permisos u offline access. Volvé a conectar autorizando ambos permisos.');
  // Reconnecting cannot silently switch a calendar that still has outstanding bookings.
  const pending=await this.db.request('vm_calendar_bookings?'+new URLSearchParams({select:'id',business_id:'eq.'+row.business_id,status:'in.(pending,confirmed,check_required)',end_at:'gte.'+new Date().toISOString(),limit:'1'}));
  if(pending.length)throw fail(409,'Hay turnos futuros. Revisalos antes de reemplazar la conexión de Google.');
  const existing=await this.connection(row.business_id);
  const payload={encrypted_credentials:this.vault().seal({refreshToken:tokens.refresh_token},this.binding(row.business_id)),config:{calendarId:'primary'},updated_at:new Date().toISOString()};
  if(existing)await this.db.request('vm_integrations?business_id=eq.'+row.business_id+'&provider=eq.google_calendar',{method:'PATCH',body:payload});
  else await this.db.request('vm_integrations',{method:'POST',body:{business_id:row.business_id,provider:'google_calendar',...payload}});
  return row.business_id;
 }
 async access(businessId){
  this.ready();const connection=await this.connection(businessId);if(!connection)throw fail(409,'Conectá Google Calendar para este negocio.');
  const {refreshToken}=this.vault().open(connection.encrypted_credentials,this.binding(businessId));
  const tokens=await this.request('https://oauth2.googleapis.com/token',{method:'POST',form:true,body:{client_id:this.env.GOOGLE_CLIENT_ID,client_secret:this.env.GOOGLE_CLIENT_SECRET,grant_type:'refresh_token',refresh_token:refreshToken}});
  if(!tokens.access_token)throw fail(502,'Google no confirmó el acceso. Volvé a conectar la cuenta.');
  return {token:tokens.access_token,calendarId:connection.config.calendarId||'primary'};
 }
 async availability(business,input,access){
  const valid=bookingInput({...input,requestId:input.requestId||'00000000-0000-4000-8000-000000000001',confirm:true,summary:'Consulta de disponibilidad'});
  const a=access||await this.access(business.id);
  const data=await this.request('https://www.googleapis.com/calendar/v3/freeBusy',{method:'POST',token:a.token,body:{timeMin:valid.start,timeMax:valid.end,timeZone:business.timezone,items:[{id:a.calendarId}]}});
  const calendar=data.calendars?.[a.calendarId];
  if(!calendar||calendar.errors?.length||!Array.isArray(calendar.busy))throw fail(502,'No se pudo comprobar la disponibilidad. No se creó ningún turno.');
  const local=await this.db.request('vm_calendar_bookings?'+new URLSearchParams({select:'start_at,end_at',business_id:'eq.'+business.id,calendar_id:'eq.'+a.calendarId,status:'in.(pending,confirmed,check_required)',start_at:'lt.'+valid.end,end_at:'gt.'+valid.start,limit:'100'}));
  return {available:calendar.busy.length===0&&local.length===0,start:valid.start,end:valid.end,timezone:business.timezone};
 }
 publicBooking(b){return {id:b.id,summary:b.summary,contact:b.contact,start:b.start_at,end:b.end_at,status:b.status,eventId:b.status==='confirmed'?b.event_id:null};}
 async list(businessId){const rows=await this.db.request('vm_calendar_bookings?'+new URLSearchParams({select:'id,summary,contact,start_at,end_at,status,event_id',business_id:'eq.'+businessId,order:'start_at.desc',limit:'100'}));return rows.map(b=>this.publicBooking(b));}
 async update(businessId,id,status){return this.db.request('vm_calendar_bookings?'+new URLSearchParams({business_id:'eq.'+businessId,id:'eq.'+id}),{method:'PATCH',body:{status,updated_at:new Date().toISOString()}});}
 async book(user,input){
  const b=bookingInput(input),business=user.business,a=await this.access(business.id);
  const fingerprint=digest(JSON.stringify({calendar:a.calendarId,...b}));
  const eventId=digest(business.id+':'+b.requestId);
  // Google is checked before reserving; the SQL reservation serializes app-side writers.
  const existing=await this.db.request('vm_calendar_bookings?'+new URLSearchParams({select:'*',business_id:'eq.'+business.id,request_id:'eq.'+b.requestId,limit:'1'}));
  if(existing.length){if(existing[0].fingerprint!==fingerprint)throw fail(409,'El identificador ya pertenece a otra operación.');return this.publicBooking(existing[0]);}
  if(!(await this.availability(business,b,a)).available)throw fail(409,'Ese horario ya está ocupado. Elegí otro.');
  const reserved=await this.db.request('rpc/vm_reserve_calendar_booking',{method:'POST',body:{p_business_id:business.id,p_request_id:b.requestId,p_fingerprint:fingerprint,p_calendar_id:a.calendarId,p_event_id:eventId,p_start:b.start,p_end:b.end,p_summary:b.summary,p_contact:b.contact,p_actor:user.id}});
  if(reserved.replayed)return this.publicBooking(reserved);
  try{
   const event=await this.request('https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(a.calendarId)+'/events?sendUpdates=none',{method:'POST',token:a.token,body:{id:eventId,summary:b.summary,description:b.contact?'Contacto: '+b.contact:undefined,start:{dateTime:b.start,timeZone:business.timezone},end:{dateTime:b.end,timeZone:business.timezone},extendedProperties:{private:{awsBusiness:business.id,awsBooking:reserved.id,fingerprint}}}});
   if(event.id!==eventId)throw fail(502,'Google no confirmó el evento esperado. Revisá el turno antes de repetirlo.');
   await this.update(business.id,reserved.id,'confirmed');return this.publicBooking({...reserved,status:'confirmed'});
  }catch(error){
   const definitive=[400,401,403,404,422,429].includes(error.upstreamStatus);
   await this.update(business.id,reserved.id,definitive?'failed':'check_required').catch(()=>{});
   throw error;
  }
 }
 async reconcile(user,id){
  if(!UUID.test(id||''))throw fail(400,'Turno inválido');
  const rows=await this.db.request('vm_calendar_bookings?'+new URLSearchParams({select:'*',business_id:'eq.'+user.businessId,id:'eq.'+id,limit:'1'}));
  if(!rows.length)throw fail(404,'No se encontró ese turno en la empresa');
  const b=rows[0],a=await this.access(user.businessId);
  const event=await this.request('https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(b.calendar_id)+'/events/'+encodeURIComponent(b.event_id),{token:a.token});
  if(event.extendedProperties?.private?.awsBusiness!==user.businessId||event.extendedProperties?.private?.awsBooking!==id||event.extendedProperties?.private?.fingerprint!==b.fingerprint)throw fail(409,'El evento no coincide con el turno registrado.');
  const status=event.status==='cancelled'?'cancelled':'confirmed';await this.update(user.businessId,id,status);return this.publicBooking({...b,status});
 }
 async disconnect(businessId){
  const future=await this.db.request('vm_calendar_bookings?'+new URLSearchParams({select:'id',business_id:'eq.'+businessId,status:'in.(pending,confirmed,check_required)',end_at:'gte.'+new Date().toISOString(),limit:'1'}));
  if(future.length)throw fail(409,'Hay turnos futuros. Revisalos antes de desconectar la agenda.');
  await this.db.request('vm_oauth_states?business_id=eq.'+businessId+'&provider=eq.google_calendar',{method:'DELETE'});
  await this.db.request('vm_integrations?business_id=eq.'+businessId+'&provider=eq.google_calendar',{method:'DELETE'});
  return {disconnected:true,notice:'La app ya no conserva el token. Podés revocar también el acceso desde tu cuenta de Google.'};
 }
}
