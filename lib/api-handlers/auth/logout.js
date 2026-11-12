const { sendJson, clearSessionCookies } = require('../../server');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  clearSessionCookies(res);
  return sendJson(res, 200, { ok: true });
};