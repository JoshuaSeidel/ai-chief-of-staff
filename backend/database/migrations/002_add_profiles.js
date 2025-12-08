/**
 * Migration 002: Add Profiles and Profile-Specific Integrations
 * 
 * This migration adds:
 * 1. profiles table - User profiles (Personal, Work, etc.)
 * 2. profile_integrations table - Per-profile calendar/task integrations
 * 3. profile_calendar_events table - Track calendar syncs per profile
 * 4. profile_task_integrations table - Track task system syncs per profile
 * 5. Add profile_id to existing tables (transcripts, commitments, context, briefs, etc.)
 */

const { createModuleLogger } = require('../../utils/logger');
const logger = createModuleLogger('MIGRATION-002');

/**
 * SQLite Migration
 */
async function migrateSQLite(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      logger.info('='.repeat(60));
      logger.info('MIGRATION 002: Adding Profiles System (SQLite)');
      logger.info('='.repeat(60));

      // 1. Profiles table
      db.run(`
        CREATE TABLE IF NOT EXISTS profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          color TEXT DEFAULT '#3B82F6',
          icon TEXT DEFAULT '💼',
          is_default BOOLEAN DEFAULT 0,
          display_order INTEGER DEFAULT 0,
          preferences TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) logger.error('Error creating profiles table:', err);
        else logger.info('✓ Created profiles table');
      });

      // Insert default profiles (Work is default as existing system is work-focused)
      db.run(`
        INSERT OR IGNORE INTO profiles (id, name, description, color, icon, is_default, display_order)
        VALUES 
          (1, 'Personal', 'Personal life, hobbies, and non-work commitments', '#10B981', '🏠', 0, 2),
          (2, 'Work', 'Professional work and career commitments', '#3B82F6', '💼', 1, 1)
      `, (err) => {
        if (err) logger.error('Error inserting default profiles:', err);
        else logger.info('✓ Created default profiles: Personal, Work');
      });

      // 2. Profile integrations table
      db.run(`
        CREATE TABLE IF NOT EXISTS profile_integrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          profile_id INTEGER NOT NULL,
          integration_type TEXT NOT NULL,
          config TEXT NOT NULL,
          status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'error')),
          last_sync_at DATETIME,
          last_sync_status TEXT,
          error_message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
          UNIQUE(profile_id, integration_type)
        )
      `, (err) => {
        if (err) logger.error('Error creating profile_integrations table:', err);
        else logger.info('✓ Created profile_integrations table');
      });

      // 3. Profile calendar events tracking
      db.run(`
        CREATE TABLE IF NOT EXISTS profile_calendar_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          profile_id INTEGER NOT NULL,
          integration_type TEXT NOT NULL,
          external_event_id TEXT NOT NULL,
          commitment_id INTEGER,
          sync_direction TEXT DEFAULT 'bidirectional' CHECK(sync_direction IN ('to_calendar', 'from_calendar', 'bidirectional')),
          last_synced_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
          FOREIGN KEY (commitment_id) REFERENCES commitments(id) ON DELETE SET NULL,
          UNIQUE(profile_id, integration_type, external_event_id)
        )
      `, (err) => {
        if (err) logger.error('Error creating profile_calendar_events table:', err);
        else logger.info('✓ Created profile_calendar_events table');
      });

      // 4. Profile task integrations tracking
      db.run(`
        CREATE TABLE IF NOT EXISTS profile_task_integrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          profile_id INTEGER NOT NULL,
          commitment_id INTEGER NOT NULL,
          integration_type TEXT NOT NULL,
          external_task_id TEXT NOT NULL,
          external_task_url TEXT,
          sync_status TEXT DEFAULT 'synced' CHECK(sync_status IN ('synced', 'pending', 'error', 'conflict')),
          last_synced_at DATETIME,
          metadata TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
          FOREIGN KEY (commitment_id) REFERENCES commitments(id) ON DELETE CASCADE,
          UNIQUE(commitment_id, integration_type)
        )
      `, (err) => {
        if (err) logger.error('Error creating profile_task_integrations table:', err);
        else logger.info('✓ Created profile_task_integrations table');
      });

      // 5. Add profile_id to existing tables (only if they exist)
      const tablesToUpdate = [
        'transcripts',
        'commitments',
        'context',
        'briefs',
        'task_intelligence',
        'behavioral_clusters',
        'task_clusters',
        'projects',
        'project_associations',
        'goals',
        'user_patterns',
        'insight_metrics',
        'completion_streaks',
        'notification_history'
      ];

      tablesToUpdate.forEach(tableName => {
        // Check if table exists first
        db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [tableName], (err, row) => {
          if (err) {
            logger.error(`Error checking if ${tableName} exists:`, err);
            return;
          }
          
          if (row) {
            db.run(`ALTER TABLE ${tableName} ADD COLUMN profile_id INTEGER DEFAULT 2 REFERENCES profiles(id)`, (err) => {
              if (err && !err.message.includes('duplicate column')) {
                logger.error(`Error adding profile_id to ${tableName}:`, err);
              } else if (!err) {
                logger.info(`✓ Added profile_id to ${tableName}`);
              }
            });
          } else {
            logger.info(`  Skipped ${tableName} (table does not exist)`);
          }
        });
      });

      // 6. Create indexes for performance
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_profile_integrations_profile ON profile_integrations(profile_id)',
        'CREATE INDEX IF NOT EXISTS idx_profile_integrations_type ON profile_integrations(integration_type)',
        'CREATE INDEX IF NOT EXISTS idx_profile_calendar_events_profile ON profile_calendar_events(profile_id)',
        'CREATE INDEX IF NOT EXISTS idx_profile_calendar_events_external ON profile_calendar_events(integration_type, external_event_id)',
        'CREATE INDEX IF NOT EXISTS idx_profile_task_integrations_profile ON profile_task_integrations(profile_id)',
        'CREATE INDEX IF NOT EXISTS idx_profile_task_integrations_external ON profile_task_integrations(integration_type, external_task_id)',
        'CREATE INDEX IF NOT EXISTS idx_transcripts_profile ON transcripts(profile_id)',
        'CREATE INDEX IF NOT EXISTS idx_commitments_profile ON commitments(profile_id)',
        'CREATE INDEX IF NOT EXISTS idx_context_profile ON context(profile_id)',
        'CREATE INDEX IF NOT EXISTS idx_briefs_profile ON briefs(profile_id)',
        'CREATE INDEX IF NOT EXISTS idx_task_intelligence_profile ON task_intelligence(profile_id)',
        'CREATE INDEX IF NOT EXISTS idx_projects_profile ON projects(profile_id)',
        'CREATE INDEX IF NOT EXISTS idx_goals_profile ON goals(profile_id)'
      ];

      let indexCount = 0;
      indexes.forEach((indexSql, idx) => {
        db.run(indexSql, (err) => {
          if (err && !err.message.includes('already exists')) {
            logger.error(`Error creating index ${idx}:`, err);
          }
          indexCount++;
          
          if (indexCount === indexes.length) {
            logger.info(`✓ Created ${indexes.length} indexes for profiles`);
            logger.info('='.repeat(60));
            logger.info('✓ MIGRATION 002 COMPLETE (SQLite)');
            logger.info('='.repeat(60));
            resolve();
          }
        });
      });
    });
  });
}

/**
 * PostgreSQL Migration
 */
async function migratePostgreSQL(pool) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    logger.info('='.repeat(60));
    logger.info('MIGRATION 002: Adding Profiles System (PostgreSQL)');
    logger.info('='.repeat(60));

    // 1. Profiles table
    await client.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        color VARCHAR(7) DEFAULT '#3B82F6',
        icon VARCHAR(50) DEFAULT '💼',
        is_default BOOLEAN DEFAULT FALSE,
        display_order INTEGER DEFAULT 0,
        preferences JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    logger.info('✓ Created profiles table');

    // Insert default profiles (Work is default as existing system is work-focused)
    await client.query(`
      INSERT INTO profiles (id, name, description, color, icon, is_default, display_order)
      VALUES 
        (1, 'Personal', 'Personal life, hobbies, and non-work commitments', '#10B981', '🏠', false, 2),
        (2, 'Work', 'Professional work and career commitments', '#3B82F6', '💼', true, 1)
      ON CONFLICT (id) DO NOTHING
    `);
    logger.info('✓ Created default profiles: Personal, Work');

    // Reset sequence to start from 3
    await client.query(`SELECT setval('profiles_id_seq', (SELECT MAX(id) FROM profiles))`);

    // 2. Profile integrations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS profile_integrations (
        id SERIAL PRIMARY KEY,
        profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        integration_type VARCHAR(50) NOT NULL,
        config JSONB NOT NULL,
        status VARCHAR(20) DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'error')),
        last_sync_at TIMESTAMP,
        last_sync_status VARCHAR(20),
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(profile_id, integration_type)
      )
    `);
    logger.info('✓ Created profile_integrations table');

    // 3. Profile calendar events tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS profile_calendar_events (
        id SERIAL PRIMARY KEY,
        profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        integration_type VARCHAR(50) NOT NULL,
        external_event_id VARCHAR(255) NOT NULL,
        commitment_id INTEGER REFERENCES commitments(id) ON DELETE SET NULL,
        sync_direction VARCHAR(20) DEFAULT 'bidirectional' CHECK(sync_direction IN ('to_calendar', 'from_calendar', 'bidirectional')),
        last_synced_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(profile_id, integration_type, external_event_id)
      )
    `);
    logger.info('✓ Created profile_calendar_events table');

    // 4. Profile task integrations tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS profile_task_integrations (
        id SERIAL PRIMARY KEY,
        profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        commitment_id INTEGER NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
        integration_type VARCHAR(50) NOT NULL,
        external_task_id VARCHAR(255) NOT NULL,
        external_task_url TEXT,
        sync_status VARCHAR(20) DEFAULT 'synced' CHECK(sync_status IN ('synced', 'pending', 'error', 'conflict')),
        last_synced_at TIMESTAMP,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(commitment_id, integration_type)
      )
    `);
    logger.info('✓ Created profile_task_integrations table');

    // 5. Add profile_id to existing tables (only if they exist)
    const tablesToUpdate = [
      'transcripts',
      'commitments',
      'context',
      'briefs',
      'task_intelligence',
      'behavioral_clusters',
      'task_clusters',
      'projects',
      'project_associations',
      'goals',
      'user_patterns',
      'insight_metrics',
      'completion_streaks',
      'notification_history'
    ];

    for (const tableName of tablesToUpdate) {
      try {
        // Check if table exists first
        const tableExists = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )
        `, [tableName]);
        
        if (tableExists.rows[0].exists) {
          await client.query(`
            ALTER TABLE ${tableName} 
            ADD COLUMN IF NOT EXISTS profile_id INTEGER DEFAULT 2 REFERENCES profiles(id)
          `);
          logger.info(`✓ Added profile_id to ${tableName}`);
        } else {
          logger.info(`  Skipped ${tableName} (table does not exist)`);
        }
      } catch (err) {
        if (!err.message.includes('already exists')) {
          logger.error(`Error adding profile_id to ${tableName}:`, err);
        }
      }
    }

    // 6. Create indexes for performance (only on tables that exist)
    const indexesToCreate = [
      { name: 'idx_profile_integrations_profile', table: 'profile_integrations', column: 'profile_id' },
      { name: 'idx_profile_integrations_type', table: 'profile_integrations', column: 'integration_type' },
      { name: 'idx_profile_calendar_events_profile', table: 'profile_calendar_events', column: 'profile_id' },
      { name: 'idx_profile_calendar_events_external', table: 'profile_calendar_events', columns: 'integration_type, external_event_id' },
      { name: 'idx_profile_task_integrations_profile', table: 'profile_task_integrations', column: 'profile_id' },
      { name: 'idx_profile_task_integrations_external', table: 'profile_task_integrations', columns: 'integration_type, external_task_id' },
      { name: 'idx_transcripts_profile', table: 'transcripts', column: 'profile_id' },
      { name: 'idx_commitments_profile', table: 'commitments', column: 'profile_id' },
      { name: 'idx_context_profile', table: 'context', column: 'profile_id' },
      { name: 'idx_briefs_profile', table: 'briefs', column: 'profile_id' },
      { name: 'idx_task_intelligence_profile', table: 'task_intelligence', column: 'profile_id' },
      { name: 'idx_projects_profile', table: 'projects', column: 'profile_id' },
      { name: 'idx_goals_profile', table: 'goals', column: 'profile_id' }
    ];

    let indexCount = 0;
    for (const index of indexesToCreate) {
      try {
        // Check if table exists before creating index
        const tableExists = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )
        `, [index.table]);
        
        if (tableExists.rows[0].exists) {
          const columns = index.columns || index.column;
          await client.query(`CREATE INDEX IF NOT EXISTS ${index.name} ON ${index.table}(${columns})`);
          indexCount++;
        }
      } catch (err) {
        if (!err.message.includes('already exists')) {
          logger.warn(`Could not create index ${index.name}:`, err.message);
        }
      }
    }
    logger.info(`✓ Created ${indexCount} indexes for profiles`);

    await client.query('COMMIT');
    
    logger.info('='.repeat(60));
    logger.info('✓ MIGRATION 002 COMPLETE (PostgreSQL)');
    logger.info('='.repeat(60));
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration 002 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Run Migration
 */
async function runMigration(db, pool, dbType) {
  try {
    if (dbType === 'postgres' || dbType === 'postgresql') {
      await migratePostgreSQL(pool);
    } else {
      await migrateSQLite(db);
    }
  } catch (err) {
    logger.error('Migration failed:', err);
    throw err;
  }
}

module.exports = { runMigration };
