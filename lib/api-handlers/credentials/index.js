const { sendJson, getUser, supabaseAdmin, encryptSecret } = require('../../server');

module.exports = async function handler(req, res) {
  try {
    const user = await getUser(req, res);
    if (!user) return sendJson(res, 401, { error: 'Sign in required.' });
    const db = supabaseAdmin();

    if (req.method === 'GET') {
      const result = await db.from('provider_credentials')
        .select('id,provider,label,created_at,health_status,health_checked_at,health_message')
        .eq('user_id', user.id).order('created_at', { ascending: true });
      if (result.error) return sendJson(res, 500, { error: result.error.message });
      return sendJson(res, 200, { credentials: result.data });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const provider = String(body.provider || '').trim();
      const label = String(body.label || '').trim().slice(0, 80);
      const key = String(body.key || '').trim();
      const allowed = ['Ace Data Cloud', 'OpenAI', 'Anthropic', 'Google Gemini', 'OpenRouter', 'Mistral', 'DeepSeek', 'Custom provider'];
      if (!allowed.includes(provider)) return sendJson(res, 400, { error: 'Unsupported provider.' });
      if (!key || key.length > 4096) return sendJson(res, 400, { error: 'Enter a valid provider key.' });
      const encrypted = encryptSecret(key);
      const result = await db.from('provider_credentials').insert({
        user_id: user.id, provider, label,
        key_ciphertext: encrypted.ciphertext,
        key_iv: encrypted.iv,
        key_tag: encrypted.tag
      }).select('id,provider,label,created_at').single();
      if (result.error) return sendJson(res, 500, { error: result.error.message });
      return sendJson(res, 201, { credential: result.data });
    }

    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || 'Credential request failed.' });
  }
};