const { sendJson } = require('../lib/server');
const ROUTES = {
  balance: 'balance',
  'management-key': 'management-key',
  models: 'models'
};
module.exports = async function handler(req, res) {
  const action = String((req.query && req.query.action) || '');
  const target = ROUTES[action];
  if (!target) return sendJson(res, 404, { error: 'Ace route not found.' });
  return require('../lib/api-handlers/ace/' + target)(req, res);
};
