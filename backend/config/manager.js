const fs = require('fs');
const path = require('path');

const CONFIG_DIR = process.env.CONFIG_DIR || '/data';
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Simple console logger (can't use winston here as it might not be loaded yet)
const logger = {
  info: (msg) => console.log(`[CONFIG-MANAGER] ${msg}`),
  error: (msg, err) => console.error(`[CONFIG-MANAGER ERROR] ${msg}`, err ? err.message : ''),
  warn: (msg) => console.warn(`[CONFIG-MANAGER WARNING] ${msg}`)
};

// Default configuration
const DEFAULT_CONFIG = {
  dbType: 'sqlite',
  sqlite: {
    path: path.join(CONFIG_DIR, 'ai-chief-of-staff.db')
  },
  postgres: {
    host: 'localhost',
    port: 5432,
    database: 'ai_chief_of_staff',
    user: 'postgres',
    password: ''
  }
};

/**
 * Ensure config directory exists
 */
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    logger.info(`Created config directory: ${CONFIG_DIR}`);
  }
}

/**
 * Load configuration from file
 */
function loadConfig() {
  ensureConfigDir();
  
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      const config = JSON.parse(data);
      logger.info(`Loaded configuration from ${CONFIG_FILE}`);
      logger.info(`Database type: ${config.dbType || 'sqlite'}`);
      return config;
    } else {
      logger.info('No config file found, using defaults');
      saveConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }
  } catch (err) {
    logger.error('Error loading config:', err);
    logger.info('Using default configuration');
    return DEFAULT_CONFIG;
  }
}

/**
 * Save configuration to file
 */
function saveConfig(config) {
  ensureConfigDir();
  
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    logger.info(`Saved configuration to ${CONFIG_FILE}`);
    return true;
  } catch (err) {
    logger.error('Error saving config:', err);
    return false;
  }
}

/**
 * Update specific config values
 */
function updateConfig(updates) {
  const config = loadConfig();
  const newConfig = { ...config, ...updates };
  
  // Deep merge for nested objects like postgres config
  if (updates.postgres && config.postgres) {
    newConfig.postgres = { ...config.postgres, ...updates.postgres };
  }
  if (updates.sqlite && config.sqlite) {
    newConfig.sqlite = { ...config.sqlite, ...updates.sqlite };
  }
  
  logger.info(`Updating configuration with ${Object.keys(updates).length} changes`);
  return saveConfig(newConfig) ? newConfig : config;
}

module.exports = {
  loadConfig,
  saveConfig,
  updateConfig,
  DEFAULT_CONFIG,
  CONFIG_FILE
};
