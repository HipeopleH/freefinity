const { supabasePublic, sendJson, setSessionCookies } = require('../../server');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const token = String(body.token || '').trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return sendJson(res, 400, { error: 'Enter a valid email address.' });
    if (!/^\d{6}$/.test(token)) return sendJson(res, 400, { error: 'Enter the 6-digit code from your email.' });

    const client = supabasePublic();
    const result = await client.auth.verifyOtp({ email, token, type: 'signup' });
    if (result.error) return sendJson(res, 400, { error: result.error.message });
    if (!result.data.session || !result.data.user) return sendJson(res, 400, { error: 'Email verification did not return a session. Please try again.' });

    setSessionCookies(res, result.data.session);
    return sendJson(res, 200, {
      user: { id: result.data.user.id, email: result.data.user.email },
      verified: true
    });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || 'Email verification failed.' });
  }
};
