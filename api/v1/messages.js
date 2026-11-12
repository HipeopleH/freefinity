const { sendJson } = require('../../lib/server');
module.exports = async function handler(req, res) {
  const endpoint = String((req.query && req.query.endpoint) || '');
  const target = endpoint === 'count_tokens' ? 'count_tokens' : 'messages';
  return require('../../lib/api-handlers/v1/' + target)(req, res);
};
