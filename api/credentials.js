const { sendJson } = require('../lib/server');
module.exports = async function handler(req, res) {
  const id = req.query && req.query.id;
  const target = id ? '[id]' : 'index';
  if (id) req.query = { ...req.query, id: String(id) };
  return require('../lib/api-handlers/credentials/' + target)(req, res);
};
