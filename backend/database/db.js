const sqlite3 = require('sqlite3').verbose();
const { Pool, Client } = require('pg');
const path = require('path');
const fs = require('fs');
const configManager = require('../config/manager');

let db;
let pool;
let config;
let dbType;

// Create a unified database interface logger
const dbLogger = {
  info: (msg, ...args) => console.log(`[DB] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[DB ERROR] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[DB WARNING] ${msg}`, ...args)
};

/**
 * Initialize database connection based on config
 */
async function initializeDatabase() {
  try {
    // Load config from /data/config.json
    config = configManager.loadConfig();
    dbType = config.dbType || 'sqlite';
    
    dbLogger.info(`Initializing ${dbType} database...`);
    
    if (dbType === 'postgres') {
      await initPostgres();
    } else {
      await initSQLite();
    }
    
    dbLogger.info(`Database initialized successfully`);
  } catch (err) {
    dbLogger.error('Failed to initialize database:', err);
    throw err;
  }
}

/**
 * Initialize SQLite database
 */
function initSQLite() {
  return new Promise((resolve, reject) => {
    const dbPath = config.sqlite?.path || '/data/ai-chief-of-staff.db';
    const dbDir = path.dirname(dbPath);

    // Ensure data directory exists
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      dbLogger.info(`Created data directory: ${dbDir}`);
    }

    db = new sqlite3.Database(dbPath, async (err) => {
      if (err) {
        dbLogger.error('Error opening SQLite database:', err);
        reject(err);
      } else {
        dbLogger.info(`Connected to SQLite database at ${dbPath}`);
        try {
          await initDatabaseTables();
          resolve();
        } catch (err) {
          reject(err);
        }
      }
    });
  });
}

/**
 * Initialize PostgreSQL database
 */
async function initPostgres() {
  try {
    const pgConfig = config.postgres || {};
    const dbName = pgConfig.database || 'ai_chief_of_staff';
    
    // First connect to 'postgres' database to check if target DB exists
    const adminClient = new Client({
      host: pgConfig.host || 'localhost',
      port: pgConfig.port || 5432,
      database: 'postgres',
      user: pgConfig.user || 'postgres',
      password: pgConfig.password || '',
    });
    
    dbLogger.info(`Connecting to PostgreSQL at ${pgConfig.host}:${pgConfig.port}...`);
    await adminClient.connect();
    
    // Check if database exists
    const result = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );
    
    if (result.rows.length === 0) {
      dbLogger.info(`Database '${dbName}' does not exist, creating...`);
      await adminClient.query(`CREATE DATABASE ${dbName}`);
      dbLogger.info(`Database '${dbName}' created successfully`);
    } else {
      dbLogger.info(`Database '${dbName}' already exists`);
    }
    
    await adminClient.end();
    
    // Now connect to the target database
    pool = new Pool({
      host: pgConfig.host || 'localhost',
      port: pgConfig.port || 5432,
      database: dbName,
      user: pgConfig.user || 'postgres',
      password: pgConfig.password || '',
    });
    
    pool.on('error', (err) => {
      dbLogger.error('PostgreSQL pool error:', err);
    });
    
    dbLogger.info(`Connected to PostgreSQL database '${dbName}'`);
    await initDatabaseTablesPostgres();
    
  } catch (err) {
    dbLogger.error('Error initializing PostgreSQL:', err);
    throw err;
  }
}

/**
 * Initialize SQLite database tables
 */
function initDatabaseTables() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Transcripts table - stores meeting transcripts
      db.run(`
        CREATE TABLE IF NOT EXISTS transcripts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          filename TEXT NOT NULL,
          content TEXT NOT NULL,
          upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          processed BOOLEAN DEFAULT 0,
          source TEXT DEFAULT 'upload'
        )
      `);

      // Context table - stores extracted context for rolling 2-week window
      db.run(`
        CREATE TABLE IF NOT EXISTS context (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transcript_id INTEGER,
          context_type TEXT NOT NULL,
          content TEXT NOT NULL,
          priority TEXT,
          deadline TEXT,
          status TEXT DEFAULT 'active',
          created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (transcript_id) REFERENCES transcripts(id)
        )
      `);

      // Commitments table - tracks commitments made
      db.run(`
        CREATE TABLE IF NOT EXISTS commitments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transcript_id INTEGER,
          description TEXT NOT NULL,
          deadline TEXT,
          assignee TEXT,
          status TEXT DEFAULT 'pending',
          created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          completed_date DATETIME,
          FOREIGN KEY (transcript_id) REFERENCES transcripts(id)
        )
      `);

      // Briefs table - stores generated daily briefs
      db.run(`
        CREATE TABLE IF NOT EXISTS briefs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          brief_date DATE NOT NULL,
          content TEXT NOT NULL,
          top_priorities TEXT,
          created_date DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Configuration table - stores app configuration
      db.run(`
        CREATE TABLE IF NOT EXISTS config (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_date DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          dbLogger.error('Error creating tables:', err);
          reject(err);
        } else {
          dbLogger.info('SQLite tables initialized');
          resolve();
        }
      });
    });
  });
}

/**
 * Initialize PostgreSQL database tables
 */
async function initDatabaseTablesPostgres() {
  try {
    // Transcripts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transcripts (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL,
        content TEXT NOT NULL,
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed BOOLEAN DEFAULT false,
        source TEXT DEFAULT 'upload'
      )
    `);

    // Context table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS context (
        id SERIAL PRIMARY KEY,
        transcript_id INTEGER REFERENCES transcripts(id),
        context_type TEXT NOT NULL,
        content TEXT NOT NULL,
        priority TEXT,
        deadline TEXT,
        status TEXT DEFAULT 'active',
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Commitments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS commitments (
        id SERIAL PRIMARY KEY,
        transcript_id INTEGER REFERENCES transcripts(id),
        description TEXT NOT NULL,
        deadline TEXT,
        assignee TEXT,
        status TEXT DEFAULT 'pending',
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_date TIMESTAMP
      )
    `);

    // Briefs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS briefs (
        id SERIAL PRIMARY KEY,
        brief_date DATE NOT NULL,
        content TEXT NOT NULL,
        top_priorities TEXT,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Configuration table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    dbLogger.info('PostgreSQL tables initialized');
  } catch (err) {
    dbLogger.error('Error initializing PostgreSQL tables:', err);
    throw err;
  }
}

/**
 * Migrate data from SQLite to PostgreSQL
 */
async function migrateToPostgres() {
  dbLogger.info('Starting migration from SQLite to PostgreSQL...');
  
  try {
    // Load SQLite database
    const sqlitePath = config.sqlite?.path || '/data/ai-chief-of-staff.db';
    if (!fs.existsSync(sqlitePath)) {
      dbLogger.info('No SQLite database found, skipping migration');
      return;
    }
    
    const sqliteDb = new sqlite3.Database(sqlitePath);
    
    // Migrate transcripts
    const transcripts = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM transcripts', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    for (const row of transcripts) {
      await pool.query(
        `INSERT INTO transcripts (id, filename, content, upload_date, processed, source) 
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
        [row.id, row.filename, row.content, row.upload_date, row.processed, row.source]
      );
    }
    dbLogger.info(`Migrated ${transcripts.length} transcripts`);
    
    // Migrate context
    const contexts = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM context', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    for (const row of contexts) {
      await pool.query(
        `INSERT INTO context (id, transcript_id, context_type, content, priority, deadline, status, created_date) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
        [row.id, row.transcript_id, row.context_type, row.content, row.priority, row.deadline, row.status, row.created_date]
      );
    }
    dbLogger.info(`Migrated ${contexts.length} context entries`);
    
    // Migrate commitments
    const commitments = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM commitments', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    for (const row of commitments) {
      await pool.query(
        `INSERT INTO commitments (id, transcript_id, description, deadline, assignee, status, created_date, completed_date) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
        [row.id, row.transcript_id, row.description, row.deadline, row.assignee, row.status, row.created_date, row.completed_date]
      );
    }
    dbLogger.info(`Migrated ${commitments.length} commitments`);
    
    // Migrate briefs
    const briefs = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM briefs', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    for (const row of briefs) {
      await pool.query(
        `INSERT INTO briefs (id, brief_date, content, top_priorities, created_date) 
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
        [row.id, row.brief_date, row.content, row.top_priorities, row.created_date]
      );
    }
    dbLogger.info(`Migrated ${briefs.length} briefs`);
    
    // Migrate config
    const configRows = await new Promise((resolve, reject) => {
      sqliteDb.all('SELECT * FROM config', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    for (const row of configRows) {
      await pool.query(
        `INSERT INTO config (key, value, updated_date) 
         VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET value = $2, updated_date = $3`,
        [row.key, row.value, row.updated_date]
      );
    }
    dbLogger.info(`Migrated ${configRows.length} config entries`);
    
    sqliteDb.close();
    dbLogger.info('Migration completed successfully');
    
  } catch (err) {
    dbLogger.error('Error during migration:', err);
    throw err;
  }
}

/**
 * Unified Database Query Interface
 * Provides consistent API regardless of database type
 */
class DatabaseWrapper {
  /**
   * Execute a query and return all results
   * @param {string} query - SQL query
   * @param {array} params - Query parameters
   * @returns {Promise<array>} - Array of result rows
   */
  async all(query, params = []) {
    try {
      if (dbType === 'postgres') {
        // Convert ? placeholders to $1, $2, etc. for PostgreSQL
        let pgQuery = query;
        let paramIndex = 1;
        pgQuery = pgQuery.replace(/\?/g, () => `$${paramIndex++}`);
        
        dbLogger.info(`Executing query: ${pgQuery.substring(0, 100)}...`);
        const result = await pool.query(pgQuery, params);
        dbLogger.info(`Query returned ${result.rows.length} rows`);
        return result.rows;
      } else {
        return new Promise((resolve, reject) => {
          dbLogger.info(`Executing query: ${query.substring(0, 100)}...`);
          db.all(query, params, (err, rows) => {
            if (err) {
              dbLogger.error('Query error:', err);
              reject(err);
            } else {
              dbLogger.info(`Query returned ${rows ? rows.length : 0} rows`);
              resolve(rows || []);
            }
          });
        });
      }
    } catch (err) {
      dbLogger.error('Database query error:', err);
      throw err;
    }
  }

  /**
   * Execute a query and return a single result
   * @param {string} query - SQL query
   * @param {array} params - Query parameters
   * @returns {Promise<object|null>} - Single result row or null
   */
  async get(query, params = []) {
    try {
      if (dbType === 'postgres') {
        // Convert ? placeholders to $1, $2, etc. for PostgreSQL
        let pgQuery = query;
        let paramIndex = 1;
        pgQuery = pgQuery.replace(/\?/g, () => `$${paramIndex++}`);
        
        dbLogger.info(`Executing query: ${pgQuery.substring(0, 100)}...`);
        const result = await pool.query(pgQuery, params);
        const row = result.rows.length > 0 ? result.rows[0] : null;
        dbLogger.info(`Query returned ${row ? '1 row' : 'no rows'}`);
        return row;
      } else {
        return new Promise((resolve, reject) => {
          dbLogger.info(`Executing query: ${query.substring(0, 100)}...`);
          db.get(query, params, (err, row) => {
            if (err) {
              dbLogger.error('Query error:', err);
              reject(err);
            } else {
              dbLogger.info(`Query returned ${row ? '1 row' : 'no rows'}`);
              resolve(row || null);
            }
          });
        });
      }
    } catch (err) {
      dbLogger.error('Database query error:', err);
      throw err;
    }
  }

  /**
   * Execute a query that modifies data (INSERT, UPDATE, DELETE)
   * @param {string} query - SQL query
   * @param {array} params - Query parameters
   * @returns {Promise<object>} - Object with lastID and changes properties
   */
  async run(query, params = []) {
    try {
      if (dbType === 'postgres') {
        // Convert ? placeholders to $1, $2, etc. for PostgreSQL
        let pgQuery = query;
        let paramIndex = 1;
        pgQuery = pgQuery.replace(/\?/g, () => `$${paramIndex++}`);
        
        // Add RETURNING id to INSERT queries to get the lastID
        if (pgQuery.trim().toUpperCase().startsWith('INSERT') && !pgQuery.toUpperCase().includes('RETURNING')) {
          pgQuery += ' RETURNING id';
        }
        
        dbLogger.info(`Executing query: ${pgQuery.substring(0, 100)}...`);
        const result = await pool.query(pgQuery, params);
        
        return {
          lastID: result.rows.length > 0 ? result.rows[0].id : null,
          changes: result.rowCount || 0
        };
      } else {
        return new Promise((resolve, reject) => {
          dbLogger.info(`Executing query: ${query.substring(0, 100)}...`);
          db.run(query, params, function(err) {
            if (err) {
              dbLogger.error('Query error:', err);
              reject(err);
            } else {
              dbLogger.info(`Query affected ${this.changes} rows`);
              resolve({
                lastID: this.lastID,
                changes: this.changes
              });
            }
          });
        });
      }
    } catch (err) {
      dbLogger.error('Database query error:', err);
      throw err;
    }
  }

  /**
   * Prepare a statement for multiple executions (batch operations)
   * @param {string} query - SQL query
   * @returns {object} - Statement object with run and finalize methods
   */
  prepare(query) {
    if (dbType === 'postgres') {
      // For PostgreSQL, we'll batch the operations and execute them all in finalize()
      const operations = [];
      let pgQuery = query;
      let paramIndex = 1;
      pgQuery = pgQuery.replace(/\?/g, () => `$${paramIndex++}`);
      
      return {
        run: (...params) => {
          operations.push([...params]);
        },
        finalize: async (callback) => {
          try {
            for (const params of operations) {
              await pool.query(pgQuery, params);
            }
            dbLogger.info(`Batch operation completed: ${operations.length} queries executed`);
            if (callback) callback(null);
          } catch (err) {
            dbLogger.error('Batch operation error:', err);
            if (callback) callback(err);
            else throw err;
          }
        }
      };
    } else {
      return db.prepare(query);
    }
  }

  /**
   * Get the raw database connection (for advanced use cases)
   */
  getRawConnection() {
    return dbType === 'postgres' ? pool : db;
  }
}

// Create singleton instance of the wrapper
const dbWrapper = new DatabaseWrapper();

/**
 * Get the database connection (unified interface)
 */
function getDb() {
  return dbWrapper;
}

/**
 * Get database type
 */
function getDbType() {
  return dbType;
}

module.exports = {
  initializeDatabase,
  migrateToPostgres,
  getDb,
  getDbType,
  get db() { return getDb(); }
};
