const { sendJson, getUser } = require('../../server');
const { getProviderCredential } = require('../../gateway');
const { fetchAceModels } = require('../../ace');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });

  try {
    const user = await getUser(req, res);
    if (!user) return sendJson(res, 401, { error: 'Not authenticated.' });

    const apiKey = await getProviderCredential(user.id, 'ace-data-cloud');
    if (!apiKey) return sendJson(res, 400, { error: 'Save an Ace Data Cloud API key first.' });

    const models = await fetchAceModels(apiKey);
    return sendJson(res, 200, {
      object: 'list',
      provider: 'Ace Data Cloud',
      fetched_at: new Date().toISOString(),
      data: models
    });
  } catch (error) {
    return sendJson(res, 502, { error: error.message || 'Could not fetch Ace Data Cloud models.' });
  }
};
