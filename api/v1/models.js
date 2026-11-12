const { sendJson } = require('../../lib/server');
const { authenticateGateway, PROVIDERS, getProviderCredential } = require('../../lib/gateway');
const { fetchAceModels } = require('../../lib/ace');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: { message: 'Method not allowed', type: 'invalid_request_error' } });

  try {
    const auth = await authenticateGateway(req);
    if (!auth) return sendJson(res, 401, { error: { message: 'Invalid or missing Freefinity API key.', type: 'authentication_error' } });

    const ids = {
      openai: ['gpt-4o-mini', 'gpt-4.1-mini'],
      openrouter: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet'],
      deepseek: ['deepseek-chat', 'deepseek-reasoner'],
      mistral: ['mistral-small-latest', 'mistral-large-latest']
    };
    const data = Object.entries(PROVIDERS)
      .filter(([prefix]) => prefix !== 'ace-data-cloud')
      .flatMap(([prefix, config]) => (ids[prefix] || []).map(model => ({
        id: prefix + '/' + model, object: 'model', created: 0,
        owned_by: config.label.toLowerCase()
      })));

    const aceKey = await getProviderCredential(auth.userId, 'ace-data-cloud');
    if (aceKey) {
      const aceModels = await fetchAceModels(aceKey);
      data.push(...aceModels.map(model => ({
        ...model,
        id: 'ace-data-cloud/' + model.id
      })));
    }

    data.sort((a, b) =>
      Number(/claude/i.test(b.id)) - Number(/claude/i.test(a.id)) ||
      a.id.localeCompare(b.id)
    );
    return sendJson(res, 200, { object: 'list', data });
  } catch (error) {
    return sendJson(res, 502, { error: { message: error.message || 'Model listing failed.', type: 'upstream_error' } });
  }
};
