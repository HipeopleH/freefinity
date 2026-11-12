const { sendJson } = require('../../../lib/server');
const { authenticateGateway, PROVIDERS, getProviderCredential, recordGatewayUsage } = require('../../../lib/gateway');

function readUsage(value) {
  const usage = value && (value.usage || (value.message && value.message.usage));
  if (!usage || typeof usage !== 'object') return null;
  const prompt = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
  const completion = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
  return {
    prompt_tokens: Number.isFinite(prompt) ? prompt : 0,
    completion_tokens: Number.isFinite(completion) ? completion : 0
  };
}

function parseSseUsageLine(line) {
  if (!line.startsWith('data:')) return null;
  const value = line.slice(5).trim();
  if (!value || value === '[DONE]') return null;
  try { return readUsage(JSON.parse(value)); } catch { return null; }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: { message: 'Method not allowed', type: 'invalid_request_error' } });

  let auth = null;
  let requestedModel = 'unknown';
  let promptTokens = 0;
  let completionTokens = 0;

  try {
    auth = await authenticateGateway(req);
    if (!auth) return sendJson(res, 401, { error: { message: 'Invalid or missing Freefinity API key.', type: 'authentication_error' } });

    const body = req.body || {};
    if (!Array.isArray(body.messages) || !body.messages.length || typeof body.model !== 'string') {
      return sendJson(res, 400, { error: { message: 'Provide a model and a non-empty messages array.', type: 'invalid_request_error' } });
    }

    requestedModel = body.model;
    const slash = body.model.indexOf('/');
    if (slash < 1) {
      return sendJson(res, 400, { error: { message: 'Use a provider-prefixed model ID, for example ace-data-cloud/claude-sonnet-4-6.', type: 'invalid_request_error' } });
    }
    const provider = body.model.slice(0, slash).toLowerCase();
    const model = body.model.slice(slash + 1);
    const config = PROVIDERS[provider];
    if (!config) {
      return sendJson(res, 400, { error: { message: 'This provider adapter is not available yet.', type: 'invalid_request_error' } });
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

    if (!upstream.body) {
      res.end();
      return;
    }

    const isStream = body.stream === true;
    if (isStream) {
      const decoder = new TextDecoder();
      let pending = '';

      for await (const chunk of upstream.body) {
        const bytes = Buffer.from(chunk);
        res.write(bytes);
        pending += decoder.decode(bytes, { stream: true });
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() || '';
        for (const line of lines) {
          const usage = parseSseUsageLine(line);
          if (usage) {
            promptTokens = usage.prompt_tokens;
            completionTokens = usage.completion_tokens;
          }
        }
      }

      pending += decoder.decode();
      const finalUsage = parseSseUsageLine(pending);
      if (finalUsage) {
        promptTokens = finalUsage.prompt_tokens;
        completionTokens = finalUsage.completion_tokens;
      }
      res.end();
    } else {
      const chunks = [];
      for await (const chunk of upstream.body) chunks.push(Buffer.from(chunk));
      const responseBody = Buffer.concat(chunks);
      try {
        const parsed = JSON.parse(responseBody.toString('utf8'));
        const usage = readUsage(parsed);
        if (usage) {
          promptTokens = usage.prompt_tokens;
          completionTokens = usage.completion_tokens;
        }
      } catch {}
      res.end(responseBody);
    }

    try {
      await recordGatewayUsage(auth, requestedModel, promptTokens, completionTokens);
    } catch (usageError) {
      console.error('Freefinity usage recording failed:', usageError.message);
    }
  } catch (error) {
    if (auth) {
      try { await recordGatewayUsage(auth, requestedModel, promptTokens, completionTokens); }
      catch (usageError) { console.error('Freefinity usage recording failed:', usageError.message); }
    }
    if (!res.headersSent) return sendJson(res, 500, { error: { message: error.message || 'Gateway request failed.', type: 'server_error' } });
    return res.end();
  }
};
