import {createApp} from '../server.mjs';

// Vercel compila código sin comprobar las credenciales de runtime.
// Mostrar error explícito (503), nunca un panel sin autenticación ni un 500 ambiguo.
const required=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY'];
const missing=required.filter(name=>!process.env[name]?.trim());
let handler=null;
let initializationError=false;
if(missing.length===0){
  try{
    handler=await createApp({...process.env,NODE_ENV:'production',
      AUTH_MODE:'supabase',STORAGE:'supabase',SERVERLESS:'true'});
  }catch{
    initializationError=true;
  }
}

export default async function vercelHandler(req,res){
  // El rewrite preserva la ruta original del sitio.
  const url=new URL(req.url||'/','http://localhost');
  const route=url.searchParams.get('vm_route');
  if(route){
    if(!route.startsWith('/')||route.startsWith('//')||route.length>260){
      res.writeHead(400,{'Content-Type':'application/json; charset=utf-8'});
      return res.end(JSON.stringify({error:'Ruta inválida'}));
    }
    url.searchParams.delete('vm_route');
    req.url=route+(url.searchParams.size?'?'+url.searchParams.toString():'');
  }
  if(!handler){
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
    if(req.url==='/health'||req.url==='/auth/mode'){
      res.writeHead(503,{'Content-Type':'application/json; charset=utf-8'});
      return res.end(JSON.stringify({
        ok:false,configured:false,
        error:'Falta configurar el entorno privado de Vercel',
        missing_variables:missing,initialization_error:initializationError
      }));
    }
    res.writeHead(503,{'Content-Type':'text/html; charset=utf-8'});
    return res.end(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Valentino Motors · Configuración pendiente</title></head>
    <body style="background:#090a0c;color:#fff;font:16px system-ui;display:grid;place-items:center;min-height:92vh;margin:0;padding:20px">
    <main style="width:min(100%,570px);background:#17191e;border:1px solid #3b3e46;border-radius:20px;padding:32px">
    <div style="color:#ec1725;font-weight:800;letter-spacing:.1em">VALENTINO MOTORS LG</div>
    <h1 style="font-size:28px">El panel está pendiente de configuración.</h1>
    <p style="color:#b9bdc4;line-height:1.7">El código ya está publicado, pero falta conectar de forma segura las credenciales privadas de Supabase en las variables del proyecto Vercel. El acceso permanece bloqueado hasta completarlo.</p>
    <p style="font-size:14px;color:#b9bdc4">Administrador: Vercel → Settings → Environment Variables. Luego, Redeploy.</p>
    </main></body></html>`);
  }
  return handler(req,res);
}
