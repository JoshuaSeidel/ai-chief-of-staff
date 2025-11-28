const express = require('express');
const router = express.Router();
const { getDb, getDbType, migrateToPostgres } = require('../database/db');
const configManager = require('../config/manager');
const { createModuleLogger } = require('../utils/logger');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const logger = createModuleLogger('CONFIG');

/**
 * Get system configuration from /app/data/config.json
 * Also includes actual runtime database type
 */
router.get('/system', (req, res) => {
  try {
    logger.info('Fetching system configuration');
    const config = configManager.loadConfig();
    const actualDbType = getDbType(); // What's actually being used
    
    // Add runtime info
    const response = { ...config };
    response._runtime = {
      actualDbType: actualDbType,
      configFileDbType: config.dbType || 'sqlite'
    };
    
    // Don't send passwords in response
    if (response.postgres) {
      if (response.postgres.password) {
        response.postgres.password = '********';
      }
    }
    
    res.json(response);
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
    
    logger.info(`Updating config key: ${key} (type: ${typeof value}, length: ${value?.length || 0})`);
    const db = getDb();
    
    // Always store as plain string - never JSON.stringify strings
    // Express has already parsed the JSON request body, so value is the actual value
    const storedValue = String(value);
    
    logger.info(`Storing value as plain string (length: ${storedValue.length})`);
    
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
      // Always store as plain string - Express has already parsed JSON
      const storedValue = String(value);
      logger.info(`Bulk update: ${key} = ${storedValue.substring(0, 20)}... (length: ${storedValue.length})`);
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
 * Get version information (commit hash, build date, etc.)
 * MUST be before /:key route to avoid route conflict
 */
router.get('/version', (req, res) => {
  try {
    let commitHash = null;
    let backendVersion = null;
    let frontendVersion = null;
    let buildDate = null;
    
    // Priority 1: Environment variables (set during Docker build)
    backendVersion = process.env.VERSION || null;
    commitHash = process.env.COMMIT_HASH || null;
    buildDate = process.env.BUILD_DATE || null;
    
    // Priority 2: Try to get commit hash from git (for local development)
    if (!commitHash) {
      try {
        commitHash = execSync('git rev-parse --short HEAD', { 
          cwd: path.join(__dirname, '..', '..'),
          encoding: 'utf8',
          timeout: 2000
        }).trim();
      } catch (gitError) {
        // Git not available or not in a git repo
      }
    }
    
    // Priority 3: Get versions from package.json files (always read from source of truth)
    try {
      const backendPackagePath = path.join(__dirname, '..', 'package.json');
      if (fs.existsSync(backendPackagePath)) {
        const backendPackageJson = JSON.parse(fs.readFileSync(backendPackagePath, 'utf8'));
        backendVersion = backendVersion || backendPackageJson.version || null;
      }
    } catch (pkgError) {
      logger.warn('Failed to read backend package.json', pkgError);
    }
    
    // Get frontend version
    try {
      const frontendPackagePath = path.join(__dirname, '..', '..', 'frontend', 'package.json');
      if (fs.existsSync(frontendPackagePath)) {
        const frontendPackageJson = JSON.parse(fs.readFileSync(frontendPackagePath, 'utf8'));
        frontendVersion = frontendPackageJson.version || null;
      }
    } catch (pkgError) {
      logger.warn('Failed to read frontend package.json', pkgError);
    }
    
    // Build date fallback
    if (!buildDate) {
      buildDate = new Date().toISOString();
    }
    
    res.json({
      version: backendVersion || 'unknown', // Keep for backward compatibility
      backendVersion: backendVersion || 'unknown',
      frontendVersion: frontendVersion || 'unknown',
      commitHash: commitHash || 'unknown',
      buildDate
    });
  } catch (err) {
    logger.error('Error fetching version info', err);
    res.status(500).json({ 
      error: 'Error fetching version information',
      message: err.message 
    });
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
    
    // Return value as-is (it's stored as a plain string)
    logger.info(`Returning config value for ${key} (length: ${row.value?.length || 0})`);
    res.json({ key, value: row.value });
  } catch (err) {
    logger.error(`Error fetching config key: ${req.params.key}`, err);
    res.status(500).json({ error: 'Error fetching configuration', message: err.message });
  }
});

/**
 * Health check for config system - verifies database connection and table
 */
router.get('/health', async (req, res) => {
  try {
    const db = getDb();
    const dbType = getDbType();
    
    // Try to query the config table
    let tableExists = false;
    let rowCount = 0;
    let sampleKeys = [];
    
    try {
      const rows = await db.all('SELECT key FROM config LIMIT 5');
      tableExists = true;
      rowCount = rows.length;
      sampleKeys = rows.map(r => r.key);
    } catch (tableError) {
      tableExists = false;
    }
    
    res.json({
      status: 'ok',
      database: {
        type: dbType,
        connected: true,
        tableExists,
        rowCount,
        sampleKeys
      }
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      error: err.message,
      database: {
        type: getDbType(),
        connected: false
      }
    });
  }
});

/**
 * Debug endpoint to check what's actually stored in the database
 */
router.get('/debug/raw/:key', async (req, res) => {
  try {
    const key = req.params.key;
    logger.info(`DEBUG: Fetching raw config key: ${key}`);
    
    const db = getDb();
    const row = await db.get('SELECT key, value, updated_date FROM config WHERE key = ?', [key]);
    
    if (!row) {
      return res.json({ 
        found: false, 
        key,
        message: 'Key not found in database' 
      });
    }
    
    // Return debug info (mask sensitive values)
    const isSensitive = key.toLowerCase().includes('key') || key.toLowerCase().includes('password');
    const displayValue = isSensitive && row.value ? 
      `${row.value.substring(0, 10)}... (length: ${row.value.length})` : 
      row.value;
    
    res.json({
      found: true,
      key: row.key,
      valueLength: row.value ? row.value.length : 0,
      valueType: typeof row.value,
      valueStartsWith: row.value ? row.value.substring(0, 8) : null,
      valueEndsWith: row.value ? row.value.substring(row.value.length - 8) : null,
      displayValue,
      startsWithQuote: row.value ? row.value.startsWith('"') : false,
      endsWithQuote: row.value ? row.value.endsWith('"') : false,
      updatedDate: row.updated_date
    });
  } catch (err) {
    logger.error(`Error in debug endpoint:`, err);
    res.status(500).json({ error: 'Error fetching debug info', message: err.message });
  }
});

module.exports = router;
