const { sendJson, getUser, supabaseAdmin, decryptSecret } = require('../../server');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' });

  try {
    const user = await getUser(req, res);
    if (!user) return sendJson(res, 401, { error: 'Sign in required.' });

    const stored = await supabaseAdmin().from('ace_management_credentials')
      .select('key_ciphertext,key_iv,key_tag')
      .eq('user_id', user.id)
      .maybeSingle();

    if (stored.error) return sendJson(res, 500, { error: stored.error.message });
    if (!stored.data) return sendJson(res, 400, { error: 'Add your Ace platform-management token to view your balance.', code: 'ACE_PLATFORM_TOKEN_REQUIRED' });

    const token = decryptSecret(stored.data);
    const response = await fetch('https://platform.acedata.cloud/api/v1/applications/?limit=200', {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000)
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload.detail || payload.message || payload.error;
      const status = response.status === 401 || response.status === 403 ? response.status : 502;
      return sendJson(res, status, {
        error: typeof detail === 'string' ? detail : 'Ace rejected the platform token. Check that it is valid and has application-read permission.'
      });
    }

    const items = Array.isArray(payload.items) ? payload.items : [];
    const applications = items.map(item => ({
      application_id: item.id || null,
      service_id: item.service_id || null,
      remaining_amount: Number(item.remaining_amount || 0),
      used_amount: Number(item.used_amount || 0),
      scope: item.scope || 'Unknown',
      allow_overdraft: !!item.allow_overdraft,
      expired_at: item.expired_at || null,
      disabled: !!item.disabled
    }));

    const totalRemaining = applications.reduce((sum, item) => sum + item.remaining_amount, 0);
    const totalUsed = applications.reduce((sum, item) => sum + item.used_amount, 0);

    return sendJson(res, 200, {
      unit: 'Credits',
      total_remaining: totalRemaining,
      total_used: totalUsed,
      application_count: applications.length,
      applications,
      fetched_at: new Date().toISOString(),
      note: 'Ace reports balances per application. A positive balance alone does not guarantee that an application is active or that every model is available.'
    });
  } catch (error) {
    const timeout = error.name === 'TimeoutError' || error.name === 'AbortError';
    return sendJson(res, 502, { error: timeout ? 'Ace balance request timed out. Try refreshing.' : (error.message || 'Could not retrieve the Ace balance.') });
  }
};
