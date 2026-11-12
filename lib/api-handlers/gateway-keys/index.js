const { sendJson, getUser, supabaseAdmin, hashToken, makeGatewayToken } = require('../../server');

module.exports = async function handler(req, res) {
  try {
    const user = await getUser(req, res);
    if (!user) return sendJson(res, 401, { error: 'Sign in required.' });
    const db = supabaseAdmin();

    if (req.method === 'GET') {
      const result = await db.from('gateway_keys').select('id,name,key_prefix,created_at,last_used_at')
        .eq('user_id', user.id).order('created_at', { ascending: false });
      if (result.error) return sendJson(res, 500, { error: result.error.message });
      return sendJson(res, 200, { keys: result.data });
    }

    if (req.method === 'POST') {
      const token = makeGatewayToken();
      const result = await db.from('gateway_keys').insert({
        user_id: user.id,
        name: 'Default key',
        key_hash: hashToken(token),
        key_prefix: token.slice(0, 11)
      }).select('id,name,key_prefix,created_at').single();
      if (result.error) return sendJson(res, 500, { error: result.error.message });
      return sendJson(res, 201, { key: token, gatewayKey: result.data });
    }

    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || 'Gateway key request failed.' });
  }
};