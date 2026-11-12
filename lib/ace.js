async function fetchAceModels(apiKey) {
  const response = await fetch('https://api.acedata.cloud/openai/models', {
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error('Ace Data Cloud model discovery failed (' + response.status + ')' + (detail ? ': ' + detail.slice(0, 240) : ''));
  }

  const payload = await response.json();
  const raw = Array.isArray(payload) ? payload
    : Array.isArray(payload.data) ? payload.data
    : Array.isArray(payload.models) ? payload.models
    : [];

  const seen = new Set();
  const models = raw.map(item => {
    if (typeof item === 'string') return item;
    if (!item || typeof item !== 'object') return '';
    return item.id || item.model || item.name || '';
  }).map(value => String(value).trim()).filter(value => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  }).map(id => ({
    id,
    object: 'model',
    created: 0,
    owned_by: 'ace data cloud'
  }));

  models.sort((a, b) =>
    Number(/claude/i.test(b.id)) - Number(/claude/i.test(a.id)) ||
    a.id.localeCompare(b.id)
  );

  return models;
}

module.exports = { fetchAceModels };
