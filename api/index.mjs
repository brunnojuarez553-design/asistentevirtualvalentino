import {createApp} from '../server.mjs';

// Serverless entrypoint. No se inicia un puerto en Vercel.
// Falta configurar secretos en Vercel; fallamos de forma segura si no existen.
const handler=await createApp({...process.env,NODE_ENV:'production',AUTH_MODE:'supabase',
  STORAGE:'supabase',SERVERLESS:'true'});

export default async function vercelHandler(req,res){
  // El rewrite aporta la ruta original para evitar ambigüedades entre
  // /api/index (destino) y /api/services, /auth/login, etc.
  const original=new URL(req.url||'/','http://localhost');
  const route=original.searchParams.get('vm_route');
  if(route){
    if(!route.startsWith('/')||route.startsWith('//')||route.length>260)
      return res.status(400).json({error:'Ruta inválida'});
    original.searchParams.delete('vm_route');
    req.url=route+(original.searchParams.size?'?'+original.searchParams.toString():'');
  }
  return handler(req,res);
}
