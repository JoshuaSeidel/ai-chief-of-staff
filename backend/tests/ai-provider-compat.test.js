const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();

const {
  buildOpenAIChatParams,
  isOpenAIUnsupportedParameterError
} = require('../services/ai-service');
const migration009 = require('../database/migrations/009_ai_provider_credentials');

function run(db, query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, (err) => (err ? reject(err) : resolve()));
  });
}

function all(db, query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

test('OpenAI chat params use max_completion_tokens and developer role for current reasoning models', () => {
  const params = buildOpenAIChatParams({
    model: 'gpt-5',
    systemPrompt: 'Follow system instructions.',
    messages: [{ role: 'user', content: 'Generate a brief.' }],
    tokens: 1200,
    temperature: 0.7
  });

  assert.equal(params.max_completion_tokens, 1200);
  assert.equal(params.max_tokens, undefined);
  assert.equal(params.temperature, undefined);
  assert.equal(params.messages[0].role, 'developer');
});

test('OpenAI chat params keep system role and temperature for GPT-4o style models', () => {
  const params = buildOpenAIChatParams({
    model: 'gpt-4o',
    systemPrompt: 'Follow system instructions.',
    messages: [{ role: 'user', content: 'Generate a brief.' }],
    tokens: 1200,
    temperature: 0.4
  });

  assert.equal(params.max_completion_tokens, 1200);
  assert.equal(params.temperature, 0.4);
  assert.equal(params.messages[0].role, 'system');
});

test('OpenAI chat params can fall back to max_tokens for legacy models', () => {
  const params = buildOpenAIChatParams({
    model: 'gpt-3.5-turbo',
    systemPrompt: null,
    messages: [{ role: 'user', content: 'Ping.' }],
    tokens: 100,
    temperature: 0.2,
    tokenParameter: 'max_tokens'
  });

  assert.equal(params.max_tokens, 100);
  assert.equal(params.max_completion_tokens, undefined);
});

test('OpenAI unsupported parameter detection reads provider error messages', () => {
  const error = new Error("Unsupported parameter: 'max_tokens' is not supported with this model.");

  assert.equal(isOpenAIUnsupportedParameterError(error, 'max_tokens'), true);
  assert.equal(isOpenAIUnsupportedParameterError(error, 'temperature'), false);
});

test('migration 009 creates named AI credentials from legacy config rows', async () => {
  const db = new sqlite3.Database(':memory:');

  try {
    await run(db, 'CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    await run(db, 'INSERT INTO config (key, value) VALUES (?, ?)', ['openaiApiKey', 'sk-openai-test']);
    await run(db, 'INSERT INTO config (key, value) VALUES (?, ?)', ['anthropicApiKey', 'sk-ant-test']);
    await run(db, 'INSERT INTO config (key, value) VALUES (?, ?)', ['ollamaBaseUrl', 'http://ollama:11434']);

    await migration009.runMigration(db, null, 'sqlite');

    const rows = await all(
      db,
      'SELECT provider, name, secret, base_url, is_default FROM ai_provider_credentials ORDER BY provider'
    );

    assert.deepEqual(rows.map(row => row.provider), ['anthropic', 'ollama', 'openai']);
    assert.equal(rows.find(row => row.provider === 'openai').secret, 'sk-openai-test');
    assert.equal(rows.find(row => row.provider === 'anthropic').secret, 'sk-ant-test');
    assert.equal(rows.find(row => row.provider === 'ollama').base_url, 'http://ollama:11434');
    assert.equal(rows.every(row => row.is_default === 1), true);
  } finally {
    db.close();
  }
});
