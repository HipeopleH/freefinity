const { sendJson, getUser, supabaseAdmin, encryptSecret } = require('../../server');

module.exports = async function handler(req, res) {
  try {
    const user = await getUser(req, res);
    if (!user) return sendJson(res, 401, { error: 'Sign in required.' });
    const db = supabaseAdmin();

    if (req.method === 'GET') {
      const result = await db.from('ace_management_credentials')
        .select('id,updated_at')
        .eq('user_id', user.id)
        .maybeSingle();
      if (result.error) return sendJson(res, 500, { error: result.error.message });
      return sendJson(res, 200, { configured: !!result.data, updated_at: result.data?.updated_at || null });
    }

    if (req.method === 'POST') {
      const token = String((req.body || {}).token || '').trim();
      if (!/^platform-[A-Za-z0-9_-]{12,}$/.test(token) || token.length > 4096) {
        return sendJson(res, 400, { error: 'Enter a valid Ace platform token beginning with platform-.' });
      }
      const encrypted = encryptSecret(token);
      const result = await db.from('ace_management_credentials').upsert({
        user_id: user.id,
        key_ciphertext: encrypted.ciphertext,
        key_iv: encrypted.iv,
        key_tag: encrypted.tag,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' }).select('id,updated_at').single();
      if (result.error) return sendJson(res, 500, { error: result.error.message });
      return sendJson(res, 200, { configured: true, updated_at: result.data.updated_at });
    }

    if (req.method === 'DELETE') {
      const result = await db.from('ace_management_credentials').delete().eq('user_id', user.id);
      if (result.error) return sendJson(res, 500, { error: result.error.message });
      return sendJson(res, 200, { configured: false });
    }

    return sendJson(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || 'Ace management credential request failed.' });
  }
};
