const { supabasePublic, sendJson, setSessionCookies } = require('../../lib/server');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const accessToken = String((req.body || {}).access_token || '');
    const refreshToken = String((req.body || {}).refresh_token || '');
    if (!accessToken || !refreshToken) return sendJson(res, 400, { error: 'The confirmation link did not return a complete session. Please request a new confirmation email.' });

    const result = await supabasePublic().auth.getUser(accessToken);
    if (result.error || !result.data.user || !result.data.user.email_confirmed_at) {
      return sendJson(res, 401, { error: 'Email confirmation could not be validated. Please open the newest confirmation email.' });
    }

    setSessionCookies(res, {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600
    });
    return sendJson(res, 200, {
      user: { id: result.data.user.id, email: result.data.user.email },
      verified: true
    });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || 'Could not complete email confirmation.' });
  }
};
