const { sendJson } = require('../lib/server');
const ROUTES = {
  signup: 'signup',
  login: 'login',
  logout: 'logout',
  me: 'me',
  verify: 'verify',
  'complete-confirmation': 'complete-confirmation'
};
module.exports = async function handler(req, res) {
  const action = String((req.query && req.query.action) || '');
  const target = ROUTES[action];
  if (!target) return sendJson(res, 404, { error: 'Auth route not found.' });
  return require('../lib/api-handlers/auth/' + target)(req, res);
};
