/**
 * Migration 006: Fix profile_integrations table schema
 * 
 * Migration 002 created profile_integrations with a 'config' column,
 * but migration 003 and service code expect:
 * - token_data (instead of config)
 * - integration_name
 * - is_enabled
 * - created_date
 * - updated_date
 * 
 * This migration:
 * 1. Adds missing columns
 * 2. Migrates data from config to token_data
 * 3. Updates unique constraint to include integration_name
 */

const { createModuleLogger } = require('../../utils/logger');
const logger = createModuleLogger('MIGRATION-006');

function runSqlite(db, sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getSqlite(db, sql) {
  return new Promise((resolve, reject) => {
    db.get(sql, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function needsSQLiteConstraintRebuild(createSql = '') {
  const compactSql = String(createSql).toLowerCase().replace(/\s+/g, '');
  return compactSql.includes('unique(profile_id,integration_type)')
    && !compactSql.includes('unique(profile_id,integration_type,integration_name)');
}

async function completeSQLiteMigration(db) {
  const table = await getSqlite(
    db,
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='profile_integrations'`
  );

  if (!needsSQLiteConstraintRebuild(table?.sql)) {
    logger.info('✓ SQLite migration 006 completed');
    return;
  }

  logger.info('Rebuilding profile_integrations to update SQLite unique constraint');
  await runSqlite(db, 'PRAGMA foreign_keys = OFF');

  try {
    await runSqlite(db, 'BEGIN TRANSACTION');
    await runSqlite(db, 'ALTER TABLE profile_integrations RENAME TO profile_integrations_old');
    await runSqlite(db, `
      CREATE TABLE profile_integrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER NOT NULL,
        integration_type TEXT NOT NULL,
        integration_name TEXT NOT NULL DEFAULT 'default',
        token_data TEXT,
        config TEXT DEFAULT '{}',
        is_enabled INTEGER DEFAULT 1,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'error')),
        last_sync_at DATETIME,
        last_sync_status TEXT,
        error_message TEXT,
        created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
        UNIQUE(profile_id, integration_type, integration_name)
      )
    `);
    await runSqlite(db, `
      INSERT INTO profile_integrations (
        id,
        profile_id,
        integration_type,
        integration_name,
        token_data,
        config,
        is_enabled,
        status,
        last_sync_at,
        last_sync_status,
        error_message,
        created_date,
        updated_date,
        created_at,
        updated_at
      )
      SELECT
        id,
        profile_id,
        integration_type,
        COALESCE(NULLIF(integration_name, ''), CASE
          WHEN integration_type = 'calendar' THEN 'google'
          WHEN integration_type = 'planner' THEN 'microsoft'
          ELSE 'default'
        END),
        token_data,
        COALESCE(config, '{}'),
        COALESCE(is_enabled, CASE WHEN status = 'active' THEN 1 ELSE 0 END),
        COALESCE(status, 'active'),
        last_sync_at,
        last_sync_status,
        error_message,
        COALESCE(created_date, created_at, CURRENT_TIMESTAMP),
        COALESCE(updated_date, updated_at, CURRENT_TIMESTAMP),
        COALESCE(created_at, created_date, CURRENT_TIMESTAMP),
        COALESCE(updated_at, updated_date, CURRENT_TIMESTAMP)
      FROM profile_integrations_old
    `);
    await runSqlite(db, 'DROP TABLE profile_integrations_old');
    await runSqlite(db, 'CREATE INDEX IF NOT EXISTS idx_profile_integrations_profile ON profile_integrations(profile_id)');
    await runSqlite(db, 'CREATE INDEX IF NOT EXISTS idx_profile_integrations_type ON profile_integrations(integration_type)');
    await runSqlite(db, 'CREATE INDEX IF NOT EXISTS idx_profile_integrations_lookup ON profile_integrations(profile_id, integration_type, integration_name)');
    await runSqlite(db, 'COMMIT');
    logger.info('✓ Updated SQLite unique constraint to include integration_name');
  } catch (err) {
    try {
      await runSqlite(db, 'ROLLBACK');
    } catch (rollbackErr) {
      logger.warn('Rollback after SQLite constraint rebuild failed:', rollbackErr.message);
    }
    throw err;
  } finally {
    await runSqlite(db, 'PRAGMA foreign_keys = ON');
  }
}

async function runMigration(db, pool, dbType) {
  logger.info('='.repeat(60));
  logger.info('MIGRATION 006: Fixing profile_integrations schema');
  logger.info('='.repeat(60));

  try {
    if (dbType === 'postgres' || dbType === 'postgresql') {
      await migratePostgreSQL(pool);
    } else {
      await migrateSQLite(db);
    }
    
    logger.info('='.repeat(60));
    logger.info('✓ MIGRATION 006 COMPLETE');
    logger.info('='.repeat(60));
  } catch (err) {
    logger.error('Migration 006 failed:', err);
    throw err;
  }
}

async function migratePostgreSQL(pool) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check if table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'profile_integrations'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      logger.warn('profile_integrations table does not exist, skipping migration 006');
      await client.query('COMMIT');
      return;
    }
    
    // Check current schema
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'profile_integrations'
      ORDER BY column_name
    `);
    
    const columnNames = columns.rows.map(r => r.column_name);
    const columnInfo = new Map(columns.rows.map(r => [r.column_name, r]));
    logger.info(`Current columns: ${columnNames.join(', ')}`);
    
    // Add integration_name if it doesn't exist
    if (!columnNames.includes('integration_name')) {
      await client.query(`
        ALTER TABLE profile_integrations 
        ADD COLUMN integration_name VARCHAR(50) DEFAULT 'default'
      `);
      logger.info('✓ Added integration_name column');
      
      // Set default integration_name based on integration_type
      await client.query(`
        UPDATE profile_integrations 
        SET integration_name = CASE 
          WHEN integration_type = 'calendar' THEN 'google'
          WHEN integration_type = 'planner' THEN 'microsoft'
          ELSE 'default'
        END
        WHERE integration_name IS NULL OR integration_name = 'default'
      `);
      logger.info('✓ Set default integration_name values');
    }

    // Keep config nullable for token-only integrations, but give older schemas a safe default.
    if (!columnNames.includes('config')) {
      await client.query(`
        ALTER TABLE profile_integrations
        ADD COLUMN config JSONB DEFAULT '{}'
      `);
      logger.info('✓ Added config column');
    } else {
      await client.query(`
        UPDATE profile_integrations
        SET config = '{}'
        WHERE config IS NULL
      `);
      await client.query(`
        ALTER TABLE profile_integrations
        ALTER COLUMN config SET DEFAULT '{}'
      `);

      if (columnInfo.get('config')?.is_nullable === 'NO') {
        await client.query(`
          ALTER TABLE profile_integrations
          ALTER COLUMN config DROP NOT NULL
        `);
        logger.info('✓ Removed NOT NULL constraint from config column');
      }
    }
    
    // Add token_data if it doesn't exist
    if (!columnNames.includes('token_data')) {
      // First, add the column
      await client.query(`
        ALTER TABLE profile_integrations 
        ADD COLUMN token_data TEXT
      `);
      logger.info('✓ Added token_data column');
      
      // Migrate data from config to token_data
      await client.query(`
        UPDATE profile_integrations 
        SET token_data = CASE 
          WHEN config::text IS NOT NULL THEN config::text
          ELSE NULL
        END
        WHERE token_data IS NULL
      `);
      logger.info('✓ Migrated data from config to token_data');
    }
    
    // Add is_enabled if it doesn't exist
    if (!columnNames.includes('is_enabled')) {
      await client.query(`
        ALTER TABLE profile_integrations 
        ADD COLUMN is_enabled BOOLEAN DEFAULT true
      `);
      logger.info('✓ Added is_enabled column');
      
      // Set is_enabled based on status
      await client.query(`
        UPDATE profile_integrations 
        SET is_enabled = (status = 'active')
        WHERE is_enabled IS NULL
      `);
      logger.info('✓ Set is_enabled based on status');
    }
    
    // Add created_date if it doesn't exist
    if (!columnNames.includes('created_date')) {
      await client.query(`
        ALTER TABLE profile_integrations 
        ADD COLUMN created_date TIMESTAMP DEFAULT NOW()
      `);
      logger.info('✓ Added created_date column');
      
      // Migrate from created_at if it exists
      if (columnNames.includes('created_at')) {
        await client.query(`
          UPDATE profile_integrations 
          SET created_date = created_at
          WHERE created_date IS NULL AND created_at IS NOT NULL
        `);
        logger.info('✓ Migrated created_at to created_date');
      }
    }
    
    // Add updated_date if it doesn't exist
    if (!columnNames.includes('updated_date')) {
      await client.query(`
        ALTER TABLE profile_integrations 
        ADD COLUMN updated_date TIMESTAMP DEFAULT NOW()
      `);
      logger.info('✓ Added updated_date column');
      
      // Migrate from updated_at if it exists
      if (columnNames.includes('updated_at')) {
        await client.query(`
          UPDATE profile_integrations 
          SET updated_date = updated_at
          WHERE updated_date IS NULL AND updated_at IS NOT NULL
        `);
        logger.info('✓ Migrated updated_at to updated_date');
      }
    }
    
    // Update unique constraint to include integration_name
    try {
      // Drop old constraint if it exists
      await client.query(`
        ALTER TABLE profile_integrations 
        DROP CONSTRAINT IF EXISTS profile_integrations_profile_id_integration_type_key
      `);
      
      // Add new constraint with integration_name
      await client.query(`
        ALTER TABLE profile_integrations 
        ADD CONSTRAINT profile_integrations_unique 
        UNIQUE (profile_id, integration_type, integration_name)
      `);
      logger.info('✓ Updated unique constraint to include integration_name');
    } catch (err) {
      if (!err.message.includes('already exists') && !err.message.includes('does not exist')) {
        logger.warn('Could not update unique constraint:', err.message);
      }
    }
    
    await client.query('COMMIT');
    logger.info('PostgreSQL migration 006 completed');
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function migrateSQLite(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Check if table exists
      db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='profile_integrations'`, (err, row) => {
        if (err) {
          logger.error('Error checking table:', err);
          reject(err);
          return;
        }
        
        if (!row) {
          logger.warn('profile_integrations table does not exist, skipping migration 006');
          resolve();
          return;
        }
        
        // Get current schema
        db.all(`PRAGMA table_info(profile_integrations)`, (err, columns) => {
          if (err) {
            logger.error('Error getting table info:', err);
            reject(err);
            return;
          }
          
          const columnNames = columns.map(c => c.name);
          const finishMigration = () => {
            completeSQLiteMigration(db).then(resolve).catch(reject);
          };
          logger.info(`Current columns: ${columnNames.join(', ')}`);
          
          // Add integration_name if it doesn't exist
          if (!columnNames.includes('integration_name')) {
            db.run(`ALTER TABLE profile_integrations ADD COLUMN integration_name TEXT DEFAULT 'default'`, (err) => {
              if (err && !err.message.includes('duplicate column')) {
                logger.error('Error adding integration_name:', err);
                reject(err);
                return;
              }
              logger.info('✓ Added integration_name column');
              
              // Set default integration_name based on integration_type
              db.run(`
                UPDATE profile_integrations 
                SET integration_name = CASE 
                  WHEN integration_type = 'calendar' THEN 'google'
                  WHEN integration_type = 'planner' THEN 'microsoft'
                  ELSE 'default'
                END
                WHERE integration_name IS NULL OR integration_name = 'default'
              `, (err) => {
                if (err) {
                  logger.error('Error setting integration_name:', err);
                  reject(err);
                  return;
                }
                logger.info('✓ Set default integration_name values');
                continueMigration();
              });
            });
          } else {
            continueMigration();
          }
          
          function continueMigration() {
            // Add token_data if it doesn't exist
            if (!columnNames.includes('token_data')) {
              db.run(`ALTER TABLE profile_integrations ADD COLUMN token_data TEXT`, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                  logger.error('Error adding token_data:', err);
                  reject(err);
                  return;
                }
                logger.info('✓ Added token_data column');
                
                // Migrate data from config to token_data
                db.run(`
                  UPDATE profile_integrations 
                  SET token_data = config
                  WHERE token_data IS NULL AND config IS NOT NULL
                `, (err) => {
                  if (err) {
                    logger.error('Error migrating config to token_data:', err);
                    reject(err);
                    return;
                  }
                  logger.info('✓ Migrated data from config to token_data');
                  continueMigration2();
                });
              });
            } else {
              continueMigration2();
            }
            
            function continueMigration2() {
              // Add is_enabled if it doesn't exist
              if (!columnNames.includes('is_enabled')) {
                db.run(`ALTER TABLE profile_integrations ADD COLUMN is_enabled INTEGER DEFAULT 1`, (err) => {
                  if (err && !err.message.includes('duplicate column')) {
                    logger.error('Error adding is_enabled:', err);
                    reject(err);
                    return;
                  }
                  logger.info('✓ Added is_enabled column');
                  
                  // Set is_enabled based on status
                  db.run(`
                    UPDATE profile_integrations 
                    SET is_enabled = CASE WHEN status = 'active' THEN 1 ELSE 0 END
                    WHERE is_enabled IS NULL
                  `, (err) => {
                    if (err) {
                      logger.error('Error setting is_enabled:', err);
                      reject(err);
                      return;
                    }
                    logger.info('✓ Set is_enabled based on status');
                    continueMigration3();
                  });
                });
              } else {
                continueMigration3();
              }
              
              function continueMigration3() {
                // Add created_date if it doesn't exist
                if (!columnNames.includes('created_date')) {
                  db.run(`ALTER TABLE profile_integrations ADD COLUMN created_date DATETIME`, (err) => {
                    if (err && !err.message.includes('duplicate column')) {
                      logger.error('Error adding created_date:', err);
                      reject(err);
                      return;
                    }
                    logger.info('✓ Added created_date column');
                    
                    // Migrate from created_at if it exists
                    if (columnNames.includes('created_at')) {
                      db.run(`
                        UPDATE profile_integrations 
                        SET created_date = created_at
                        WHERE created_date IS NULL AND created_at IS NOT NULL
                      `, (err) => {
                        if (err) {
                          logger.warn('Could not migrate created_at:', err.message);
                        } else {
                          logger.info('✓ Migrated created_at to created_date');
                        }
                        continueMigration4();
                      });
                    } else {
                      continueMigration4();
                    }
                  });
                } else {
                  continueMigration4();
                }
                
                function continueMigration4() {
                  // Add updated_date if it doesn't exist
                  if (!columnNames.includes('updated_date')) {
                    db.run(`ALTER TABLE profile_integrations ADD COLUMN updated_date DATETIME`, (err) => {
                      if (err && !err.message.includes('duplicate column')) {
                        logger.error('Error adding updated_date:', err);
                        reject(err);
                        return;
                      }
                      logger.info('✓ Added updated_date column');
                      
                      // Migrate from updated_at if it exists
                      if (columnNames.includes('updated_at')) {
                        db.run(`
                          UPDATE profile_integrations 
                          SET updated_date = updated_at
                          WHERE updated_date IS NULL AND updated_at IS NOT NULL
                        `, (err) => {
                          if (err) {
                            logger.warn('Could not migrate updated_at:', err.message);
                          } else {
                            logger.info('✓ Migrated updated_at to updated_date');
                          }
                          
                          logger.info('✓ SQLite migration 006 columns normalized');
                          finishMigration();
                        });
                      } else {
                        logger.info('✓ SQLite migration 006 columns normalized');
                        finishMigration();
                      }
                    });
                  } else {
                    logger.info('✓ SQLite migration 006 columns already normalized');
                    finishMigration();
                  }
                }
              }
            }
          }
        });
      });
    });
  });
}

module.exports = { runMigration };
