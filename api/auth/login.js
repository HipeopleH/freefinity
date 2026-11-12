const { supabasePublic, sendJson, setSessionCookies } = require('../../lib/server');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || !password) return sendJson(res, 400, { error: 'Email and password are required.' });
    const result = await supabasePublic().auth.signInWithPassword({ email, password });
    if (result.error) return sendJson(res, 401, { error: 'Email or password is incorrect.' });
    setSessionCookies(res, result.data.session);
    return sendJson(res, 200, { user: { id: result.data.user.id, email: result.data.user.email } });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || 'Login failed.' });
  }
};