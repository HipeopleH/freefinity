const { createClient } = require('@supabase/supabase-js');
const crypto = require('node:crypto');

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error('Missing server environment variable: ' + name);
  return value;
}

function supabasePublic() {
  return createClient(env('SUPABASE_URL'), process.env.SUPABASE_ANON_KEY || env('SUPABASE_PUBLISHABLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function supabaseAdmin() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(header.split(';').map(part => {
    const i = part.indexOf('=');
    if (i < 0) return ['', ''];
    return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())];
  }).filter(pair => pair[0]));
}

function setSessionCookies(res, session) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const common = '; Path=/; HttpOnly; SameSite=Lax' + secure;
  res.setHeader('Set-Cookie', [
    'ff_access=' + encodeURIComponent(session.access_token) + common + '; Max-Age=' + Math.max(60, session.expires_in || 3600),
    'ff_refresh=' + encodeURIComponent(session.refresh_token) + common + '; Max-Age=2592000'
  ]);
}

function clearSessionCookies(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const common = '; Path=/; HttpOnly; SameSite=Lax' + secure + '; Max-Age=0';
  res.setHeader('Set-Cookie', ['ff_access=;' + common, 'ff_refresh=;' + common]);
}

async function getUser(req, res) {
  const cookies = parseCookies(req);
  const client = supabasePublic();
  let access = cookies.ff_access;
  if (!access && !cookies.ff_refresh) return null;

  let result = access ? await client.auth.getUser(access) : { data: { user: null }, error: true };
  if (result.error && cookies.ff_refresh) {
    const refreshed = await client.auth.refreshSession({ refresh_token: cookies.ff_refresh });
    if (refreshed.data.session) {
      setSessionCookies(res, refreshed.data.session);
      access = refreshed.data.session.access_token;
      result = await client.auth.getUser(access);
    }
  }
  return result.data && result.data.user ? result.data.user : null;
}

function encryptSecret(plain) {
  const key = Buffer.from(env('CREDENTIAL_ENCRYPTION_KEY'), 'base64');
  if (key.length !== 32) throw new Error('CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64')
  };
}

function decryptSecret(row) {
  const key = Buffer.from(env('CREDENTIAL_ENCRYPTION_KEY'), 'base64');
  if (key.length !== 32) throw new Error('Invalid encryption key configuration.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(row.key_iv, 'base64'));
  decipher.setAuthTag(Buffer.from(row.key_tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(row.key_ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function makeGatewayToken() {
  return 'ff_' + crypto.randomBytes(32).toString('base64url');
}

module.exports = {
  env, supabasePublic, supabaseAdmin, sendJson, getUser,
  setSessionCookies, clearSessionCookies, encryptSecret, decryptSecret,
  hashToken, makeGatewayToken
};