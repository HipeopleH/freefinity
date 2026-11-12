const { sendJson } = require('../../lib/server');
const { authenticateGateway, getProviderCredential, recordGatewayUsage } = require('../../lib/gateway');

function cleanModelId(value) {
  const parts = String(value || '').split('/');
  if (parts[0].toLowerCase() === 'ace-data-cloud') return parts.slice(1).join('/');
  if (parts[1] && parts[1].toLowerCase() === 'ace-data-cloud') return parts.slice(2).join('/');
  if (parts[0].startsWith('custom_') || parts[0] === 'freefinity') return parts.slice(1).join('/');
  return String(value || '');
}

function readUsage(value) {
  const usage = value && (value.usage || (value.message && value.message.usage));
  if (!usage || typeof usage !== 'object') return null;
  const input = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0);
  const output = Number(usage.output_tokens ?? usage.completion_tokens ?? 0);
  return {
    prompt_tokens: Number.isFinite(input) ? input : 0,
    completion_tokens: Number.isFinite(output) ? output : 0
  };
}

function parseSseUsageLine(line) {
  if (!line.startsWith('data:')) return null;
  const value = line.slice(5).trim();
  if (!value) return null;
  try { return readUsage(JSON.parse(value)); } catch { return null; }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: { type: 'invalid_request_error', message: 'Method not allowed' } });

  let auth = null;
  let modelForUsage = 'unknown';
  let promptTokens = 0;
  let completionTokens = 0;

  try {
    auth = await authenticateGateway(req);
    if (!auth) return sendJson(res, 401, { error: { type: 'authentication_error', message: 'Invalid or missing Freefinity API key.' } });

    const body = req.body || {};
    if (typeof body.model !== 'string' || !body.model.trim() || !Array.isArray(body.messages) || !body.messages.length || !Number.isFinite(Number(body.max_tokens))) {
      return sendJson(res, 400, { error: { type: 'invalid_request_error', message: 'Provide model, messages, and max_tokens.' } });
    }

    modelForUsage = body.model;
    const model = cleanModelId(body.model);
    if (!model) return sendJson(res, 400, { error: { type: 'invalid_request_error', message: 'Invalid model ID.' } });

    const providerKey = await getProviderCredential(auth.userId, 'ace-data-cloud');
    if (!providerKey) return sendJson(res, 400, { error: { type: 'invalid_request_error', message: 'No saved Ace Data Cloud credential found for this account.' } });

    const payload = { ...body, model };
    const headers = {
      Authorization: 'Bearer ' + providerKey,
      'Content-Type': 'application/json',
      Accept: req.headers.accept || 'application/json',
      'anthropic-version': req.headers['anthropic-version'] || '2023-06-01'
    };
    if (req.headers['anthropic-beta']) headers['anthropic-beta'] = req.headers['anthropic-beta'];

    const upstream = await fetch('https://api.acedata.cloud/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    res.statusCode = upstream.status;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    const requestId = upstream.headers.get('request-id') || upstream.headers.get('anthropic-request-id');
    if (requestId) res.setHeader('request-id', requestId);

    if (!upstream.body) {
      res.end();
    } else if (body.stream === true) {
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
            if (usage.prompt_tokens) promptTokens = usage.prompt_tokens;
            if (usage.completion_tokens) completionTokens = usage.completion_tokens;
          }
        }
      }
      pending += decoder.decode();
      const finalUsage = parseSseUsageLine(pending);
      if (finalUsage) {
        if (finalUsage.prompt_tokens) promptTokens = finalUsage.prompt_tokens;
        if (finalUsage.completion_tokens) completionTokens = finalUsage.completion_tokens;
      }
      res.end();
    } else {
      const chunks = [];
      for await (const chunk of upstream.body) chunks.push(Buffer.from(chunk));
      const responseBody = Buffer.concat(chunks);
      try {
        const usage = readUsage(JSON.parse(responseBody.toString('utf8')));
        if (usage) {
          promptTokens = usage.prompt_tokens;
          completionTokens = usage.completion_tokens;
        }
      } catch {}
      res.end(responseBody);
    }

    try { await recordGatewayUsage(auth, modelForUsage, promptTokens, completionTokens); }
    catch (usageError) { console.error('Freefinity usage recording failed:', usageError.message); }
  } catch (error) {
    if (auth) {
      try { await recordGatewayUsage(auth, modelForUsage, promptTokens, completionTokens); }
      catch (usageError) { console.error('Freefinity usage recording failed:', usageError.message); }
    }
    if (!res.headersSent) return sendJson(res, 500, { error: { type: 'server_error', message: error.message || 'Messages gateway request failed.' } });
    return res.end();
  }
};
