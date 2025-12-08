/**
 * Migration 004: Add completion_note field to commitments table
 * 
 * This allows users to add a note when marking tasks complete,
 * which will be synced to Jira/Microsoft Planner as a closing comment.
 */

const { createModuleLogger } = require('../../utils/logger');
const logger = createModuleLogger('MIGRATION-004');

/**
 * Main migration entry point
 */
async function runMigration(db, pool, dbType) {
  logger.info('='.repeat(60));
  logger.info('MIGRATION 004: Add completion_note to commitments table');
  logger.info('='.repeat(60));

  try {
    if (dbType === 'postgres' || dbType === 'postgresql') {
      await runPostgresMigration(pool);
    } else {
      await runSqliteMigration(db);
    }
    
    logger.info('='.repeat(60));
    logger.info('✓ MIGRATION 004 COMPLETE');
    logger.info('='.repeat(60));
  } catch (err) {
    logger.error('Migration 004 failed:', err);
    throw err;
  }
}

/**
 * PostgreSQL Migration
 */
async function runPostgresMigration(pool) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check if column already exists
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'commitments' 
      AND column_name = 'completion_note'
    `);
    
    if (columnCheck.rows.length === 0) {
      await client.query(`
        ALTER TABLE commitments 
        ADD COLUMN completion_note TEXT
      `);
      logger.info('✓ Added completion_note column to commitments table (PostgreSQL)');
    } else {
      logger.info('  completion_note column already exists, skipping');
    }
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * SQLite Migration
 */
async function runSqliteMigration(db) {
  return new Promise((resolve, reject) => {
    db.run(
      `ALTER TABLE commitments ADD COLUMN completion_note TEXT`,
      (err) => {
        if (err && !err.message.includes('duplicate column')) {
          logger.error('Error adding completion_note column:', err);
          reject(err);
        } else {
          if (!err) {
            logger.info('✓ Added completion_note column to commitments table (SQLite)');
          } else {
            logger.info('  completion_note column already exists, skipping');
          }
          resolve();
        }
      }
    );
  });
}

module.exports = { runMigration };
