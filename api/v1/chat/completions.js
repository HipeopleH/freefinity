const { sendJson } = require('../../../lib/server');
const { authenticateGateway, PROVIDERS, getProviderCredential } = require('../../../lib/gateway');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: { message: 'Method not allowed', type: 'invalid_request_error' } });
  try {
    const auth = await authenticateGateway(req);
    if (!auth) return sendJson(res, 401, { error: { message: 'Invalid or missing Freefinity API key.', type: 'authentication_error' } });

    const body = req.body || {};
    if (!Array.isArray(body.messages) || !body.messages.length || typeof body.model !== 'string') {
      return sendJson(res, 400, { error: { message: 'Provide a model and a non-empty messages array.', type: 'invalid_request_error' } });
    }

    const slash = body.model.indexOf('/');
    if (slash < 1) {
      return sendJson(res, 400, { error: { message: 'Use a provider-prefixed model ID, for example openai/gpt-4o-mini.', type: 'invalid_request_error' } });
    }
    const provider = body.model.slice(0, slash).toLowerCase();
    const model = body.model.slice(slash + 1);
    const config = PROVIDERS[provider];
    if (!config) {
      return sendJson(res, 400, { error: { message: 'This provider adapter is not available yet. Currently supported: OpenAI, OpenRouter, DeepSeek, and Mistral.', type: 'invalid_request_error' } });
    }

    const providerKey = await getProviderCredential(auth.userId, provider);
    if (!providerKey) {
      return sendJson(res, 400, { error: { message: 'No saved ' + config.label + ' credential found for this account.', type: 'invalid_request_error' } });
    }

    const payload = { ...body, model };
    const upstream = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + providerKey,
        'Content-Type': 'application/json',
        ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://freefinity.vercel.app', 'X-Title': 'Freefinity' } : {})
      },
      body: JSON.stringify(payload)
    });

    res.statusCode = upstream.status;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    if (upstream.body) {
      for await (const chunk of upstream.body) res.write(Buffer.from(chunk));
      return res.end();
    }
    return res.end();
  } catch (error) {
    if (!res.headersSent) return sendJson(res, 500, { error: { message: error.message || 'Gateway request failed.', type: 'server_error' } });
    return res.end();
  }
};