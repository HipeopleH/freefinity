const { supabasePublic, sendJson, setSessionCookies } = require('../../lib/server');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return sendJson(res, 400, { error: 'Enter a valid email address.' });
    if (password.length < 12) return sendJson(res, 400, { error: 'Password must be at least 12 characters.' });

    const client = supabasePublic();
    const result = await client.auth.signUp({ email, password });
    if (result.error) return sendJson(res, 400, { error: result.error.message });
    if (result.data.session) setSessionCookies(res, result.data.session);
    return sendJson(res, 201, {
      user: { id: result.data.user.id, email: result.data.user.email },
      requiresEmailConfirmation: !result.data.session
    });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || 'Signup failed.' });
  }
};