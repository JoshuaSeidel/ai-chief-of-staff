/**
 * Migration 009: Named AI provider credentials
 *
 * Stores multiple provider credentials in database rows so profiles can select
 * work/personal keys without overwriting the provider's only global secret.
 */

const { createModuleLogger } = require('../../utils/logger');
const logger = createModuleLogger('MIGRATION-009');

const LEGACY_CREDENTIALS = [
  {
    provider: 'anthropic',
    name: 'Default Anthropic',
    configKey: 'anthropicApiKey',
    column: 'secret'
  },
  {
    provider: 'openai',
    name: 'Default OpenAI',
    configKey: 'openaiApiKey',
    column: 'secret'
  },
  {
    provider: 'ollama',
    name: 'Default Ollama',
    configKey: 'ollamaBaseUrl',
    column: 'base_url',
    defaultValue: 'http://localhost:11434'
  }
];

async function migrateLegacyPostgres(pool) {
  for (const legacy of LEGACY_CREDENTIALS) {
    const existing = await pool.query(
      'SELECT id FROM ai_provider_credentials WHERE provider = $1 LIMIT 1',
      [legacy.provider]
    );

    if (existing.rows.length > 0) continue;

    const config = await pool.query(
      'SELECT value FROM config WHERE key = $1',
      [legacy.configKey]
    );
    const value = config.rows[0]?.value || legacy.defaultValue || '';

    if (!value && legacy.provider !== 'ollama') continue;

    await pool.query(
      `INSERT INTO ai_provider_credentials
       (provider, name, secret, base_url, is_default, created_date, updated_date)
       VALUES ($1, $2, $3, $4, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (provider, name) DO NOTHING`,
      [
        legacy.provider,
        legacy.name,
        legacy.column === 'secret' ? value : '',
        legacy.column === 'base_url' ? value : ''
      ]
    );
  }
}

function sqliteGet(db, query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => (err ? reject(err) : resolve(row || null)));
  });
}

function sqliteRun(db, query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, (err) => (err ? reject(err) : resolve()));
  });
}

async function migrateLegacySQLite(db) {
  for (const legacy of LEGACY_CREDENTIALS) {
    const existing = await sqliteGet(
      db,
      'SELECT id FROM ai_provider_credentials WHERE provider = ? LIMIT 1',
      [legacy.provider]
    );

    if (existing) continue;

    const config = await sqliteGet(
      db,
      'SELECT value FROM config WHERE key = ?',
      [legacy.configKey]
    );
    const value = config?.value || legacy.defaultValue || '';

    if (!value && legacy.provider !== 'ollama') continue;

    await sqliteRun(
      db,
      `INSERT OR IGNORE INTO ai_provider_credentials
       (provider, name, secret, base_url, is_default, created_date, updated_date)
       VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        legacy.provider,
        legacy.name,
        legacy.column === 'secret' ? value : '',
        legacy.column === 'base_url' ? value : ''
      ]
    );
  }
}

async function runMigration(db, pool, dbType) {
  logger.info('Starting migration 009: named AI provider credentials');

  if (dbType === 'postgres' || dbType === 'postgresql') {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_provider_credentials (
        id SERIAL PRIMARY KEY,
        provider TEXT NOT NULL,
        name TEXT NOT NULL,
        secret TEXT,
        base_url TEXT,
        is_default BOOLEAN DEFAULT FALSE,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (provider, name)
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_provider_credentials_provider
      ON ai_provider_credentials(provider)
    `);

    await migrateLegacyPostgres(pool);
  } else {
    await sqliteRun(db, `
      CREATE TABLE IF NOT EXISTS ai_provider_credentials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        name TEXT NOT NULL,
        secret TEXT,
        base_url TEXT,
        is_default INTEGER DEFAULT 0,
        created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (provider, name)
      )
    `);

    await sqliteRun(db, `
      CREATE INDEX IF NOT EXISTS idx_ai_provider_credentials_provider
      ON ai_provider_credentials(provider)
    `);

    await migrateLegacySQLite(db);
  }

  logger.info('Migration 009 completed successfully');
}

module.exports = { runMigration };
