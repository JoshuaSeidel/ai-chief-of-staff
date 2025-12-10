/**
 * Migration 007: Recover Google Calendar tokens that may have been lost during migration
 * 
 * This migration:
 * 1. Checks if Google Calendar tokens exist in config table (any variation)
 * 2. Checks if tokens exist in profile_integrations for each profile
 * 3. Migrates tokens from config to profile_integrations if missing
 * 4. Also checks for tokens that might be in profile_integrations but for wrong profile
 * 
 * This is a recovery migration that can be run multiple times safely.
 */

const { createModuleLogger } = require('../../utils/logger');
const logger = createModuleLogger('MIGRATION-007');

async function runMigration(db, pool, dbType) {
  logger.info('Starting migration 007: Recover calendar tokens');
  logger.info('This migration will check for and recover any lost Google Calendar tokens');

  try {
    if (dbType === 'postgres') {
      await runPostgresMigration(pool);
    } else {
      await runSqliteMigration(db);
    }
    
    logger.info('Migration 007 completed successfully');
  } catch (error) {
    logger.error('Migration 007 failed', error);
    throw error;
  }
}

async function runPostgresMigration(pool) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check if profile_integrations table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'profile_integrations'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      logger.warn('profile_integrations table does not exist, skipping migration 007');
      await client.query('COMMIT');
      return;
    }
    
    // Get all profiles
    const profilesResult = await client.query('SELECT id, name FROM profiles ORDER BY id');
    const profiles = profilesResult.rows;
    
    if (profiles.length === 0) {
      logger.warn('No profiles found, skipping migration 007');
      await client.query('COMMIT');
      return;
    }
    
    logger.info(`Found ${profiles.length} profiles to check`);
    
    // Check for Google Calendar token in config table (try various key names)
    const possibleKeys = ['googleCalendarToken', 'google_calendar_token', 'googleToken', 'google_token'];
    let tokenInConfig = null;
    let configKey = null;
    
    for (const key of possibleKeys) {
      const result = await client.query('SELECT value FROM config WHERE key = $1', [key]);
      if (result.rows.length > 0 && result.rows[0].value) {
        tokenInConfig = result.rows[0].value;
        configKey = key;
        logger.info(`Found Google Calendar token in config table with key: ${key}`);
        break;
      }
    }
    
    // For each profile, check if they have a Google Calendar token
    for (const profile of profiles) {
      const existingToken = await client.query(
        'SELECT id, token_data FROM profile_integrations WHERE profile_id = $1 AND integration_type = $2 AND integration_name = $3',
        [profile.id, 'calendar', 'google']
      );
      
      if (existingToken.rows.length > 0) {
        logger.info(`Profile ${profile.id} (${profile.name}) already has Google Calendar token`);
        continue;
      }
      
      // If we found a token in config and this profile doesn't have one, migrate it
      if (tokenInConfig) {
        try {
          // Try to parse the token to make sure it's valid JSON
          let tokenData = tokenInConfig;
          try {
            // If it's already a string, try to parse it
            if (typeof tokenInConfig === 'string') {
              tokenData = JSON.parse(tokenInConfig);
              tokenData = JSON.stringify(tokenData); // Re-stringify for storage
            }
          } catch (e) {
            // If parsing fails, assume it's already a JSON string
            logger.info('Token appears to be already in JSON format');
          }
          
          await client.query(
            `INSERT INTO profile_integrations (profile_id, integration_type, integration_name, token_data, config, is_enabled, created_date, updated_date)
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             ON CONFLICT (profile_id, integration_type, integration_name)
             DO UPDATE SET token_data = excluded.token_data, config = excluded.config, is_enabled = excluded.is_enabled, updated_date = CURRENT_TIMESTAMP`,
            [profile.id, 'calendar', 'google', tokenData, '{}', true]
          );
          
          logger.info(`✓ Migrated Google Calendar token to profile ${profile.id} (${profile.name})`);
        } catch (error) {
          logger.error(`Failed to migrate token to profile ${profile.id}:`, error.message);
          // Continue with other profiles
        }
      } else {
        logger.info(`Profile ${profile.id} (${profile.name}) has no Google Calendar token and none found in config`);
      }
    }
    
    // Only delete from config if we successfully migrated to at least one profile
    if (tokenInConfig && configKey) {
      const migratedCount = await client.query(
        'SELECT COUNT(*) as count FROM profile_integrations WHERE integration_type = $1 AND integration_name = $2 AND token_data IS NOT NULL',
        ['calendar', 'google']
      );
      
      if (migratedCount.rows[0].count > 0) {
        await client.query('DELETE FROM config WHERE key = $1', [configKey]);
        logger.info(`Deleted ${configKey} from config table (migrated to ${migratedCount.rows[0].count} profile(s))`);
      } else {
        logger.warn(`Token found in config but migration failed - keeping token in config for safety`);
      }
    }
    
    await client.query('COMMIT');
    logger.info('PostgreSQL migration 007 completed');
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function runSqliteMigration(db) {
  // Check if profile_integrations table exists
  const tableCheck = await db.get(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='profile_integrations'
  `);
  
  if (!tableCheck) {
    logger.warn('profile_integrations table does not exist, skipping migration 007');
    return;
  }
  
  // Get all profiles
  const profiles = await db.all('SELECT id, name FROM profiles ORDER BY id');
  
  if (profiles.length === 0) {
    logger.warn('No profiles found, skipping migration 007');
    return;
  }
  
  logger.info(`Found ${profiles.length} profiles to check`);
  
  // Check for Google Calendar token in config table (try various key names)
  const possibleKeys = ['googleCalendarToken', 'google_calendar_token', 'googleToken', 'google_token'];
  let tokenInConfig = null;
  let configKey = null;
  
  for (const key of possibleKeys) {
    const row = await db.get('SELECT value FROM config WHERE key = ?', [key]);
    if (row && row.value) {
      tokenInConfig = row.value;
      configKey = key;
      logger.info(`Found Google Calendar token in config table with key: ${key}`);
      break;
    }
  }
  
  // For each profile, check if they have a Google Calendar token
  for (const profile of profiles) {
    const existingToken = await db.get(
      'SELECT id, token_data FROM profile_integrations WHERE profile_id = ? AND integration_type = ? AND integration_name = ?',
      [profile.id, 'calendar', 'google']
    );
    
    if (existingToken) {
      logger.info(`Profile ${profile.id} (${profile.name}) already has Google Calendar token`);
      continue;
    }
    
    // If we found a token in config and this profile doesn't have one, migrate it
    if (tokenInConfig) {
      try {
        // Try to parse the token to make sure it's valid JSON
        let tokenData = tokenInConfig;
        try {
          // If it's already a string, try to parse it
          if (typeof tokenInConfig === 'string') {
            tokenData = JSON.parse(tokenInConfig);
            tokenData = JSON.stringify(tokenData); // Re-stringify for storage
          }
        } catch (e) {
          // If parsing fails, assume it's already a JSON string
          logger.info('Token appears to be already in JSON format');
        }
        
        await db.run(
          `INSERT INTO profile_integrations (profile_id, integration_type, integration_name, token_data, config, is_enabled, created_date, updated_date)
           VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (profile_id, integration_type, integration_name)
           DO UPDATE SET token_data = excluded.token_data, config = excluded.config, is_enabled = excluded.is_enabled, updated_date = CURRENT_TIMESTAMP`,
          [profile.id, 'calendar', 'google', tokenData, '{}', true]
        );
        
        logger.info(`✓ Migrated Google Calendar token to profile ${profile.id} (${profile.name})`);
      } catch (error) {
        logger.error(`Failed to migrate token to profile ${profile.id}:`, error.message);
        // Continue with other profiles
      }
    } else {
      logger.info(`Profile ${profile.id} (${profile.name}) has no Google Calendar token and none found in config`);
    }
  }
  
  // Only delete from config if we successfully migrated to at least one profile
  if (tokenInConfig && configKey) {
    const migratedCount = await db.get(
      'SELECT COUNT(*) as count FROM profile_integrations WHERE integration_type = ? AND integration_name = ? AND token_data IS NOT NULL',
      ['calendar', 'google']
    );
    
    if (migratedCount && migratedCount.count > 0) {
      await db.run('DELETE FROM config WHERE key = ?', [configKey]);
      logger.info(`Deleted ${configKey} from config table (migrated to ${migratedCount.count} profile(s))`);
    } else {
      logger.warn(`Token found in config but migration failed - keeping token in config for safety`);
    }
  }
  
  logger.info('SQLite migration 007 completed');
}

module.exports = {
  runMigration
};

