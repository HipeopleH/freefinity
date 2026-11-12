const { sendJson } = require('../lib/server');

const ROUTES = {
  'ace/balance': 'ace/balance',
  'ace/management-key': 'ace/management-key',
  'ace/models': 'ace/models',
  'auth/complete-confirmation': 'auth/complete-confirmation',
  'auth/login': 'auth/login',
  'auth/logout': 'auth/logout',
  'auth/me': 'auth/me',
  'auth/signup': 'auth/signup',
  'auth/verify': 'auth/verify',
  'credentials': 'credentials/index',
  'gateway-keys': 'gateway-keys/index',
  'usage': 'usage',
  'v1/chat/completions': 'v1/chat/completions',
  'v1/messages': 'v1/messages',
  'v1/messages/count_tokens': 'v1/messages/count_tokens',
  'v1/models': 'v1/models'
};

module.exports = async function handler(req, res) {
  try {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    const route = pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
    let target = ROUTES[route];

    const credentialMatch = route.match(/^credentials\/([^/]+)$/);
    if (!target && credentialMatch) {
      target = 'credentials/[id]';
      req.query = { ...(req.query || {}), id: decodeURIComponent(credentialMatch[1]) };
    }

    if (!target) return sendJson(res, 404, { error: 'API route not found.' });
    return require('../lib/api-handlers/' + target)(req, res);
  } catch (error) {
    return sendJson(res, 500, { error: error.message || 'API request failed.' });
  }
};
