/**
 * Migration 003: Migrate existing integration configurations to profile_integrations table
 * 
 * This migration automatically moves:
 * - Google Calendar tokens (googleCalendarToken) -> profile_integrations
 * - Microsoft tokens (microsoftToken) -> profile_integrations  
 * - Jira config (jiraBaseUrl, jiraEmail, jiraApiToken, jiraProjectKey) -> profile_integrations
 * - Trello config (trelloApiKey, trelloToken, trelloBoardId) -> profile_integrations
 * - Monday.com config (mondayApiToken, mondayBoardId) -> profile_integrations
 * 
 * All existing integrations will be migrated to the default profile (ID=2, "Work")
 */

const { createModuleLogger } = require('../../utils/logger');
const logger = createModuleLogger('MIGRATION-003');

async function runMigration(db, pool, dbType) {
  logger.info('Starting migration 003: Migrate integrations to profiles');

  try {
    if (dbType === 'postgres') {
      await runPostgresMigration(pool);
    } else {
      await runSqliteMigration(db);
    }
    
    logger.info('Migration 003 completed successfully');
  } catch (error) {
    logger.error('Migration 003 failed', error);
    throw error;
  }
}

async function runPostgresMigration(pool) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check if profile_integrations table exists (from migration 002)
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'profile_integrations'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      logger.warn('profile_integrations table does not exist, skipping migration 003');
      await client.query('COMMIT');
      return;
    }
    
    // Migrate Google Calendar token
    await migrateConfigToProfile(client, 'postgres', 
      'googleCalendarToken', 'calendar', 'google', 2);
    
    // Migrate Microsoft token (shared by Calendar and Planner)
    await migrateConfigToProfile(client, 'postgres',
      'microsoftToken', 'calendar', 'microsoft', 2);
    
    // Migrate Jira configuration
    await migrateJiraConfig(client, 'postgres', 2);
    
    // Migrate Trello configuration
    await migrateTrelloConfig(client, 'postgres', 2);
    
    // Migrate Monday.com configuration
    await migrateMondayConfig(client, 'postgres', 2);
    
    await client.query('COMMIT');
    logger.info('PostgreSQL migration 003 completed');
    
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
    logger.warn('profile_integrations table does not exist, skipping migration 003');
    return;
  }
  
  // Migrate Google Calendar token
  await migrateConfigToProfile(db, 'sqlite',
    'googleCalendarToken', 'calendar', 'google', 2);
  
  // Migrate Microsoft token (shared by Calendar and Planner)
  await migrateConfigToProfile(db, 'sqlite',
    'microsoftToken', 'calendar', 'microsoft', 2);
  
  // Migrate Jira configuration
  await migrateJiraConfig(db, 'sqlite', 2);
  
  // Migrate Trello configuration
  await migrateTrelloConfig(db, 'sqlite', 2);
  
  // Migrate Monday.com configuration
  await migrateMondayConfig(db, 'sqlite', 2);
  
  logger.info('SQLite migration 003 completed');
}

/**
 * Migrate a single config key (token) to profile_integrations
 */
async function migrateConfigToProfile(dbOrClient, dbType, configKey, integrationType, integrationName, profileId) {
  try {
    let configRow;
    
    if (dbType === 'postgres') {
      const result = await dbOrClient.query('SELECT value FROM config WHERE key = $1', [configKey]);
      configRow = result.rows[0];
    } else {
      configRow = await dbOrClient.get('SELECT value FROM config WHERE key = ?', [configKey]);
    }
    
    if (!configRow || !configRow.value) {
      logger.info(`No existing config for ${configKey}, skipping migration`);
      return;
    }
    
    // Check if already migrated
    let existingRow;
    if (dbType === 'postgres') {
      const result = await dbOrClient.query(
        'SELECT id FROM profile_integrations WHERE profile_id = $1 AND integration_type = $2 AND integration_name = $3',
        [profileId, integrationType, integrationName]
      );
      existingRow = result.rows[0];
    } else {
      existingRow = await dbOrClient.get(
        'SELECT id FROM profile_integrations WHERE profile_id = ? AND integration_type = ? AND integration_name = ?',
        [profileId, integrationType, integrationName]
      );
    }
    
    if (existingRow) {
      logger.info(`${integrationName} already migrated to profile ${profileId}, skipping`);
      return;
    }
    
    // Insert into profile_integrations
    if (dbType === 'postgres') {
      await dbOrClient.query(
        `INSERT INTO profile_integrations (profile_id, integration_type, integration_name, token_data, is_enabled, created_date, updated_date)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (profile_id, integration_type, integration_name) DO NOTHING`,
        [profileId, integrationType, integrationName, configRow.value, true]
      );
    } else {
      await dbOrClient.run(
        `INSERT OR IGNORE INTO profile_integrations (profile_id, integration_type, integration_name, token_data, is_enabled, created_date, updated_date)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [profileId, integrationType, integrationName, configRow.value, true]
      );
    }
    
    logger.info(`Migrated ${configKey} -> profile_integrations (${integrationType}/${integrationName}) for profile ${profileId}`);
    
    // Delete from old config table
    if (dbType === 'postgres') {
      await dbOrClient.query('DELETE FROM config WHERE key = $1', [configKey]);
    } else {
      await dbOrClient.run('DELETE FROM config WHERE key = ?', [configKey]);
    }
    
    logger.info(`Deleted ${configKey} from config table`);
    
  } catch (error) {
    logger.error(`Failed to migrate ${configKey}:`, error.message);
    // Don't throw - continue with other migrations
  }
}

/**
 * Migrate Jira configuration (4 keys combined into JSON)
 */
async function migrateJiraConfig(dbOrClient, dbType, profileId) {
  try {
    let baseUrlRow, emailRow, apiTokenRow, projectKeyRow;
    
    if (dbType === 'postgres') {
      const baseUrlResult = await dbOrClient.query('SELECT value FROM config WHERE key = $1', ['jiraBaseUrl']);
      const emailResult = await dbOrClient.query('SELECT value FROM config WHERE key = $1', ['jiraEmail']);
      const apiTokenResult = await dbOrClient.query('SELECT value FROM config WHERE key = $1', ['jiraApiToken']);
      const projectKeyResult = await dbOrClient.query('SELECT value FROM config WHERE key = $1', ['jiraProjectKey']);
      
      baseUrlRow = baseUrlResult.rows[0];
      emailRow = emailResult.rows[0];
      apiTokenRow = apiTokenResult.rows[0];
      projectKeyRow = projectKeyResult.rows[0];
    } else {
      baseUrlRow = await dbOrClient.get('SELECT value FROM config WHERE key = ?', ['jiraBaseUrl']);
      emailRow = await dbOrClient.get('SELECT value FROM config WHERE key = ?', ['jiraEmail']);
      apiTokenRow = await dbOrClient.get('SELECT value FROM config WHERE key = ?', ['jiraApiToken']);
      projectKeyRow = await dbOrClient.get('SELECT value FROM config WHERE key = ?', ['jiraProjectKey']);
    }
    
    if (!baseUrlRow && !emailRow && !apiTokenRow && !projectKeyRow) {
      logger.info('No existing Jira config, skipping migration');
      return;
    }
    
    // Check if already migrated
    let existingRow;
    if (dbType === 'postgres') {
      const result = await dbOrClient.query(
        'SELECT id FROM profile_integrations WHERE profile_id = $1 AND integration_type = $2 AND integration_name = $3',
        [profileId, 'task', 'jira']
      );
      existingRow = result.rows[0];
    } else {
      existingRow = await dbOrClient.get(
        'SELECT id FROM profile_integrations WHERE profile_id = ? AND integration_type = ? AND integration_name = ?',
        [profileId, 'task', 'jira']
      );
    }
    
    if (existingRow) {
      logger.info(`Jira already migrated to profile ${profileId}, skipping`);
      return;
    }
    
    // Combine into JSON
    const jiraConfig = {
      baseUrl: baseUrlRow?.value || '',
      email: emailRow?.value || '',
      apiToken: apiTokenRow?.value || '',
      projectKey: projectKeyRow?.value || ''
    };
    
    // Insert into profile_integrations
    if (dbType === 'postgres') {
      await dbOrClient.query(
        `INSERT INTO profile_integrations (profile_id, integration_type, integration_name, token_data, is_enabled, created_date, updated_date)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (profile_id, integration_type, integration_name) DO NOTHING`,
        [profileId, 'task', 'jira', JSON.stringify(jiraConfig), true]
      );
    } else {
      await dbOrClient.run(
        `INSERT OR IGNORE INTO profile_integrations (profile_id, integration_type, integration_name, token_data, is_enabled, created_date, updated_date)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [profileId, 'task', 'jira', JSON.stringify(jiraConfig), true]
      );
    }
    
    logger.info(`Migrated Jira config -> profile_integrations for profile ${profileId}`);
    
    // Delete from old config table
    if (dbType === 'postgres') {
      await dbOrClient.query('DELETE FROM config WHERE key IN ($1, $2, $3, $4)', 
        ['jiraBaseUrl', 'jiraEmail', 'jiraApiToken', 'jiraProjectKey']);
    } else {
      await dbOrClient.run('DELETE FROM config WHERE key IN (?, ?, ?, ?)', 
        ['jiraBaseUrl', 'jiraEmail', 'jiraApiToken', 'jiraProjectKey']);
    }
    
    logger.info('Deleted Jira config keys from config table');
    
  } catch (error) {
    logger.error('Failed to migrate Jira config:', error.message);
    // Don't throw - continue with other migrations
  }
}

/**
 * Migrate Trello configuration (3 keys combined into JSON)
 */
async function migrateTrelloConfig(dbOrClient, dbType, profileId) {
  try {
    let apiKeyRow, tokenRow, boardIdRow;
    
    if (dbType === 'postgres') {
      const apiKeyResult = await dbOrClient.query('SELECT value FROM config WHERE key = $1', ['trelloApiKey']);
      const tokenResult = await dbOrClient.query('SELECT value FROM config WHERE key = $1', ['trelloToken']);
      const boardIdResult = await dbOrClient.query('SELECT value FROM config WHERE key = $1', ['trelloBoardId']);
      
      apiKeyRow = apiKeyResult.rows[0];
      tokenRow = tokenResult.rows[0];
      boardIdRow = boardIdResult.rows[0];
    } else {
      apiKeyRow = await dbOrClient.get('SELECT value FROM config WHERE key = ?', ['trelloApiKey']);
      tokenRow = await dbOrClient.get('SELECT value FROM config WHERE key = ?', ['trelloToken']);
      boardIdRow = await dbOrClient.get('SELECT value FROM config WHERE key = ?', ['trelloBoardId']);
    }
    
    if (!apiKeyRow && !tokenRow && !boardIdRow) {
      logger.info('No existing Trello config, skipping migration');
      return;
    }
    
    // Check if already migrated
    let existingRow;
    if (dbType === 'postgres') {
      const result = await dbOrClient.query(
        'SELECT id FROM profile_integrations WHERE profile_id = $1 AND integration_type = $2 AND integration_name = $3',
        [profileId, 'task', 'trello']
      );
      existingRow = result.rows[0];
    } else {
      existingRow = await dbOrClient.get(
        'SELECT id FROM profile_integrations WHERE profile_id = ? AND integration_type = ? AND integration_name = ?',
        [profileId, 'task', 'trello']
      );
    }
    
    if (existingRow) {
      logger.info(`Trello already migrated to profile ${profileId}, skipping`);
      return;
    }
    
    // Combine into JSON
    const trelloConfig = {
      apiKey: apiKeyRow?.value || '',
      token: tokenRow?.value || '',
      boardId: boardIdRow?.value || ''
    };
    
    // Insert into profile_integrations
    if (dbType === 'postgres') {
      await dbOrClient.query(
        `INSERT INTO profile_integrations (profile_id, integration_type, integration_name, token_data, is_enabled, created_date, updated_date)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (profile_id, integration_type, integration_name) DO NOTHING`,
        [profileId, 'task', 'trello', JSON.stringify(trelloConfig), true]
      );
    } else {
      await dbOrClient.run(
        `INSERT OR IGNORE INTO profile_integrations (profile_id, integration_type, integration_name, token_data, is_enabled, created_date, updated_date)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [profileId, 'task', 'trello', JSON.stringify(trelloConfig), true]
      );
    }
    
    logger.info(`Migrated Trello config -> profile_integrations for profile ${profileId}`);
    
    // Delete from old config table
    if (dbType === 'postgres') {
      await dbOrClient.query('DELETE FROM config WHERE key IN ($1, $2, $3)', 
        ['trelloApiKey', 'trelloToken', 'trelloBoardId']);
    } else {
      await dbOrClient.run('DELETE FROM config WHERE key IN (?, ?, ?)', 
        ['trelloApiKey', 'trelloToken', 'trelloBoardId']);
    }
    
    logger.info('Deleted Trello config keys from config table');
    
  } catch (error) {
    logger.error('Failed to migrate Trello config:', error.message);
    // Don't throw - continue with other migrations
  }
}

/**
 * Migrate Monday.com configuration (2 keys combined into JSON)
 */
async function migrateMondayConfig(dbOrClient, dbType, profileId) {
  try {
    let apiTokenRow, boardIdRow;
    
    if (dbType === 'postgres') {
      const apiTokenResult = await dbOrClient.query('SELECT value FROM config WHERE key = $1', ['mondayApiToken']);
      const boardIdResult = await dbOrClient.query('SELECT value FROM config WHERE key = $1', ['mondayBoardId']);
      
      apiTokenRow = apiTokenResult.rows[0];
      boardIdRow = boardIdResult.rows[0];
    } else {
      apiTokenRow = await dbOrClient.get('SELECT value FROM config WHERE key = ?', ['mondayApiToken']);
      boardIdRow = await dbOrClient.get('SELECT value FROM config WHERE key = ?', ['mondayBoardId']);
    }
    
    if (!apiTokenRow && !boardIdRow) {
      logger.info('No existing Monday.com config, skipping migration');
      return;
    }
    
    // Check if already migrated
    let existingRow;
    if (dbType === 'postgres') {
      const result = await dbOrClient.query(
        'SELECT id FROM profile_integrations WHERE profile_id = $1 AND integration_type = $2 AND integration_name = $3',
        [profileId, 'task', 'monday']
      );
      existingRow = result.rows[0];
    } else {
      existingRow = await dbOrClient.get(
        'SELECT id FROM profile_integrations WHERE profile_id = ? AND integration_type = ? AND integration_name = ?',
        [profileId, 'task', 'monday']
      );
    }
    
    if (existingRow) {
      logger.info(`Monday.com already migrated to profile ${profileId}, skipping`);
      return;
    }
    
    // Combine into JSON
    const mondayConfig = {
      apiToken: apiTokenRow?.value || '',
      boardId: boardIdRow?.value || ''
    };
    
    // Insert into profile_integrations
    if (dbType === 'postgres') {
      await dbOrClient.query(
        `INSERT INTO profile_integrations (profile_id, integration_type, integration_name, token_data, is_enabled, created_date, updated_date)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (profile_id, integration_type, integration_name) DO NOTHING`,
        [profileId, 'task', 'monday', JSON.stringify(mondayConfig), true]
      );
    } else {
      await dbOrClient.run(
        `INSERT OR IGNORE INTO profile_integrations (profile_id, integration_type, integration_name, token_data, is_enabled, created_date, updated_date)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [profileId, 'task', 'monday', JSON.stringify(mondayConfig), true]
      );
    }
    
    logger.info(`Migrated Monday.com config -> profile_integrations for profile ${profileId}`);
    
    // Delete from old config table
    if (dbType === 'postgres') {
      await dbOrClient.query('DELETE FROM config WHERE key IN ($1, $2)', 
        ['mondayApiToken', 'mondayBoardId']);
    } else {
      await dbOrClient.run('DELETE FROM config WHERE key IN (?, ?)', 
        ['mondayApiToken', 'mondayBoardId']);
    }
    
    logger.info('Deleted Monday.com config keys from config table');
    
  } catch (error) {
    logger.error('Failed to migrate Monday.com config:', error.message);
    // Don't throw - continue with other migrations
  }
}

module.exports = {
  runMigration
};
