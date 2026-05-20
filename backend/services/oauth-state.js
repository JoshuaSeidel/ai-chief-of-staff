const crypto = require('crypto');
const { getDb } = require('../database/db');

const STATE_MAX_AGE_MS = 15 * 60 * 1000;

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

async function getStateSecret() {
  if (process.env.OAUTH_STATE_SECRET) return process.env.OAUTH_STATE_SECRET;

  const db = getDb();
  const existing = await db.get('SELECT value FROM config WHERE key = ?', ['oauthStateSecret']);
  if (existing?.value) return existing.value;

  const secret = crypto.randomBytes(32).toString('base64url');
  await db.run(
    'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    ['oauthStateSecret', secret]
  );
  return secret;
}

async function createOAuthState(profileId, provider) {
  const payload = {
    profileId: Number(profileId) || 2,
    provider,
    nonce: crypto.randomBytes(16).toString('base64url'),
    iat: Date.now()
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  const secret = await getStateSecret();
  const signature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64url');

  return `${body}.${signature}`;
}

async function verifyOAuthState(state, expectedProvider) {
  if (!state || typeof state !== 'string') {
    throw new Error('OAuth state is missing');
  }

  const [body, signature] = state.split('.');
  if (!body || !signature) {
    throw new Error('OAuth state is invalid');
  }

  const secret = await getStateSecret();
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64url');

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new Error('OAuth state signature is invalid');
  }

  const payload = JSON.parse(base64UrlDecode(body));
  if (payload.provider !== expectedProvider) {
    throw new Error('OAuth state provider mismatch');
  }
  if (!payload.iat || Date.now() - payload.iat > STATE_MAX_AGE_MS) {
    throw new Error('OAuth state has expired');
  }

  return payload;
}

module.exports = {
  createOAuthState,
  verifyOAuthState
};
