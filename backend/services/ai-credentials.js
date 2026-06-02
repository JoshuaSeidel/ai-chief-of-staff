const { getDb } = require('../database/db');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('AI-CREDENTIALS');

const PROVIDER_DEFAULTS = {
  anthropic: {
    legacyKey: 'anthropicApiKey',
    defaultName: 'Default Anthropic'
  },
  openai: {
    legacyKey: 'openaiApiKey',
    defaultName: 'Default OpenAI'
  },
  ollama: {
    legacyKey: 'ollamaBaseUrl',
    defaultName: 'Default Ollama',
    defaultBaseUrl: 'http://localhost:11434'
  }
};

function isMaskedSecret(value) {
  return typeof value === 'string' && (/^[*•]{6,}$/.test(value) || value === '***REDACTED***');
}

function normalizeCredential(row, { includeSecret = false } = {}) {
  if (!row) return null;

  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    secret: includeSecret ? row.secret : undefined,
    baseUrl: row.base_url || row.baseUrl || '',
    hasSecret: Boolean(row.secret),
    isDefault: row.is_default === true || row.is_default === 1,
    createdDate: row.created_date || row.createdDate,
    updatedDate: row.updated_date || row.updatedDate
  };
}

async function getProfilePreferences(profileId) {
  if (!profileId) return {};

  const db = getDb();
  const row = await db.get('SELECT preferences FROM profiles WHERE id = ?', [profileId]);
  if (!row?.preferences) return {};

  try {
    return typeof row.preferences === 'string'
      ? JSON.parse(row.preferences)
      : row.preferences;
  } catch (error) {
    logger.warn('Invalid profile preferences JSON while resolving AI credential', {
      profileId,
      error: error.message
    });
    return {};
  }
}

function getSelectedCredentialIdFromPreferences(provider, preferences = {}, serviceName = null) {
  const serviceCredentialKey = serviceName ? `${serviceName}CredentialId` : null;
  const providerCredentialKey = `${provider}CredentialId`;

  return (
    (serviceCredentialKey && preferences[serviceCredentialKey])
    || preferences.aiCredentialIds?.[provider]
    || preferences[providerCredentialKey]
    || null
  );
}

async function getLegacyConfigValue(key) {
  const db = getDb();
  const row = await db.get('SELECT value FROM config WHERE key = ?', [key]);
  return row?.value || '';
}

async function getCredentialById(id, provider = null, { includeSecret = false } = {}) {
  if (!id) return null;

  const db = getDb();
  const row = provider
    ? await db.get('SELECT * FROM ai_provider_credentials WHERE id = ? AND provider = ?', [id, provider])
    : await db.get('SELECT * FROM ai_provider_credentials WHERE id = ?', [id]);

  return normalizeCredential(row, { includeSecret });
}

async function getDefaultCredential(provider, { includeSecret = false } = {}) {
  const db = getDb();
  const row = await db.get(
    `SELECT * FROM ai_provider_credentials
     WHERE provider = ?
     ORDER BY is_default DESC, updated_date DESC, id DESC
     LIMIT 1`,
    [provider]
  );

  return normalizeCredential(row, { includeSecret });
}

async function listCredentials() {
  const db = getDb();
  const rows = await db.all(
    `SELECT id, provider, name, secret, base_url, is_default, created_date, updated_date
     FROM ai_provider_credentials
     ORDER BY provider, is_default DESC, name`
  );

  return rows.map(row => normalizeCredential(row));
}

async function resolveProviderCredential(provider, profileId = 2, options = {}) {
  const normalizedProvider = String(provider || '').trim();
  const defaults = PROVIDER_DEFAULTS[normalizedProvider];

  if (!defaults) {
    throw new Error(`Unsupported AI provider: ${provider}`);
  }

  if (normalizedProvider === 'ollama' && options.baseUrl) {
    return {
      provider: normalizedProvider,
      credentialId: null,
      name: 'Unsaved Ollama URL',
      apiKey: '',
      baseUrl: String(options.baseUrl).trim()
    };
  }

  if (options.apiKey && !isMaskedSecret(options.apiKey)) {
    return {
      provider: normalizedProvider,
      credentialId: null,
      name: 'Unsaved key',
      apiKey: options.apiKey.trim(),
      baseUrl: options.baseUrl || defaults.defaultBaseUrl || ''
    };
  }

  try {
    const preferences = await getProfilePreferences(profileId);
    const selectedId = options.credentialId
      || getSelectedCredentialIdFromPreferences(normalizedProvider, preferences, options.serviceName);

    let credential = selectedId
      ? await getCredentialById(selectedId, normalizedProvider, { includeSecret: true })
      : null;

    if (!credential) {
      credential = await getDefaultCredential(normalizedProvider, { includeSecret: true });
    }

    if (credential) {
      return {
        provider: normalizedProvider,
        credentialId: credential.id,
        name: credential.name,
        apiKey: credential.secret || '',
        baseUrl: credential.baseUrl || defaults.defaultBaseUrl || ''
      };
    }
  } catch (error) {
    if (!/ai_provider_credentials|relation .* does not exist|no such table/i.test(error.message || '')) {
      throw error;
    }
    logger.warn('AI credential table unavailable; falling back to legacy config', {
      provider: normalizedProvider,
      error: error.message
    });
  }

  const legacyValue = await getLegacyConfigValue(defaults.legacyKey);
  return {
    provider: normalizedProvider,
    credentialId: null,
    name: defaults.defaultName,
    apiKey: normalizedProvider === 'ollama' ? '' : legacyValue,
    baseUrl: normalizedProvider === 'ollama'
      ? legacyValue || defaults.defaultBaseUrl
      : options.baseUrl || defaults.defaultBaseUrl || ''
  };
}

async function setProviderDefault(provider, id) {
  const db = getDb();
  await db.run('UPDATE ai_provider_credentials SET is_default = ? WHERE provider = ?', [0, provider]);
  await db.run('UPDATE ai_provider_credentials SET is_default = ? WHERE provider = ? AND id = ?', [1, provider, id]);
}

async function upsertCredential(input = {}) {
  const db = getDb();
  const provider = String(input.provider || '').trim();
  const defaults = PROVIDER_DEFAULTS[provider];

  if (!defaults) {
    throw new Error(`Unsupported AI provider: ${input.provider}`);
  }

  const name = String(input.name || defaults.defaultName).trim() || defaults.defaultName;
  const secret = typeof input.secret === 'string' && !isMaskedSecret(input.secret)
    ? input.secret.trim()
    : null;
  const baseUrl = typeof input.baseUrl === 'string' && input.baseUrl.trim()
    ? input.baseUrl.trim()
    : null;
  const isDefault = input.isDefault === true || input.isDefault === 1;

  let credentialId = input.id ? Number(input.id) : null;

  if (credentialId) {
    const existing = await getCredentialById(credentialId, provider, { includeSecret: true });
    if (!existing) {
      throw new Error(`AI credential ${credentialId} not found for provider ${provider}`);
    }

    const nextSecret = secret !== null ? secret : existing.secret;
    const nextBaseUrl = baseUrl !== null ? baseUrl : existing.baseUrl;

    await db.run(
      `UPDATE ai_provider_credentials
       SET name = ?, secret = ?, base_url = ?, updated_date = CURRENT_TIMESTAMP
       WHERE id = ? AND provider = ?`,
      [name, nextSecret || '', nextBaseUrl || '', credentialId, provider]
    );
  } else {
    const insertResult = await db.run(
      `INSERT INTO ai_provider_credentials
       (provider, name, secret, base_url, is_default, created_date, updated_date)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [provider, name, secret || '', baseUrl || '', isDefault ? 1 : 0]
    );
    credentialId = insertResult.lastID;
  }

  if (isDefault && credentialId) {
    await setProviderDefault(provider, credentialId);
  }

  return getCredentialById(credentialId, provider);
}

async function deleteCredential(id) {
  const db = getDb();
  const credential = await getCredentialById(id);
  if (!credential) return false;

  await db.run('DELETE FROM ai_provider_credentials WHERE id = ?', [id]);
  return true;
}

module.exports = {
  PROVIDER_DEFAULTS,
  isMaskedSecret,
  listCredentials,
  resolveProviderCredential,
  upsertCredential,
  deleteCredential,
  getCredentialById,
  getDefaultCredential,
  getProfilePreferences,
  getSelectedCredentialIdFromPreferences
};
