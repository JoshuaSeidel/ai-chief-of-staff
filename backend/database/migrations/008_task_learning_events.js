/**
 * Migration 008: Task learning feedback and dedupe support
 */

const { createModuleLogger } = require('../../utils/logger');
const logger = createModuleLogger('MIGRATION-008');

async function runMigration(db, pool, dbType) {
  logger.info('Starting migration 008: task learning feedback');

  if (dbType === 'postgres' || dbType === 'postgresql') {
    await pool.query(`
      ALTER TABLE commitments
      ADD COLUMN IF NOT EXISTS system_notes TEXT
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS task_learning_events (
        id SERIAL PRIMARY KEY,
        profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        commitment_id INTEGER,
        task_snapshot JSONB NOT NULL DEFAULT '{}',
        reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_task_learning_events_profile_created
      ON task_learning_events(profile_id, created_at DESC)
    `);
  } else {
    const columns = await new Promise((resolve, reject) => {
      db.all('PRAGMA table_info(commitments)', (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });

    if (!columns.some(column => column.name === 'system_notes')) {
      await new Promise((resolve, reject) => {
        db.run('ALTER TABLE commitments ADD COLUMN system_notes TEXT', (err) => (err ? reject(err) : resolve()));
      });
    }

    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS task_learning_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          profile_id INTEGER NOT NULL,
          action TEXT NOT NULL,
          commitment_id INTEGER,
          task_snapshot TEXT NOT NULL DEFAULT '{}',
          reason TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
        )
      `, (err) => (err ? reject(err) : resolve()));
    });

    await new Promise((resolve, reject) => {
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_task_learning_events_profile_created
        ON task_learning_events(profile_id, created_at)
      `, (err) => (err ? reject(err) : resolve()));
    });
  }

  logger.info('Migration 008 completed successfully');
}

module.exports = { runMigration };
