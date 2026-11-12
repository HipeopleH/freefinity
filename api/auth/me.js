const { sendJson, getUser } = require('../../lib/server');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const user = await getUser(req, res);
    if (!user) return sendJson(res, 401, { error: 'Not authenticated.' });
    return sendJson(res, 200, { user: { id: user.id, email: user.email } });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || 'Could not read session.' });
  }
};