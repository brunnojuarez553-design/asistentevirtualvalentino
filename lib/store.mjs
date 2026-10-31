import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
const initial=()=>({config:null,conversations:[],alerts:[],audit:[],events:[]});
export class Store {
  constructor({dir='.data',url,key}={}) {Object.assign(this,{dir,url,key});}
  async load() {
    if(this.url) {const r=await fetch(`${this.url}/rest/v1/assistant_workspace?id=eq.default&select=payload`,{headers:{apikey:this.key,Authorization:`Bearer ${this.key}`},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Storage unavailable');return (await r.json())[0]?.payload||initial();}
    try{return JSON.parse(await readFile(`${this.dir}/workspace.json`,'utf8'));}catch(e){if(e.code==='ENOENT')return initial();throw e;}
  }
  async save(data) {
    if(this.url) {const r=await fetch(`${this.url}/rest/v1/assistant_workspace?on_conflict=id`,{method:'POST',headers:{apikey:this.key,Authorization:`Bearer ${this.key}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},body:JSON.stringify({id:'default',payload:data}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Storage unavailable');return;}
    await mkdir(this.dir,{recursive:true});await writeFile(`${this.dir}/workspace.tmp`,JSON.stringify(data));await rename(`${this.dir}/workspace.tmp`,`${this.dir}/workspace.json`);
  }
}
