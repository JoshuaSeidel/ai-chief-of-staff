/**
 * Migration 005: Add AI Provider Preferences to Profiles
 * 
 * Moves AI provider settings (aiProvider, claudeModel, openaiModel, ollamaModel, etc.)
 * from global config table to per-profile preferences JSON field.
 * 
 * This allows each profile to have its own AI model configuration:
 * - Personal profile might use GPT-4o for casual tasks
 * - Work profile might use Claude Sonnet for professional work
 */

const { createModuleLogger } = require('../../utils/logger');
const logger = createModuleLogger('MIGRATION-005');

/**
 * Main migration entry point
 */
async function runMigration(db, dbType) {
  logger.info('='.repeat(60));
  logger.info('MIGRATION 005: Add AI Provider Preferences to Profiles');
  logger.info('='.repeat(60));

  if (dbType === 'postgres') {
    return await runPostgresMigration(db);
  } else {
    return await runSqliteMigration(db);
  }
}

/**
 * PostgreSQL migration
 */
async function runPostgresMigration(pool) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check if profiles table exists
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'profiles'
      )
    `);
    
    if (!tableExists.rows[0].exists) {
      logger.info('Profiles table does not exist, skipping migration');
      await client.query('COMMIT');
      return;
    }
    
    // Migrate AI settings from config to profile preferences
    await migrateAISettingsToProfiles(client, 'postgres');
    
    await client.query('COMMIT');
    logger.info('✓ MIGRATION 005 COMPLETE (PostgreSQL)');
    logger.info('='.repeat(60));
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Migration 005 failed (PostgreSQL):', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * SQLite migration
 */
async function runSqliteMigration(db) {
  return new Promise(async (resolve, reject) => {
    try {
      // Check if profiles table exists
      const tableExists = await new Promise((res) => {
        db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='profiles'`, (err, row) => {
          if (err) {
            logger.error('Error checking profiles table:', err);
            res(false);
          } else {
            res(!!row);
          }
        });
      });
      
      if (!tableExists) {
        logger.info('Profiles table does not exist, skipping migration');
        resolve();
        return;
      }
      
      // Migrate AI settings from config to profile preferences
      await migrateAISettingsToProfiles(db, 'sqlite');
      
      logger.info('✓ MIGRATION 005 COMPLETE (SQLite)');
      logger.info('='.repeat(60));
      resolve();
    } catch (error) {
      logger.error('Migration 005 failed (SQLite):', error);
      reject(error);
    }
  });
}

/**
 * Migrate AI provider settings from config table to profile preferences
 */
async function migrateAISettingsToProfiles(dbOrClient, dbType) {
  logger.info('Migrating AI provider settings to profile preferences...');
  
  // AI config keys to migrate
  const aiConfigKeys = [
    'aiProvider',
    'claudeModel',
    'openaiModel',
    'ollamaModel',
    'ollamaBaseUrl',
    'aiMaxTokens',
    'aiTemperature'
  ];
  
  // Get current AI settings from config table
  const currentSettings = {};
  
  for (const key of aiConfigKeys) {
    let value = null;
    
    if (dbType === 'postgres') {
      const result = await dbOrClient.query('SELECT value FROM config WHERE key = $1', [key]);
      value = result.rows.length > 0 ? result.rows[0].value : null;
    } else {
      const row = await new Promise((resolve, reject) => {
        dbOrClient.get('SELECT value FROM config WHERE key = ?', [key], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      value = row ? row.value : null;
    }
    
    if (value) {
      currentSettings[key] = value;
      logger.info(`  Found ${key}: ${key.includes('Key') || key.includes('Token') ? '***' : value}`);
    }
  }
  
  if (Object.keys(currentSettings).length === 0) {
    logger.info('  No AI settings found in config table, using defaults');
    currentSettings.aiProvider = 'anthropic';
    currentSettings.claudeModel = 'claude-sonnet-4-5-20250929';
    currentSettings.openaiModel = 'gpt-4o';
    currentSettings.ollamaModel = 'llama3.1';
    currentSettings.ollamaBaseUrl = 'http://localhost:11434';
    currentSettings.aiMaxTokens = '4096';
    currentSettings.aiTemperature = '0.7';
  }
  
  // Get all profiles
  let profiles = [];
  
  if (dbType === 'postgres') {
    const result = await dbOrClient.query('SELECT id, name, preferences FROM profiles');
    profiles = result.rows;
  } else {
    profiles = await new Promise((resolve, reject) => {
      dbOrClient.all('SELECT id, name, preferences FROM profiles', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }
  
  if (profiles.length === 0) {
    logger.info('  No profiles found, skipping AI settings migration');
    return;
  }
  
  // Update each profile's preferences with AI settings
  for (const profile of profiles) {
    let preferences = {};
    
    try {
      preferences = profile.preferences ? JSON.parse(profile.preferences) : {};
    } catch (e) {
      logger.warn(`  Profile ${profile.name} has invalid JSON preferences, resetting`);
      preferences = {};
    }
    
    // Check if AI settings already exist in preferences
    if (preferences.aiProvider) {
      logger.info(`  Profile ${profile.name} already has AI settings, skipping`);
      continue;
    }
    
    // Add AI settings to preferences
    preferences.aiProvider = currentSettings.aiProvider || 'anthropic';
    preferences.claudeModel = currentSettings.claudeModel || 'claude-sonnet-4-5-20250929';
    preferences.openaiModel = currentSettings.openaiModel || 'gpt-4o';
    preferences.ollamaModel = currentSettings.ollamaModel || 'llama3.1';
    preferences.ollamaBaseUrl = currentSettings.ollamaBaseUrl || 'http://localhost:11434';
    preferences.aiMaxTokens = currentSettings.aiMaxTokens || '4096';
    
    const preferencesJson = JSON.stringify(preferences);
    
    if (dbType === 'postgres') {
      await dbOrClient.query(
        'UPDATE profiles SET preferences = $1, updated_at = NOW() WHERE id = $2',
        [preferencesJson, profile.id]
      );
    } else {
      await new Promise((resolve, reject) => {
        dbOrClient.run(
          "UPDATE profiles SET preferences = ?, updated_at = datetime('now') WHERE id = ?",
          [preferencesJson, profile.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }
    
    logger.info(`  ✓ Migrated AI settings to ${profile.name} profile (provider: ${preferences.aiProvider})`);
  }
  
  logger.info('✓ AI settings migrated to all profiles');
  logger.info('  Note: Global config AI keys NOT deleted - still used as fallback');
}

module.exports = { runMigration };
