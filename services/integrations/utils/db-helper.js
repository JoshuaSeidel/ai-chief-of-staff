const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

let db;
let pool;
let dbType;

const logger = {
  info: (msg, ...args) => console.log(`[DB] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[DB ERROR] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[DB WARNING] ${msg}`, ...args)
};

/**
 * Initialize database connection
 * Uses DATABASE_URL environment variable or falls back to SQLite
 */
async function initializeDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  
  try {
    if (databaseUrl && databaseUrl.startsWith('postgresql://')) {
      dbType = 'postgres';
      logger.info('Initializing PostgreSQL connection...');
      await initPostgres(databaseUrl);
    } else {
      dbType = 'sqlite';
      logger.info('Initializing SQLite connection...');
      await initSQLite();
    }
    
    logger.info(`✓ Database initialized: ${dbType}`);
  } catch (error) {
    logger.error(`Failed to initialize database: ${error.message}`);
    // Reset dbType on failure to prevent incorrect behavior
    dbType = null;
    throw new Error(`Database initialization failed: ${error.message}`);
  }
}

/**
 * Initialize SQLite connection
 */
function initSQLite() {
  return new Promise((resolve, reject) => {
    const dbPath = process.env.SQLITE_PATH || '/app/data/ai-chief-of-staff.db';
    const dbDir = path.dirname(dbPath);

    // Ensure data directory exists
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      logger.info(`Created data directory: ${dbDir}`);
    }

    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        logger.error('Error opening SQLite database:', err);
        reject(err);
      } else {
        logger.info(`Connected to SQLite database at ${dbPath}`);
        resolve();
      }
    });
  });
}

/**
 * Initialize PostgreSQL connection
 */
async function initPostgres(databaseUrl) {
  pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  // Test connection
  try {
    const client = await pool.connect();
    logger.info('Connected to PostgreSQL database');
    client.release();
  } catch (err) {
    logger.error('Failed to connect to PostgreSQL:', err);
    throw err;
  }
}

/**
 * Execute a query with unified interface for SQLite and PostgreSQL
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise} - Query results
 */
function query(sql, params = []) {
  if (dbType === 'postgres') {
    return queryPostgres(sql, params);
  } else {
    return querySQLite(sql, params);
  }
}

/**
 * Execute SQLite query
 */
function querySQLite(sql, params = []) {
  return new Promise((resolve, reject) => {
    const method = sql.trim().toUpperCase().startsWith('SELECT') ? 'all' : 'run';
    
    db[method](sql, params, function(err, result) {
      if (err) {
        logger.error(`SQLite query error: ${err.message}`);
        logger.error(`SQL: ${sql}`);
        logger.error(`Params: ${JSON.stringify(params)}`);
        reject(err);
      } else {
        if (method === 'run') {
          resolve({ 
            lastID: this.lastID, 
            changes: this.changes,
            rows: []
          });
        } else {
          resolve({ rows: result || [] });
        }
      }
    });
  });
}

/**
 * Execute PostgreSQL query
 */
async function queryPostgres(sql, params = []) {
  // Convert SQLite placeholders (?) to PostgreSQL ($1, $2, etc.)
  let pgSql = sql;
  let paramIndex = 1;
  while (pgSql.includes('?')) {
    pgSql = pgSql.replace('?', `$${paramIndex}`);
    paramIndex++;
  }
  
  try {
    const result = await pool.query(pgSql, params);
    return {
      rows: result.rows || [],
      rowCount: result.rowCount,
      lastID: result.rows.length > 0 ? result.rows[0].id : null
    };
  } catch (err) {
    logger.error(`PostgreSQL query error: ${err.message}`);
    logger.error(`SQL: ${pgSql}`);
    logger.error(`Params: ${JSON.stringify(params)}`);
    throw err;
  }
}

/**
 * Get configuration value from database
 * @param {string} key - Configuration key
 * @returns {Promise<string|null>} - Configuration value
 */
async function getConfig(key) {
  try {
    const result = await query(
      'SELECT value FROM config WHERE key = ?',
      [key]
    );
    return result.rows.length > 0 ? result.rows[0].value : null;
  } catch (err) {
    logger.error(`Error getting config ${key}:`, err);
    return null;
  }
}

/**
 * Set configuration value in database
 * @param {string} key - Configuration key
 * @param {string} value - Configuration value
 * @returns {Promise<boolean>} - Success status
 */
async function setConfig(key, value) {
  try {
    if (dbType === 'postgres') {
      await query(
        `INSERT INTO config (key, value, updated_at) 
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) 
         DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, value]
      );
    } else {
      await query(
        `INSERT OR REPLACE INTO config (key, value, updated_at)
         VALUES (?, ?, datetime('now'))`,
        [key, value]
      );
    }
    return true;
  } catch (err) {
    logger.error(`Error setting config ${key}:`, err);
    return false;
  }
}

/**
 * Get all configuration values
 * @returns {Promise<Object>} - Configuration object
 */
async function getAllConfig() {
  try {
    const result = await query('SELECT key, value FROM config');
    const config = {};
    result.rows.forEach(row => {
      config[row.key] = row.value;
    });
    return config;
  } catch (err) {
    logger.error('Error getting all config:', err);
    return {};
  }
}

/**
 * Close database connections
 */
async function closeDatabase() {
  if (dbType === 'postgres' && pool) {
    await pool.end();
    logger.info('PostgreSQL connection pool closed');
  } else if (db) {
    db.close((err) => {
      if (err) {
        logger.error('Error closing SQLite database:', err);
      } else {
        logger.info('SQLite database connection closed');
      }
    });
  }
}

module.exports = {
  initializeDatabase,
  query,
  getConfig,
  setConfig,
  getAllConfig,
  closeDatabase,
  getDbType: () => dbType
};
