// Autenticación oficial Supabase Auth y autorización de Valentino Motors LG.
// Las contraseñas solo viajan a Auth por HTTPS. No guardar jamás en repositorio, logs o workspace.
const denied=(status,message)=>Object.assign(new Error(message),{status});
export class PanelAuth {
  constructor({url,publishableKey,secretKey,fetcher=fetch,slug='valentino-motors'}={}){
    if(!url?.startsWith('https://')||!publishableKey||!secretKey)
      throw denied(500,'Configuración de Supabase Auth incompleta');
    Object.assign(this,{url:url.replace(/\/$/,''),publishableKey,secretKey,fetcher,slug});
  }
  async json(url,options){
    let res;
    try{res=await this.fetcher(url,{...options,signal:AbortSignal.timeout(12000)});}
    catch{throw denied(503,'El servicio de inicio de sesión no está disponible');}
    let body={};try{body=await res.json();}catch{}
    return {ok:res.ok,status:res.status,body};
  }
  async authenticate(accessToken){
    if(typeof accessToken!=='string'||accessToken.length<20||accessToken.length>5000)
      throw denied(401,'Iniciá sesión para continuar');
    const user=await this.json(this.url+'/auth/v1/user',{
      method:'GET',headers:{apikey:this.publishableKey,Authorization:'Bearer '+accessToken}});
    if(!user.ok||!user.body?.id||!user.body?.email_confirmed_at)
      throw denied(401,'Sesión inválida o correo sin verificar');
    const business=await this.json(this.url+'/rest/v1/vm_businesses?select=id&slug=eq.'+encodeURIComponent(this.slug)+'&limit=1',{
      headers:{apikey:this.secretKey,Authorization:'Bearer '+this.secretKey}});
    if(!business.ok||!business.body?.[0]?.id)throw denied(503,'Organización no configurada');
    const orgId=business.body[0].id;
    const roles=await this.json(this.url+'/rest/v1/vm_staff?select=role,active&business_id=eq.'+orgId+
      '&user_id=eq.'+encodeURIComponent(user.body.id)+'&active=eq.true&limit=1',{
      headers:{apikey:this.secretKey,Authorization:'Bearer '+this.secretKey}});
    if(!roles.ok)throw denied(503,'No se pudieron comprobar los permisos');
    const role=roles.body?.[0]?.role;
    if(!['owner','admin','agent'].includes(role))throw denied(403,'Tu usuario no tiene acceso al negocio configurado');
    return {id:user.body.id,email:user.body.email,role};
  }
  async signIn(email,password){
    if(typeof email!=='string'||email.length>254||!email.includes('@')||
       typeof password!=='string'||!password||password.length>256)
      throw denied(400,'Ingresá correo y contraseña válidos');
    const response=await this.json(this.url+'/auth/v1/token?grant_type=password',{
      method:'POST',headers:{apikey:this.publishableKey,'Content-Type':'application/json'},
      body:JSON.stringify({email,password})});
    if(!response.ok||!response.body?.access_token)
      throw denied(401,'Correo o contraseña incorrectos, o cuenta pendiente de activación');
    const user=await this.authenticate(response.body.access_token);
    return {access_token:response.body.access_token,expires_in:response.body.expires_in,user};
  }
}
