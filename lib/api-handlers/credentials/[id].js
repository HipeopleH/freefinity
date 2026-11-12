const { sendJson, getUser, supabaseAdmin } = require('../../server');

module.exports = async function handler(req, res) {
  if (req.method !== 'DELETE') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const user = await getUser(req, res);
    if (!user) return sendJson(res, 401, { error: 'Sign in required.' });
    const id = req.query.id;
    if (!id) return sendJson(res, 400, { error: 'Credential ID is required.' });
    const result = await supabaseAdmin().from('provider_credentials')
      .delete().eq('id', id).eq('user_id', user.id).select('id');
    if (result.error) return sendJson(res, 500, { error: result.error.message });
    if (!result.data.length) return sendJson(res, 404, { error: 'Credential not found.' });
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || 'Delete failed.' });
  }
};