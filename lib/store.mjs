import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
const initial=()=>({config:null,conversations:[],alerts:[],audit:[],events:[]});
export class Store {
  constructor({dir='.data',url,key,fetcher=fetch,businessId}={}) {
    if(businessId&&!/^[0-9a-f-]{36}$/i.test(businessId))throw Error('Invalid business ID');
    Object.assign(this,{dir,url,key,fetcher,businessId});}
  headers(){return {apikey:this.key,Authorization:`Bearer ${this.key}`};}
  async loadSnapshot() {
    if(this.url){
      const r=await this.fetcher(`${this.url}/rest/v1/assistant_workspace?${this.businessId?'business_id=eq.'+this.businessId:'id=eq.default'}&select=payload,version`,{
        headers:this.headers(),signal:AbortSignal.timeout(10000)});
      if(!r.ok)throw Error('Storage unavailable');
      const row=(await r.json())[0];
      return {data:row?.payload||initial(),version:row?.version??0};
    }
    return {data:await this.loadLocal(),version:null};
  }
  async loadLocal(){
    try{return JSON.parse(await readFile(`${this.dir}/workspace.json`,'utf8'));}
    catch(e){if(e.code==='ENOENT')return initial();throw e;}
  }
  async load(){return (await this.loadSnapshot()).data;}
  async saveConditional(data,version){
    if(!this.url){await this.saveLocal(data);return true;}
    if(!Number.isSafeInteger(version)||version<0)throw Error('Workspace version missing');
    const r=await this.fetcher(`${this.url}/rest/v1/rpc/${this.businessId?'vm_tenant_workspace_compare_and_swap':'vm_workspace_compare_and_swap'}`,{
      method:'POST',headers:{...this.headers(),'Content-Type':'application/json'},
      body:JSON.stringify({...(this.businessId?{p_business_id:this.businessId}:{}),expected_version:version,new_payload:data}),signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw Error('Atomic workspace storage unavailable: apply db/workspace_concurrency.sql');
    return (await r.json())===true;
  }
  async saveLocal(data){
    await mkdir(this.dir,{recursive:true});
    await writeFile(`${this.dir}/workspace.tmp`,JSON.stringify(data));
    await rename(`${this.dir}/workspace.tmp`,`${this.dir}/workspace.json`);
  }
  async save(data){
    if(!this.url)return this.saveLocal(data);
    // Legacy callers may not overwrite Supabase data without a known version.
    throw Error('Use saveConditional() for Supabase workspace writes');
  }
}
