const { supabaseAdmin, hashToken, decryptSecret } = require('./server');

async function authenticateGateway(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(ff_[A-Za-z0-9_-]+)$/);
  const alternate = String(req.headers['x-api-key'] || '');
  const token = match ? match[1] : alternate;
  if (!/^ff_[A-Za-z0-9_-]+$/.test(token)) return null;
  const db = supabaseAdmin();
  const result = await db.from('gateway_keys').select('id,user_id')
    .eq('key_hash', hashToken(token)).maybeSingle();
  if (result.error || !result.data) return null;
  await db.from('gateway_keys').update({ last_used_at: new Date().toISOString() }).eq('id', result.data.id);
  return { userId: result.data.user_id, keyId: result.data.id };
}

const PROVIDERS = {
  openai: { label: 'OpenAI', apiName: 'OpenAI', url: 'https://api.openai.com/v1/chat/completions' },
  openrouter: { label: 'OpenRouter', apiName: 'OpenRouter', url: 'https://openrouter.ai/api/v1/chat/completions' },
  deepseek: { label: 'DeepSeek', apiName: 'DeepSeek', url: 'https://api.deepseek.com/chat/completions' },
  mistral: { label: 'Mistral', apiName: 'Mistral', url: 'https://api.mistral.ai/v1/chat/completions' },
  'ace-data-cloud': { label: 'Ace Data Cloud', apiName: 'Ace Data Cloud', url: 'https://api.acedata.cloud/v1/chat/completions' }
};

async function recordGatewayUsage(auth, model, promptTokens = 0, completionTokens = 0) {
  if (!auth || !auth.userId || !auth.keyId) return;
  const result = await supabaseAdmin().rpc('record_gateway_usage', {
    p_user_id: auth.userId, p_gateway_key_id: auth.keyId, p_model: model || 'unknown',
    p_prompt_tokens: Math.max(0, Number(promptTokens) || 0),
    p_completion_tokens: Math.max(0, Number(completionTokens) || 0)
  });
  if (result.error) throw result.error;
}

async function getProviderCredentials(userId, provider) {
  const config = PROVIDERS[provider];
  if (!config) return [];
  const result = await supabaseAdmin().from('provider_credentials')
    .select('id,key_ciphertext,key_iv,key_tag,health_status')
    .eq('user_id', userId).eq('provider', config.apiName)
    .order('created_at', { ascending: false });
  if (result.error) throw result.error;
  return (result.data || []).map(row => ({ id: row.id, key: decryptSecret(row), health_status: row.health_status || 'unchecked' }));
}

async function updateCredentialHealth(id, status, message = '') {
  const allowed = ['active', 'invalid', 'expired', 'insufficient_credits', 'unknown'];
  if (!allowed.includes(status)) return;
  const safeMessage = String(message || '').replace(/https?:\/\/\S+/g, '[url]').slice(0, 240);
  const result = await supabaseAdmin().from('provider_credentials').update({
    health_status: status, health_checked_at: new Date().toISOString(),
    health_message: safeMessage
  }).eq('id', id);
  if (result.error) console.error('Credential health update failed:', result.error.message);
}

function classifyCredentialResponse(response, bodyText = '') {
  const text = String(bodyText || '').toLowerCase();
  if (/expired|expiration|has expired/.test(text)) return 'expired';
  if (response.status === 401 || response.status === 403) return 'invalid';
  if (response.status === 402 || /insufficient[_ ]credits|not enough credits|balance is insufficient/.test(text)) return 'insufficient_credits';
  if (response.ok) return 'active';
  return 'unknown';
}

async function requestWithCredentialFallback(userId, provider, url, options) {
  const credentials = await getProviderCredentials(userId, provider);
  if (!credentials.length) return { response: null, error: 'No saved provider credential found.' };
  let lastResponse = null;
  let lastText = '';
  for (let i = 0; i < credentials.length; i++) {
    const credential = credentials[i];
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', 'Bearer ' + credential.key);
    const response = await fetch(url, { ...options, headers });
    if (response.ok) {
      await updateCredentialHealth(credential.id, 'active', 'Request succeeded');
      return { response, credentialId: credential.id };
    }
    if (response.status === 401 || response.status === 403 || response.status === 402) {
      lastText = await response.clone().text().catch(() => '');
      const status = classifyCredentialResponse(response, lastText);
      await updateCredentialHealth(credential.id, status, lastText || ('HTTP ' + response.status));
      lastResponse = response;
      // Try the next saved credential for this same provider on authentication
      // failures or an insufficient-credit response. This supports legitimate
      // credential redundancy (for example, separate personal and work keys).
      if ((response.status === 401 || response.status === 403 || response.status === 402) && i < credentials.length - 1) continue;
      return { response };
    }
    lastText = await response.clone().text().catch(() => '');
    await updateCredentialHealth(credential.id, classifyCredentialResponse(response, lastText), lastText || ('HTTP ' + response.status));
    return { response };
  }
  return { response: lastResponse };
}

async function getProviderCredential(userId, provider) {
  const credentials = await getProviderCredentials(userId, provider);
  return credentials.length ? credentials[0].key : null;
}

module.exports = {
  authenticateGateway, PROVIDERS, getProviderCredential, getProviderCredentials,
  updateCredentialHealth, requestWithCredentialFallback, recordGatewayUsage
};
