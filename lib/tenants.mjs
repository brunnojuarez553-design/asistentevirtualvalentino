import {Store} from './store.mjs';
import {SupabaseCatalog,slugify} from './catalog.mjs';
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const fail=(status,message)=>Object.assign(Error(message),{status});
export class TenantDirectory {
 constructor(env,{fetcher=fetch}={}){this.env=env;this.fetcher=fetcher;this.url=env.SUPABASE_URL.replace(/\/$/,'');}
 async request(path,{method='GET',body}={}){
  let r;try{r=await this.fetcher(this.url+'/rest/v1/'+path,{method,headers:{apikey:this.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+this.env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json',Prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});}catch{throw fail(503,'No se pudo contactar la base de datos');}
  if(!r.ok)throw fail(r.status===409?409:503,r.status===409?'El registro ya existe o el horario se superpone.':'La operación no pudo confirmarse en la base de datos');
  return r.status===204?null:r.json();
 }
 async platformAdmin(userId){return (await this.request('vm_platform_admins?'+new URLSearchParams({select:'user_id',user_id:'eq.'+userId,active:'eq.true',limit:'1'}))).length===1;}
 async createBusiness(userId,input){
  const name=typeof input.name==='string'?input.name.trim():'';
  const slug=slugify(typeof input.slug==='string'?input.slug:name);
  if(name.length<3||name.length>140||!slug)throw fail(400,'Nombre de empresa inválido');
  const timezone=input.timezone||'America/Argentina/Buenos_Aires';
  try{new Intl.DateTimeFormat('es',{timeZone:timezone}).format();}catch{throw fail(400,'Zona horaria inválida');}
  if(!await this.platformAdmin(userId))throw fail(403,'El alta de negocios requiere un administrador de Austral');
  return this.request('rpc/vm_create_business',{method:'POST',body:{p_actor:userId,p_name:name,p_slug:slug,p_timezone:timezone}});
 }
 async channelBusiness(externalId,kind){
  if(!externalId||!/^\d{5,40}$/.test(String(externalId)))throw fail(400,'Canal inválido');
  const rows=await this.request('vm_channels?'+new URLSearchParams({select:'business:vm_businesses(id,slug,display_name,timezone,locale)',external_account_id:'eq.'+externalId,kind:'eq.'+kind,enabled:'eq.true',limit:'2'}));
  if(rows.length!==1||!rows[0].business?.id)throw fail(409,'El canal no tiene una empresa autorizada y activa');
  return rows[0].business;
 }
 context(business){
  if(!UUID.test(business?.id||''))throw fail(403,'No se pudo resolver la empresa autorizada');
  const options={url:this.env.SUPABASE_URL,key:this.env.SUPABASE_SERVICE_ROLE_KEY,businessId:business.id,fetcher:this.fetcher};
  return {business,store:new Store(options),catalog:new SupabaseCatalog(options)};
 }
}
export function businessDefaults(business,legacy){
 if(!business||business.slug==='valentino-motors')return structuredClone(legacy);
 return {tone:{name:business.display_name,greeting:'Hola, gracias por comunicarte con '+business.display_name+'.',style:'Español claro y cordial. Usar únicamente información aprobada del negocio. No inventar precios, garantías ni reservas.',examples:[]},
  business:{name:business.display_name,industry:'general',location:'',hours:'',booking:'El equipo confirma la disponibilidad y los turnos.',handoff:'Solicitudes de atención humana, reclamos y consultas que requieren evaluación.',timezone:business.timezone},services:[],notice:'Entorno de simulación; los canales se activan por separado.'};
}
