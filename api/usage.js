const { sendJson, getUser, supabaseAdmin } = require('../lib/server');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });

  try {
    const user = await getUser(req, res);
    if (!user) return sendJson(res, 401, { error: 'Not authenticated.' });

    const result = await supabaseAdmin()
      .from('gateway_usage_daily')
      .select('model,request_count,prompt_tokens,completion_tokens,usage_date')
      .eq('user_id', user.id)
      .order('usage_date', { ascending: false })
      .limit(1000);

    if (result.error) throw result.error;

    const totals = { requests: 0, prompt_tokens: 0, completion_tokens: 0 };
    const byModel = new Map();
    const byDay = new Map();

    for (const row of result.data || []) {
      const requests = Number(row.request_count || 0);
      const prompt = Number(row.prompt_tokens || 0);
      const completion = Number(row.completion_tokens || 0);
      totals.requests += requests;
      totals.prompt_tokens += prompt;
      totals.completion_tokens += completion;

      const model = row.model || 'unknown';
      const current = byModel.get(model) || { model, requests: 0, prompt_tokens: 0, completion_tokens: 0 };
      current.requests += requests;
      current.prompt_tokens += prompt;
      current.completion_tokens += completion;
      byModel.set(model, current);

      const day = row.usage_date;
      const daily = byDay.get(day) || { date: day, requests: 0, prompt_tokens: 0, completion_tokens: 0 };
      daily.requests += requests;
      daily.prompt_tokens += prompt;
      daily.completion_tokens += completion;
      byDay.set(day, daily);
    }

    return sendJson(res, 200, {
      totals,
      models: Array.from(byModel.values()).sort((a, b) => b.requests - a.requests),
      days: Array.from(byDay.values()).sort((a, b) => b.date.localeCompare(a.date))
    });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || 'Could not load Freefinity usage.' });
  }
};
