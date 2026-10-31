// Catalog is server-only: never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export const slugify = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90);

export function validateService(raw, previous={}) {
  if(!raw || typeof raw!=='object' || Array.isArray(raw))throw fail('Datos de servicio inválidos');
  const name=txt(raw.name,150);
  if(name.length<3)throw fail('Ingresá un nombre de servicio de al menos 3 caracteres.');
  const code=previous.code||txt(raw.code,100)||slugify(name);
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code))throw fail('Código de servicio inválido.');
  const category=txt(raw.category,80)||'General';
  const image_url=txt(raw.image_url,2048)||null;
  if(image_url && !/^https:\/\/[^\s]+$/i.test(image_url))throw fail('La imagen debe tener una URL HTTPS válida.');
  let reference_price_usd=null;
  if(raw.reference_price_usd!=='' && raw.reference_price_usd!==null && raw.reference_price_usd!==undefined) {
    const n=Number(raw.reference_price_usd);
    if(!Number.isFinite(n)||n<=0||n>99999999)throw fail('El precio orientativo debe ser un importe positivo.');
    reference_price_usd=Math.round(n*100)/100;
  }
  const approved=raw.approved===true;
  const needs_technical_review=raw.needs_technical_review!==false;
  const needs_legal_review=raw.needs_legal_review===true;
  if(approved && (needs_technical_review||needs_legal_review))throw fail('Primero debés resolver las revisiones técnica y legal antes de habilitar información para la IA.');
  return {
    code,name,category,
    description:txt(raw.description,5000)||null,
    inclusions:txt(raw.inclusions,5000)||null,
    compatibility:txt(raw.compatibility,2000)||null,
    public_copy:txt(raw.public_copy,3000)||null,
    warranty_terms:txt(raw.warranty_terms,3000)||null,
    image_url,reference_price_usd,
    needs_technical_review,needs_legal_review,approved,active:raw.active!==false,
    updated_at:new Date().toISOString()
  };
}
export function toEngineService(s) {
  return {
    id:s.code,name:s.name,description:s.description||'',category:s.category||'General',
    inclusions:s.inclusions||'',compatibility:s.compatibility||'',publicCopy:s.public_copy||'',
    warranty:s.warranty_terms||'',imageUrl:s.image_url||null,approved:s.active===true&&s.approved===true,
    active:s.active===true,referencePriceUsd:s.reference_price_usd==null?null:Number(s.reference_price_usd),
    referenceCurrency:'USD',referenceOnly:true,prices:[]
  };
}
export function fromEngineService(s) {
  return {
    id:s.id,code:s.id,name:s.name,category:s.category||'General',
    description:s.description||'',inclusions:s.inclusions||'',compatibility:s.compatibility||'',
    public_copy:s.publicCopy||'',warranty_terms:s.warranty||'',image_url:s.imageUrl||null,
    reference_price_usd:s.referencePriceUsd??null,approved:s.approved===true,
    needs_technical_review:s.needs_technical_review!==false,needs_legal_review:s.needs_legal_review===true,
    active:s.active!==false
  };
}
export class SupabaseCatalog {
  constructor({url,key,fetcher=fetch,slug='valentino-motors'}) {
    if(!url?.startsWith('https://')||!key)throw fail('Faltan credenciales privadas de Supabase',500);
    this.url=url.replace(/\/$/,'');this.key=key;this.fetcher=fetcher;this.slug=slug;this.id=null;
  }
  async request(method,resource,payload) {
    const res=await this.fetcher(this.url+'/rest/v1/'+resource,{
      method,headers:{apikey:this.key,Authorization:'Bearer '+this.key,'Content-Type':'application/json',
        ...(method!=='GET'?{Prefer:'return=representation'}:{})},
      ...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(12000)
    });
    if(!res.ok){const e=await res.text().catch(()=>'');throw fail(res.status===409?'Ya existe un servicio con ese código.':'Error al guardar el catálogo en Supabase',res.status===409?409:502);}
    return res.json();
  }
  async businessId(){
    if(this.id)return this.id;
    const business=await this.request('GET','vm_businesses?select=id&slug=eq.'+encodeURIComponent(this.slug)+'&limit=1');
    if(!business?.[0]?.id)throw fail('Negocio de Valentino no configurado en Supabase',503);
    this.id=business[0].id;return this.id;
  }
  async list() {
    const id=await this.businessId();
    return this.request('GET','vm_services?select=id,code,name,category,description,inclusions,compatibility,public_copy,warranty_terms,image_url,reference_price_usd,needs_technical_review,needs_legal_review,approved,active,created_at,updated_at&business_id=eq.'+id+'&order=name.asc');
  }
  async save(raw){
    const id=await this.businessId();
    if(raw.id && !UUID.test(raw.id))throw fail('Identificador inválido');
    let previous={};
    if(raw.id){
      const found=await this.request('GET','vm_services?select=id,code,business_id&business_id=eq.'+id+'&id=eq.'+raw.id+'&limit=1');
      if(!found.length)throw fail('No se encontró el servicio',404);
      previous=found[0];
    }
    const data=validateService(raw,previous);
    const rows=raw.id
      ?await this.request('PATCH','vm_services?id=eq.'+raw.id+'&business_id=eq.'+id+'&select=*',data)
      :await this.request('POST','vm_services?select=*',{...data,business_id:id});
    if(rows?.length!==1)throw fail('El servicio no pudo confirmarse en la base',409);
    return rows[0];
  }
  async archive(raw){
    if(!UUID.test(raw?.id||''))throw fail('Identificador inválido');
    const id=await this.businessId();
    const rows=await this.request('PATCH','vm_services?id=eq.'+raw.id+'&business_id=eq.'+id+'&select=*',
      {active:false,approved:false,updated_at:new Date().toISOString()});
    if(rows?.length!==1)throw fail('El servicio no existe',404);
    return rows[0];
  }
}
