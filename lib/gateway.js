const { supabaseAdmin, hashToken, decryptSecret } = require('./server');

async function authenticateGateway(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(ff_[A-Za-z0-9_-]+)$/);
  if (!match) return null;
  const db = supabaseAdmin();
  const result = await db.from('gateway_keys')
    .select('id,user_id')
    .eq('key_hash', hashToken(match[1]))
    .maybeSingle();
  if (result.error || !result.data) return null;
  await db.from('gateway_keys').update({ last_used_at: new Date().toISOString() }).eq('id', result.data.id);
  return { userId: result.data.user_id, keyId: result.data.id };
}

const PROVIDERS = {
  'openai': { label: 'OpenAI', apiName: 'OpenAI', url: 'https://api.openai.com/v1/chat/completions' },
  'openrouter': { label: 'OpenRouter', apiName: 'OpenRouter', url: 'https://openrouter.ai/api/v1/chat/completions' },
  'deepseek': { label: 'DeepSeek', apiName: 'DeepSeek', url: 'https://api.deepseek.com/chat/completions' },
  'mistral': { label: 'Mistral', apiName: 'Mistral', url: 'https://api.mistral.ai/v1/chat/completions' },
  'ace-data-cloud': { label: 'Ace Data Cloud', apiName: 'Ace Data Cloud', url: 'https://api.acedata.cloud/v1/chat/completions' }
};

async function getProviderCredential(userId, provider) {
  const config = PROVIDERS[provider];
  if (!config) return null;
  const result = await supabaseAdmin().from('provider_credentials')
    .select('key_ciphertext,key_iv,key_tag')
    .eq('user_id', userId)
    .eq('provider', config.apiName)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error || !result.data) return null;
  return decryptSecret(result.data);
}

module.exports = { authenticateGateway, PROVIDERS, getProviderCredential };