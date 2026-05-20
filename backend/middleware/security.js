const crypto = require('crypto');

const SENSITIVE_KEYS = new Set([
  'authorization',
  'access_token',
  'refresh_token',
  'id_token',
  'token',
  'api_key',
  'apikey',
  'apiToken',
  'client_secret',
  'clientSecret',
  'secret',
  'password',
  'code'
]);

function splitCsv(value = '') {
  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function getAllowedOrigins() {
  const explicit = [
    process.env.FRONTEND_URL,
    ...splitCsv(process.env.ALLOWED_ORIGINS)
  ].filter(Boolean);

  const allowLocalhost = process.env.NODE_ENV !== 'production'
    || process.env.ALLOW_LOCALHOST_CORS === 'true'
    || explicit.length === 0;
  const local = allowLocalhost
    ? [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3001'
      ]
    : [];

  return [...new Set([...explicit, ...local])];
}

function buildCorsOptions() {
  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      if (getAllowedOrigins().includes(origin)) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Token', 'X-Profile-Id', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600
  };
}

function requestId(req, res, next) {
  const requestIdValue = req.get('x-request-id') || crypto.randomUUID();
  req.id = requestIdValue;
  res.setHeader('X-Request-Id', requestIdValue);
  next();
}

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self), payment=()');

  if ((process.env.NODE_ENV || 'production') === 'production') {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "connect-src 'self' https://graph.microsoft.com https://login.microsoftonline.com https://www.googleapis.com",
        "manifest-src 'self'",
        "worker-src 'self'"
      ].join('; ')
    );
  }

  if (req.secure || req.get('x-forwarded-proto') === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  next();
}

function timingSafeTokenEquals(actual, expected) {
  if (!actual || !expected) return false;
  const actualBuffer = Buffer.from(String(actual));
  const expectedBuffer = Buffer.from(String(expected));

  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function extractBearerToken(req) {
  const authorization = req.get('authorization') || '';
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }
  return req.get('x-api-token') || '';
}

function isPublicApiPath(req) {
  return (
    req.path === '/health'
    || req.path === '/config/version'
    || req.path === '/notifications/vapid-public-key'
    || /^\/calendar\/(google|microsoft)\/callback$/.test(req.path)
    || req.path === '/planner/microsoft/callback'
  );
}

function requireApiToken(req, res, next) {
  const expectedToken = process.env.AICOS_AUTH_TOKEN || process.env.API_TOKEN;
  if (!expectedToken || isPublicApiPath(req)) return next();

  if (timingSafeTokenEquals(extractBearerToken(req), expectedToken)) {
    return next();
  }

  return res.status(401).json({
    error: 'Authentication required',
    message: 'Set a valid Bearer token or X-API-Token header.'
  });
}

function originGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const origin = req.get('origin');
  if (!origin) return next();

  if (getAllowedOrigins().includes(origin)) return next();

  return res.status(403).json({
    error: 'Origin not allowed',
    message: 'This origin is not allowed to perform write operations.'
  });
}

function createRateLimiter({ windowMs = 60000, max = 120, keyPrefix = 'global', skip = () => false } = {}) {
  const buckets = new Map();

  return (req, res, next) => {
    if (skip(req)) return next();

    const now = Date.now();
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const bucket = buckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      return res.status(429).json({
        error: 'Too many requests',
        message: 'Please wait before trying again.'
      });
    }

    if (buckets.size > 5000) {
      for (const [bucketKey, value] of buckets.entries()) {
        if (now > value.resetAt) buckets.delete(bucketKey);
      }
    }

    next();
  };
}

function redact(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redact);

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => (
      SENSITIVE_KEYS.has(key) || SENSITIVE_KEYS.has(key.toLowerCase())
        ? [key, '[REDACTED]']
        : [key, redact(item)]
    ))
  );
}

function safeRequestUrl(req) {
  try {
    const url = new URL(req.originalUrl || req.url, 'http://localhost');
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_KEYS.has(key) || SENSITIVE_KEYS.has(key.toLowerCase())) {
        url.searchParams.set(key, '[REDACTED]');
      }
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return req.originalUrl || req.url;
  }
}

module.exports = {
  buildCorsOptions,
  createRateLimiter,
  getAllowedOrigins,
  originGuard,
  redact,
  requestId,
  requireApiToken,
  safeRequestUrl,
  securityHeaders
};
