import {test} from 'node:test';
import assert from 'node:assert/strict';
import {default as app} from '../api/index.mjs';

// No enviar secretos reales a GitHub Actions. Se prueba la degradación segura
// cuando el entorno del runner no contiene las credenciales de producción.
test('Sin secretos de Vercel el panel no se abre ni devuelve una página 404',async()=>{
  if(['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY']
      .every(k=>Boolean(process.env[k])))return;
  const response={
    status:null,headers:{},content:null,
    setHeader(k,v){this.headers[k]=v;},
    writeHead(status,headers){this.status=status;Object.assign(this.headers,headers);},
    end(text){this.content=text;}
  };
  await app({url:'/?vm_route=/'},response);
  assert.equal(response.status,503);
  assert.match(response.content,/configuración/);
  assert.ok(!response.content.includes('SERVICE_ROLE_KEY'));
  const health={...response,headers:{},status:null,content:null};
  await app({url:'/?vm_route=/health'},health);
  assert.equal(health.status,503);
  const result=JSON.parse(health.content);
  assert.equal(result.configured,false);
  assert.ok(result.missing_variables.length>=1);
});
