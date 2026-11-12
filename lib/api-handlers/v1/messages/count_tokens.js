const { sendJson } = require('../../../server');
const { authenticateGateway, getProviderCredential } = require('../../../gateway');

function cleanModelId(value) {
  const parts = String(value || '').split('/');
  if (parts[0].toLowerCase() === 'ace-data-cloud') return parts.slice(1).join('/');
  if (parts[1] && parts[1].toLowerCase() === 'ace-data-cloud') return parts.slice(2).join('/');
  if (parts[0].startsWith('custom_') || parts[0] === 'freefinity') return parts.slice(1).join('/');
  return String(value || '');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const auth = await authenticateGateway(req);
    if (!auth) return sendJson(res, 401, { error: 'Invalid or missing Freefinity API key.' });

    const body = req.body || {};
    if (typeof body.model !== 'string' || !body.model.trim() || !Array.isArray(body.messages)) {
      return sendJson(res, 400, { error: 'Provide a model and messages array.' });
    }

    const apiKey = await getProviderCredential(auth.userId, 'ace-data-cloud');
    if (!apiKey) return sendJson(res, 400, { error: 'No saved Ace Data Cloud credential found.' });

    const upstream = await fetch('https://api.acedata.cloud/v1/messages/count_tokens', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'anthropic-version': req.headers['anthropic-version'] || '2023-06-01'
      },
      body: JSON.stringify({ ...body, model: cleanModelId(body.model) })
    });

    res.statusCode = upstream.status;
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(await upstream.text());
  } catch (error) {
    return sendJson(res, 502, { error: error.message || 'Token count request failed.' });
  }
};
