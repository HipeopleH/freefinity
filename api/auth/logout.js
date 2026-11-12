const { sendJson, clearSessionCookies } = require('../../lib/server');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  clearSessionCookies(res);
  return sendJson(res, 200, { ok: true });
};