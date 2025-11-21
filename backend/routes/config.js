const express = require('express');
const router = express.Router();
const { getDb, getDbType, migrateToPostgres } = require('../database/db');
const configManager = require('../config/manager');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('CONFIG');

/**
 * Get system configuration from /app/data/config.json
 */
router.get('/system', (req, res) => {
  try {
    logger.info('Fetching system configuration');
    const config = configManager.loadConfig();
    
    // Don't send passwords in response
    if (config.postgres) {
      const sanitized = { ...config };
      if (sanitized.postgres.password) {
        sanitized.postgres.password = '********';
      }
      return res.json(sanitized);
    }
    
    res.json(config);
  } catch (err) {
    logger.error('Error loading system config', err);
    res.status(500).json({ error: 'Error loading system configuration', message: err.message });
  }
});

/**
 * Update system configuration and optionally migrate
 */
router.post('/system', async (req, res) => {
  try {
    const updates = req.body;
    logger.info('Updating system configuration', { 
      dbType: updates.dbType,
      hasPostgresConfig: !!updates.postgres 
    });
    
    const currentConfig = configManager.loadConfig();
    const dbTypeChanged = updates.dbType && updates.dbType !== currentConfig.dbType;
    
    // Save new configuration
    const newConfig = configManager.updateConfig(updates);
    logger.info('Configuration updated successfully');
    
    // If switching to PostgreSQL, trigger migration
    if (dbTypeChanged && updates.dbType === 'postgres') {
      logger.warn('Database type changed to PostgreSQL, restart required for migration');
      return res.json({ 
        message: 'Configuration saved. Please restart the application to migrate to PostgreSQL.',
        requiresRestart: true
      });
    }
    
    res.json({ message: 'Configuration updated successfully', config: newConfig });
  } catch (err) {
    logger.error('Error updating system config', err);
    res.status(500).json({ error: 'Error updating system configuration', message: err.message });
  }
});

/**
 * Trigger migration manually
 */
router.post('/migrate', async (req, res) => {
  try {
    logger.info('Manual migration triggered');
    const config = configManager.loadConfig();
    
    if (config.dbType !== 'postgres') {
      logger.warn('Migration attempted but target database is not PostgreSQL');
      return res.status(400).json({ error: 'Target database must be PostgreSQL' });
    }
    
    await migrateToPostgres();
    logger.info('Migration completed successfully');
    res.json({ message: 'Migration completed successfully' });
  } catch (err) {
    logger.error('Error during migration', err);
    res.status(500).json({ error: 'Migration failed', details: err.message });
  }
});

/**
 * Get application configuration from database
 */
router.get('/', async (req, res) => {
  try {
    logger.info('Fetching application configuration from database');
    const db = getDb();
    
    // Use unified interface - works for both SQLite and PostgreSQL
    const rows = await db.all('SELECT * FROM config');
    const config = {};
    
    rows.forEach(row => {
      try {
        config[row.key] = JSON.parse(row.value);
      } catch {
        config[row.key] = row.value;
      }
    });
    
    logger.info(`Retrieved ${Object.keys(config).length} config keys`);
    res.json(config);
  } catch (err) {
    logger.error('Error fetching config', err);
    res.status(500).json({ error: 'Error fetching configuration', message: err.message });
  }
});

/**
 * Update configuration in database
 */
router.post('/', async (req, res) => {
  try {
    const { key, value } = req.body;
    
    if (!key || value === undefined) {
      logger.warn('Invalid config update request - missing key or value');
      return res.status(400).json({ error: 'Key and value are required' });
    }
    
    logger.info(`Updating config key: ${key}`);
    const db = getDb();
    
    // Store strings as-is, only stringify complex objects
    const storedValue = typeof value === 'string' ? value : JSON.stringify(value);
    
    // Use unified interface - works for both SQLite and PostgreSQL
    await db.run(
      'INSERT OR REPLACE INTO config (key, value, updated_date) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [key, storedValue]
    );
    
    logger.info(`Config key updated successfully: ${key}`);
    res.json({ message: 'Configuration updated successfully', key, value });
  } catch (err) {
    logger.error('Error updating config', err);
    res.status(500).json({ error: 'Error updating configuration', message: err.message });
  }
});

/**
 * Bulk update configuration in database
 */
router.put('/', async (req, res) => {
  try {
    const config = req.body;
    
    if (!config || typeof config !== 'object') {
      logger.warn('Invalid bulk config update - not an object');
      return res.status(400).json({ error: 'Configuration object required' });
    }
    
    const keys = Object.keys(config);
    logger.info(`Bulk updating ${keys.length} config keys`);
    
    const db = getDb();
    
    // Use unified interface for batch operations
    const stmt = db.prepare('INSERT OR REPLACE INTO config (key, value, updated_date) VALUES (?, ?, CURRENT_TIMESTAMP)');
    
    for (const [key, value] of Object.entries(config)) {
      const storedValue = typeof value === 'string' ? value : JSON.stringify(value);
      stmt.run(key, storedValue);
    }
    
    await stmt.finalize();
    logger.info('Bulk update completed successfully');
    res.json({ message: 'Configuration updated successfully', count: keys.length });
  } catch (err) {
    logger.error('Error in bulk config update', err);
    res.status(500).json({ error: 'Error updating configuration', message: err.message });
  }
});

/**
 * Get specific config value from database
 */
router.get('/:key', async (req, res) => {
  try {
    const key = req.params.key;
    logger.info(`Fetching config key: ${key}`);
    
    const db = getDb();
    
    // Use unified interface - works for both SQLite and PostgreSQL
    const row = await db.get('SELECT value FROM config WHERE key = ?', [key]);
    
    if (!row) {
      logger.warn(`Config key not found: ${key}`);
      return res.status(404).json({ error: 'Configuration key not found' });
    }
    
    try {
      res.json({ key, value: JSON.parse(row.value) });
    } catch {
      res.json({ key, value: row.value });
    }
  } catch (err) {
    logger.error(`Error fetching config key: ${req.params.key}`, err);
    res.status(500).json({ error: 'Error fetching configuration', message: err.message });
  }
});

module.exports = router;
