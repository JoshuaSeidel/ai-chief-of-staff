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
    // Load config from /app/data/config.json
    config = configManager.loadConfig();
    dbType = config.dbType || 'sqlite';
    
    dbLogger.info('='.repeat(60));
    dbLogger.info(`DATABASE INITIALIZATION`);
    dbLogger.info(`Config file: ${configManager.CONFIG_FILE}`);
    dbLogger.info(`Database type from config: ${dbType}`);
    dbLogger.info('='.repeat(60));
    
    if (dbType === 'postgres' || dbType === 'postgresql') {
      dbLogger.info('PostgreSQL configuration detected:');
      dbLogger.info(`  Host: ${config.postgres?.host || 'localhost'}`);
      dbLogger.info(`  Port: ${config.postgres?.port || 5432}`);
      dbLogger.info(`  Database: ${config.postgres?.database || 'ai_chief_of_staff'}`);
      dbLogger.info(`  User: ${config.postgres?.user || 'postgres'}`);
      dbLogger.info(`  Password: ${config.postgres?.password ? '***configured***' : '***NOT SET***'}`);
      
      await initPostgres();
    } else {
      dbLogger.info('SQLite configuration detected');
      dbLogger.info(`  Path: ${config.sqlite?.path || '/app/data/ai-chief-of-staff.db'}`);
      await initSQLite();
    }
    
    // Run migrations for both SQLite and PostgreSQL
    await runMigrations();
    
    dbLogger.info('='.repeat(60));
    dbLogger.info(`✓ Database initialized successfully: ${dbType}`);
    dbLogger.info('='.repeat(60));
  } catch (err) {
    dbLogger.error('='.repeat(60));
    dbLogger.error('✗ FAILED TO INITIALIZE DATABASE');
    dbLogger.error(`  Database type: ${dbType}`);
    dbLogger.error(`  Error: ${err.message}`);
    dbLogger.error(`  Stack: ${err.stack}`);
    dbLogger.error('='.repeat(60));
    throw err;
  }
}

/**
 * Initialize SQLite database
 */
function initSQLite() {
  return new Promise((resolve, reject) => {
    const dbPath = config.sqlite?.path || '/app/data/ai-chief-of-staff.db';
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
        dbLogger.info(`✓ Connected to SQLite database at ${dbPath}`);
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
    
    // Validate required PostgreSQL config
    if (!pgConfig.host) {
      throw new Error('PostgreSQL host not configured');
    }
    if (!pgConfig.user) {
      throw new Error('PostgreSQL user not configured');
    }
    if (!pgConfig.password) {
      dbLogger.warn('PostgreSQL password not set - this may cause connection failures');
    }
    
    const dbName = pgConfig.database || 'ai_chief_of_staff';
    
    dbLogger.info(`Attempting to connect to PostgreSQL...`);
    dbLogger.info(`  Connection string: postgresql://${pgConfig.user}@${pgConfig.host}:${pgConfig.port || 5432}/${dbName}`);
    
    // First connect to 'postgres' database to check if target DB exists
    const adminClient = new Client({
      host: pgConfig.host,
      port: pgConfig.port || 5432,
      database: 'postgres',
      user: pgConfig.user,
      password: pgConfig.password || '',
      connectionTimeoutMillis: 5000, // 5 second timeout
    });
    
    try {
      await adminClient.connect();
      dbLogger.info('✓ Connected to PostgreSQL server');
      
      // Check if database exists
      const result = await adminClient.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`,
        [dbName]
      );
      
      if (result.rows.length === 0) {
        dbLogger.info(`Database '${dbName}' does not exist, creating...`);
        await adminClient.query(`CREATE DATABASE ${dbName}`);
        dbLogger.info(`✓ Database '${dbName}' created successfully`);
      } else {
        dbLogger.info(`✓ Database '${dbName}' already exists`);
      }
      
      await adminClient.end();
    } catch (adminErr) {
      dbLogger.error('Failed to connect to PostgreSQL server:', adminErr.message);
      dbLogger.error('This usually means:');
      dbLogger.error('  1. PostgreSQL server is not running');
      dbLogger.error('  2. Wrong host/port configuration');
      dbLogger.error('  3. Wrong credentials');
      dbLogger.error('  4. PostgreSQL is not accessible from this container');
      throw adminErr;
    }
    
    // Now connect to the target database
    pool = new Pool({
      host: pgConfig.host,
      port: pgConfig.port || 5432,
      database: dbName,
      user: pgConfig.user,
      password: pgConfig.password || '',
      connectionTimeoutMillis: 5000,
      max: 20, // Maximum pool size
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    pool.on('error', (err) => {
      dbLogger.error('PostgreSQL pool error:', err);
    });
    
    // Test the connection
    try {
      const client = await pool.connect();
      dbLogger.info(`✓ Connected to PostgreSQL database '${dbName}'`);
      client.release();
    } catch (poolErr) {
      dbLogger.error('Failed to connect to target database:', poolErr.message);
      throw poolErr;
    }
    
    // Initialize tables
    await initDatabaseTablesPostgres();
    dbLogger.info('✓ PostgreSQL tables initialized');
    
  } catch (err) {
    dbLogger.error('='.repeat(60));
    dbLogger.error('PostgreSQL initialization failed!');
    dbLogger.error(`Error: ${err.message}`);
    dbLogger.error('='.repeat(60));
    dbLogger.error('FALLING BACK TO SQLITE');
    dbLogger.error('='.repeat(60));
    
    // Fall back to SQLite
    dbType = 'sqlite';
    await initSQLite();
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
          cluster_group TEXT,
          created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          completed_date DATETIME,
          FOREIGN KEY (transcript_id) REFERENCES transcripts(id)
        )
      `);
      
      // Add cluster_group column if it doesn't exist (for existing databases)
      db.run(`ALTER TABLE commitments ADD COLUMN cluster_group TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
          console.error('Error adding cluster_group column:', err);
        }
      });

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
      // Config table
      db.run(`
        CREATE TABLE IF NOT EXISTS config (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_date DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Prompts table for customizable AI prompts
      db.run(`
        CREATE TABLE IF NOT EXISTS prompts (
          key TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          prompt TEXT NOT NULL,
          created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_date DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Push subscriptions table for web push notifications
      db.run(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT DEFAULT 'default',
          endpoint TEXT UNIQUE NOT NULL,
          keys TEXT NOT NULL,
          created_date DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Notification history to prevent spam
      db.run(`
        CREATE TABLE IF NOT EXISTS notification_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          notification_tag TEXT NOT NULL,
          task_id INTEGER,
          notification_type TEXT NOT NULL,
          sent_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          dismissed BOOLEAN DEFAULT 0,
          dismissed_date DATETIME
        )
      `, (err) => {
        if (err) {
          dbLogger.error('Error creating tables:', err);
          reject(err);
        } else {
          dbLogger.info('✓ SQLite tables initialized');
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
        cluster_group TEXT,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_date TIMESTAMP
      )
    `);
    
    // Add cluster_group column if it doesn't exist (for existing databases)
    await pool.query(`
      ALTER TABLE commitments ADD COLUMN IF NOT EXISTS cluster_group TEXT
    `).catch(err => {
      if (!err.message.includes('already exists')) {
        console.error('Error adding cluster_group column:', err);
      }
    });

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
    
    // Prompts table for customizable AI prompts
    await pool.query(`
      CREATE TABLE IF NOT EXISTS prompts (
        key TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        prompt TEXT NOT NULL,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Push subscriptions table for web push notifications
    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id TEXT DEFAULT 'default',
        endpoint TEXT UNIQUE NOT NULL,
        keys TEXT NOT NULL,
        created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Notification history to prevent spam
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_history (
        id SERIAL PRIMARY KEY,
        notification_tag TEXT NOT NULL,
        task_id INTEGER,
        notification_type TEXT NOT NULL,
        sent_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        dismissed BOOLEAN DEFAULT FALSE,
        dismissed_date TIMESTAMP
      )
    `);
    
    dbLogger.info('✓ PostgreSQL tables initialized');

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
    const sqlitePath = config.sqlite?.path || '/app/data/ai-chief-of-staff.db';
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
      if (dbType === 'postgres' || dbType === 'postgresql') {
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
      if (dbType === 'postgres' || dbType === 'postgresql') {
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
      if (dbType === 'postgres' || dbType === 'postgresql') {
        // Convert ? placeholders to $1, $2, etc. for PostgreSQL
        let pgQuery = query;
        let paramIndex = 1;
        pgQuery = pgQuery.replace(/\?/g, () => `$${paramIndex++}`);
        
        // Convert SQLite INSERT OR REPLACE to PostgreSQL INSERT ... ON CONFLICT
        // Example: INSERT OR REPLACE INTO config (key, value, updated_date) VALUES ($1, $2, CURRENT_TIMESTAMP)
        if (pgQuery.toUpperCase().includes('INSERT OR REPLACE INTO')) {
          // Extract table name and the rest
          const insertOrReplaceMatch = pgQuery.match(/INSERT OR REPLACE INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES/i);
          if (insertOrReplaceMatch) {
            const tableName = insertOrReplaceMatch[1];
            const columns = insertOrReplaceMatch[2].split(',').map(c => c.trim());
            
            // For config and prompts tables, the primary key is 'key', for others it's 'id'
            const primaryKey = (tableName === 'config' || tableName === 'prompts') ? 'key' : 'id';
            
            // Build the UPDATE SET clause (all columns except the primary key)
            const updateColumns = columns.filter(col => col !== primaryKey);
            const updateSet = updateColumns.map(col => `${col} = EXCLUDED.${col}`).join(', ');
            
            // Replace INSERT OR REPLACE with INSERT ... ON CONFLICT
            pgQuery = pgQuery.replace(
              /INSERT OR REPLACE INTO/i,
              'INSERT INTO'
            );
            
            // Add ON CONFLICT clause before any RETURNING clause
            if (pgQuery.toUpperCase().includes('RETURNING')) {
              pgQuery = pgQuery.replace(
                /RETURNING/i,
                `ON CONFLICT (${primaryKey}) DO UPDATE SET ${updateSet} RETURNING`
              );
            } else {
              pgQuery += ` ON CONFLICT (${primaryKey}) DO UPDATE SET ${updateSet}`;
            }
          }
        }
        
        // Add RETURNING clause to INSERT queries to get the lastID (if not already present)
        // For tables with non-id primary keys (config, prompts), return key instead of id
        if (pgQuery.trim().toUpperCase().startsWith('INSERT') && !pgQuery.toUpperCase().includes('RETURNING')) {
          // Determine which table we're inserting into
          const tableMatch = pgQuery.match(/INSERT INTO\s+(\w+)/i);
          const tableName = tableMatch ? tableMatch[1] : null;
          
          if (tableName === 'config' || tableName === 'prompts') {
            // These tables use 'key' as primary key
            pgQuery += ' RETURNING key';
          } else {
            // Other tables use 'id' as primary key
            pgQuery += ' RETURNING id';
          }
        }
        
        dbLogger.info(`Executing FULL query: ${pgQuery}`);
        const result = await pool.query(pgQuery, params);
        
        // Get lastID based on table's primary key column
        let lastID = null;
        if (result.rows.length > 0) {
          const tableMatch = pgQuery.match(/INSERT INTO\s+(\w+)/i);
          const tableName = tableMatch ? tableMatch[1] : null;
          
          if (tableName === 'config' || tableName === 'prompts') {
            lastID = result.rows[0].key;
          } else {
            lastID = result.rows[0].id;
          }
        }
        
        return {
          lastID,
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
    if (dbType === 'postgres' || dbType === 'postgresql') {
      // For PostgreSQL, we'll batch the operations and execute them all in finalize()
      const operations = [];
      let pgQuery = query;
      
      // Convert ? placeholders to $1, $2, etc. for PostgreSQL
      let paramIndex = 1;
      pgQuery = pgQuery.replace(/\?/g, () => `$${paramIndex++}`);
      
      // Convert SQLite INSERT OR REPLACE to PostgreSQL INSERT ... ON CONFLICT
      if (pgQuery.toUpperCase().includes('INSERT OR REPLACE INTO')) {
        const insertOrReplaceMatch = pgQuery.match(/INSERT OR REPLACE INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES/i);
        if (insertOrReplaceMatch) {
          const tableName = insertOrReplaceMatch[1];
          const columns = insertOrReplaceMatch[2].split(',').map(c => c.trim());
          
          // Tables with 'key' as primary key: config, prompts
          // All others use 'id'
          const primaryKey = (tableName === 'config' || tableName === 'prompts') ? 'key' : 'id';
          
          // Build the UPDATE SET clause (all columns except the primary key)
          const updateColumns = columns.filter(col => col !== primaryKey);
          const updateSet = updateColumns.map(col => `${col} = EXCLUDED.${col}`).join(', ');
          
          // Replace INSERT OR REPLACE with INSERT ... ON CONFLICT
          pgQuery = pgQuery.replace(
            /INSERT OR REPLACE INTO/i,
            'INSERT INTO'
          );
          
          // Add ON CONFLICT clause before any RETURNING clause
          if (pgQuery.toUpperCase().includes('RETURNING')) {
            pgQuery = pgQuery.replace(
              /RETURNING/i,
              `ON CONFLICT (${primaryKey}) DO UPDATE SET ${updateSet} RETURNING`
            );
          } else {
            pgQuery += ` ON CONFLICT (${primaryKey}) DO UPDATE SET ${updateSet}`;
          }
        }
      }
      
      return {
        run: async (...params) => {
          // For prepared statements, we need to execute immediately and return the result
          // This is necessary for getting the inserted ID
          
          // Add RETURNING clause if not present and this is an INSERT
          let execQuery = pgQuery;
          if (execQuery.trim().toUpperCase().startsWith('INSERT') && !execQuery.toUpperCase().includes('RETURNING')) {
            const tableMatch = execQuery.match(/INSERT INTO\s+(\w+)/i);
            const tableName = tableMatch ? tableMatch[1] : null;
            
            // Tables with non-id primary keys
            if (tableName === 'config' || tableName === 'prompts') {
              execQuery += ' RETURNING key';
            } else {
              execQuery += ' RETURNING id';
            }
          }
          
          const result = await pool.query(execQuery, params);
          operations.push({ params, result });
          
          // Return in a format compatible with both SQLite and the calling code
          // Handle tables with different primary key columns
          let lastID = null;
          if (result.rows && result.rows.length > 0) {
            const tableMatch = execQuery.match(/INSERT INTO\s+(\w+)/i);
            const tableName = tableMatch ? tableMatch[1] : null;
            
            if (tableName === 'config' || tableName === 'prompts') {
              lastID = result.rows[0].key;
            } else {
              lastID = result.rows[0].id;
            }
          }
          
          return {
            lastID,
            changes: result.rowCount || 0,
            rows: result.rows
          };
        },
        finalize: async (callback) => {
          try {
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
    return (dbType === 'postgres' || dbType === 'postgresql') ? pool : db;
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

/**
 * Run database migrations
 */
async function runMigrations() {
  try {
    dbLogger.info('Running database migrations...');
    
    if (dbType === 'postgres') {
      // Migration 1: Add urgency and suggested_approach columns to commitments table
      try {
        await pool.query(`
          ALTER TABLE commitments 
          ADD COLUMN IF NOT EXISTS urgency TEXT,
          ADD COLUMN IF NOT EXISTS suggested_approach TEXT
        `);
        dbLogger.info('✓ Added urgency and suggested_approach columns to commitments');
      } catch (err) {
        // Column might already exist, that's okay
        if (!err.message.includes('already exists')) {
          dbLogger.warn('Migration warning:', err.message);
        }
      }
      
      // Migration 2: Add task_type and priority columns for consolidation
      try {
        await pool.query(`
          ALTER TABLE commitments 
          ADD COLUMN IF NOT EXISTS task_type TEXT DEFAULT 'commitment',
          ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium'
        `);
        dbLogger.info('✓ Added task_type and priority columns to commitments');
      } catch (err) {
        if (!err.message.includes('already exists')) {
          dbLogger.warn('Migration warning:', err.message);
        }
      }
      
      // Migration 3: Add calendar_event_id for tracking Google Calendar events
      try {
        await pool.query(`
          ALTER TABLE commitments 
          ADD COLUMN IF NOT EXISTS calendar_event_id TEXT
        `);
        dbLogger.info('✓ Added calendar_event_id column to commitments');
      } catch (err) {
        if (!err.message.includes('already exists')) {
          dbLogger.warn('Migration warning:', err.message);
        }
      }
      
      // Migration 4: Add processing tracking to transcripts
      try {
        await pool.query(`
          ALTER TABLE transcripts 
          ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'completed',
          ADD COLUMN IF NOT EXISTS processing_progress INTEGER DEFAULT 100
        `);
        dbLogger.info('✓ Added processing tracking columns to transcripts');
      } catch (err) {
        if (!err.message.includes('already exists')) {
          dbLogger.warn('Migration warning:', err.message);
        }
      }
      
      // Migration 5: Add meeting_date to transcripts
      try {
        await pool.query(`
          ALTER TABLE transcripts 
          ADD COLUMN IF NOT EXISTS meeting_date DATE
        `);
        dbLogger.info('✓ Added meeting_date column to transcripts');
      } catch (err) {
        if (!err.message.includes('already exists')) {
          dbLogger.warn('Migration warning:', err.message);
        }
      }
      
      // Migration 6: Add needs_confirmation to commitments
      try {
        await pool.query(`
          ALTER TABLE commitments 
          ADD COLUMN IF NOT EXISTS needs_confirmation BOOLEAN DEFAULT false
        `);
        dbLogger.info('✓ Added needs_confirmation column to commitments');
      } catch (err) {
        if (!err.message.includes('already exists')) {
          dbLogger.warn('Migration warning:', err.message);
        }
      }
      
      // Migration 7: Add microsoft_task_id to commitments
      try {
        await pool.query(`
          ALTER TABLE commitments 
          ADD COLUMN IF NOT EXISTS microsoft_task_id TEXT
        `);
        dbLogger.info('✓ Added microsoft_task_id column to commitments');
      } catch (err) {
        if (!err.message.includes('already exists')) {
          dbLogger.warn('Migration warning:', err.message);
        }
      }
      
      // Migration 8: Add jira_task_id to commitments
      try {
        await pool.query(`
          ALTER TABLE commitments 
          ADD COLUMN IF NOT EXISTS jira_task_id TEXT
        `);
        dbLogger.info('✓ Added jira_task_id column to commitments');
      } catch (err) {
        if (!err.message.includes('already exists')) {
          dbLogger.warn('Migration warning:', err.message);
        }
      }
    } else {
      // SQLite migrations
      // Check if columns exist
      const tableInfo = await new Promise((resolve, reject) => {
        db.all('PRAGMA table_info(commitments)', (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      const hasUrgency = tableInfo.some(col => col.name === 'urgency');
      const hasSuggestedApproach = tableInfo.some(col => col.name === 'suggested_approach');
      const hasTaskType = tableInfo.some(col => col.name === 'task_type');
      const hasPriority = tableInfo.some(col => col.name === 'priority');
      const hasCalendarEventId = tableInfo.some(col => col.name === 'calendar_event_id');
      const hasNeedsConfirmation = tableInfo.some(col => col.name === 'needs_confirmation');
      const hasMicrosoftTaskId = tableInfo.some(col => col.name === 'microsoft_task_id');
      const hasJiraTaskId = tableInfo.some(col => col.name === 'jira_task_id');
      
      const columnsToAdd = [];
      if (!hasUrgency) columnsToAdd.push({ name: 'urgency', type: 'TEXT' });
      if (!hasSuggestedApproach) columnsToAdd.push({ name: 'suggested_approach', type: 'TEXT' });
      if (!hasTaskType) columnsToAdd.push({ name: 'task_type', type: 'TEXT', default: "'commitment'" });
      if (!hasPriority) columnsToAdd.push({ name: 'priority', type: 'TEXT', default: "'medium'" });
      if (!hasCalendarEventId) columnsToAdd.push({ name: 'calendar_event_id', type: 'TEXT' });
      if (!hasNeedsConfirmation) columnsToAdd.push({ name: 'needs_confirmation', type: 'INTEGER', default: '0' });
      if (!hasMicrosoftTaskId) columnsToAdd.push({ name: 'microsoft_task_id', type: 'TEXT' });
      if (!hasJiraTaskId) columnsToAdd.push({ name: 'jira_task_id', type: 'TEXT' });
      
      // Check transcripts table for processing tracking columns
      const transcriptsTableInfo = await new Promise((resolve, reject) => {
        db.all('PRAGMA table_info(transcripts)', (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      const hasProcessingStatus = transcriptsTableInfo.some(col => col.name === 'processing_status');
      const hasProcessingProgress = transcriptsTableInfo.some(col => col.name === 'processing_progress');
      const hasMeetingDate = transcriptsTableInfo.some(col => col.name === 'meeting_date');
      
      if (!hasProcessingStatus) columnsToAdd.push({ name: 'processing_status', type: 'TEXT', default: "'completed'", table: 'transcripts' });
      if (!hasProcessingProgress) columnsToAdd.push({ name: 'processing_progress', type: 'INTEGER', default: '100', table: 'transcripts' });
      if (!hasMeetingDate) columnsToAdd.push({ name: 'meeting_date', type: 'DATE', table: 'transcripts' });
      
      if (columnsToAdd.length > 0) {
        dbLogger.info('Adding missing columns...');
        
        // SQLite doesn't support ADD COLUMN IF NOT EXISTS or multiple columns at once
        for (const col of columnsToAdd) {
          const tableName = col.table || 'commitments';
          const alterQuery = col.default 
            ? `ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.type} DEFAULT ${col.default}`
            : `ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.type}`;
            
          await new Promise((resolve, reject) => {
            db.run(alterQuery, (err) => {
              if (err && !err.message.includes('duplicate column')) reject(err);
              else resolve();
            });
          });
          dbLogger.info(`✓ Added ${col.name} column to ${tableName}`);
        }
      }
    }
    
    dbLogger.info('All migrations completed successfully');
  } catch (err) {
    dbLogger.error('Migration error:', err);
    // Don't throw - migrations are best-effort
  }
}

module.exports = {
  initializeDatabase,
  migrateToPostgres,
  getDb,
  getDbType,
  get db() { return getDb(); }
};
