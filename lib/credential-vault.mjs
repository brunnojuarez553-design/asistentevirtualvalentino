import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
export class CredentialVault {
 constructor(encoded){
  if(typeof encoded!=='string'||! /^[A-Za-z0-9+/]{43}=$/.test(encoded))throw Error('INTEGRATION_ENCRYPTION_KEY must be a 32-byte base64 key');
  this.key=Buffer.from(encoded,'base64');
 }
 seal(value,binding){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);cipher.setAAD(Buffer.from(binding));
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
 }
 open(envelope,binding){
  try{
   const [version,iv,tag,data,...extra]=String(envelope).split('.');if(version!=='v1'||extra.length)throw Error();
   const decipher=createDecipheriv('aes-256-gcm',this.key,Buffer.from(iv,'base64url'));decipher.setAAD(Buffer.from(binding));decipher.setAuthTag(Buffer.from(tag,'base64url'));
   return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8'));
  }catch{throw Object.assign(Error('No se pudieron abrir las credenciales de esta empresa. Revisá la clave de cifrado.'),{status:503});}
 }
}
