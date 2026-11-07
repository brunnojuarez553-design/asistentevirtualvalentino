import { createHash, randomBytes } from 'node:crypto';
import { CredentialVault } from './credential-vault.mjs';
import { fail } from './tenants.mjs';

const isMetaId = value => typeof value === 'string' && /^\d{5,40}$/.test(value);

export class MetaOnboarding {
  constructor(env, directory, fetcher = fetch) {
    Object.assign(this, {env, directory, fetcher});
  }

  configured() {
    const e = this.env;
    return Boolean(this.directory && e.META_ONBOARDING_ENABLED === 'true' &&
      isMetaId(e.META_APP_ID) && isMetaId(e.META_SIGNUP_CONFIG_ID) &&
      e.META_APP_SECRET && /^v\d{2}\.0$/.test(e.META_GRAPH_VERSION || '') &&
      /^[A-Za-z0-9+/]{43}=$/.test(e.INTEGRATION_ENCRYPTION_KEY || ''));
  }

  requireReady() {
    if (!this.configured()) throw fail(503, 'Austral todavía debe configurar la conexión oficial de Meta.');
  }

  stateHash(user, state) {
    return createHash('sha256').update(JSON.stringify([user.id, user.businessId, state])).digest('hex');
  }

  connectionPath(businessId) {
    return 'vm_integrations?' + new URLSearchParams({business_id:'eq.'+businessId, provider:'eq.meta'});
  }

  async status(user) {
    const [row] = await this.directory.request(this.connectionPath(user.businessId)+'&select=config');
    return {
      configured: this.configured(),
      connected: Boolean(row),
      phone: row?.config?.displayPhone || null,
      canConnect: ['owner','admin'].includes(user.role) && !row
    };
  }

  async start(user) {
    this.requireReady();
    if ((await this.status(user)).connected) throw fail(409, 'Esta empresa ya tiene una conexión de WhatsApp.');
    const state = randomBytes(32).toString('base64url');
    await this.directory.request('vm_oauth_states', {method:'POST', body:{
      state_hash:this.stateHash(user,state), provider:'meta', user_id:user.id, business_id:user.businessId,
      verifier:'embedded-signup', expires_at:new Date(Date.now()+600000).toISOString()
    }});
    return {state, appId:this.env.META_APP_ID, configId:this.env.META_SIGNUP_CONFIG_ID, version:this.env.META_GRAPH_VERSION};
  }

  async graph(path, options) {
    let response;
    try {
      response = await this.fetcher('https://graph.facebook.com/'+this.env.META_GRAPH_VERSION+'/'+path,
        {...options, redirect:'error', signal:AbortSignal.timeout(10000)});
      if (response.ok) return await response.json();
    } catch {}
    throw fail(502, 'Meta no confirmó la conexión. Revisá la autorización y volvé a intentar.');
  }

  async finish(user, input) {
    this.requireReady();
    const {state, code, wabaId, phoneId} = input || {};
    if (typeof state !== 'string' || !/^[\w-]{43}$/.test(state) ||
        typeof code !== 'string' || !code || code.length > 3000 ||
        !isMetaId(wabaId) || !isMetaId(phoneId)) throw fail(400, 'Meta no devolvió una autorización completa.');
    const consumed = await this.directory.request('rpc/vm_consume_oauth_state',{method:'POST',body:{
      p_hash:this.stateHash(user,state),p_provider:'meta'
    }});
    if (consumed.length !== 1) throw fail(400, 'La autorización venció o ya se utilizó.');
    const credentials = new URLSearchParams({
      client_id:this.env.META_APP_ID, client_secret:this.env.META_APP_SECRET, code
    });
    const result = await this.graph('oauth/access_token?'+credentials);
    if (!result.access_token) throw fail(502, 'Meta no devolvió un token de empresa.');
    const headers = {Authorization:'Bearer '+result.access_token};
    const numbers = await this.graph(wabaId+'/phone_numbers?fields=id,display_phone_number&limit=100',{headers});
    const phone = numbers.data?.find(item=>item.id===phoneId);
    if (!phone) throw fail(403, 'El número seleccionado no pertenece a la cuenta autorizada.');
    const vault = new CredentialVault(this.env.INTEGRATION_ENCRYPTION_KEY);
    const config = {wabaId,phoneId,displayPhone:phone.display_phone_number || null};
    await this.directory.request('vm_integrations',{method:'POST',body:{
      business_id:user.businessId,provider:'meta',config,
      encrypted_credentials:vault.seal({accessToken:result.access_token},'meta:'+user.businessId)
    }});
    return {connected:true,phone:config.displayPhone};
  }
}
