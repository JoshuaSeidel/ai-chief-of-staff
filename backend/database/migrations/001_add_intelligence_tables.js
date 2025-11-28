/**
 * Migration: Add Enhanced Intelligence Tables
 * 
 * This migration adds tables for:
 * - Task Intelligence (effort estimation, energy levels, clustering)
 * - Projects & Goals (context continuity)
 * - Personal Insights (patterns, streaks, metrics)
 * - Task Relationships (dependencies, blockers)
 * 
 * Supports both SQLite and PostgreSQL
 */

const { getDb, getDbType } = require('../db');
const { createModuleLogger } = require('../../utils/logger');

const logger = createModuleLogger('MIGRATION-001');

/**
 * SQLite Migration
 */
async function migrateSQLite(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      
      // 1. Task Intelligence - extends commitments with AI metadata
      db.run(`
        CREATE TABLE IF NOT EXISTS task_intelligence (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          commitment_id INTEGER NOT NULL,
          cluster_id INTEGER,
          energy_level TEXT CHECK(energy_level IN ('deep_work', 'focused', 'administrative', 'collaborative', 'creative')),
          estimated_hours REAL DEFAULT 0.5,
          confidence_score REAL,
          optimal_time_of_day TEXT,
          actual_hours REAL,
          deferred_count INTEGER DEFAULT 0,
          keywords TEXT,
          created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (commitment_id) REFERENCES commitments(id) ON DELETE CASCADE,
          FOREIGN KEY (cluster_id) REFERENCES task_clusters(id) ON DELETE SET NULL
        )
      `, (err) => {
        if (err) logger.error('Error creating task_intelligence:', err);
        else logger.info('✓ Created task_intelligence table');
      });

      // 2. Task Clusters - groups related tasks
      db.run(`
        CREATE TABLE IF NOT EXISTS task_clusters (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          keywords TEXT,
          status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'archived')),
          total_estimated_hours REAL DEFAULT 0,
          completed_tasks INTEGER DEFAULT 0,
          total_tasks INTEGER DEFAULT 0,
          created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) logger.error('Error creating task_clusters:', err);
        else logger.info('✓ Created task_clusters table');
      });

      // 3. Task Relationships - dependencies and blockers
      db.run(`
        CREATE TABLE IF NOT EXISTS task_relationships (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id INTEGER NOT NULL,
          related_task_id INTEGER NOT NULL,
          relationship_type TEXT NOT NULL CHECK(relationship_type IN ('dependency', 'blocker', 'related')),
          created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (task_id) REFERENCES commitments(id) ON DELETE CASCADE,
          FOREIGN KEY (related_task_id) REFERENCES commitments(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) logger.error('Error creating task_relationships:', err);
        else logger.info('✓ Created task_relationships table');
      });

      // 4. Projects - organize tasks and transcripts
      db.run(`
        CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          status TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived', 'on_hold')),
          start_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          target_end_date DATETIME,
          keywords TEXT,
          tags TEXT,
          team_members TEXT,
          created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_date DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) logger.error('Error creating projects:', err);
        else logger.info('✓ Created projects table');
      });

      // 5. Project Associations - link entities to projects
      db.run(`
        CREATE TABLE IF NOT EXISTS project_associations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL,
          entity_type TEXT NOT NULL CHECK(entity_type IN ('task', 'transcript', 'goal')),
          entity_id INTEGER NOT NULL,
          confidence_score REAL DEFAULT 1.0,
          created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) logger.error('Error creating project_associations:', err);
        else logger.info('✓ Created project_associations table');
      });

      // 6. Goals - quarterly/annual objectives
      db.run(`
        CREATE TABLE IF NOT EXISTS goals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT,
          type TEXT CHECK(type IN ('quarterly', 'annual', 'personal')),
          target_date DATETIME NOT NULL,
          status TEXT DEFAULT 'not_started' CHECK(status IN ('not_started', 'in_progress', 'completed', 'at_risk')),
          success_metrics TEXT,
          key_results TEXT,
          progress_percentage REAL DEFAULT 0,
          created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_reviewed DATETIME,
          updated_date DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) logger.error('Error creating goals:', err);
        else logger.info('✓ Created goals table');
      });

      // 7. User Patterns - detected behavioral patterns
      db.run(`
        CREATE TABLE IF NOT EXISTS user_patterns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT DEFAULT 'default',
          pattern_type TEXT NOT NULL,
          description TEXT,
          confidence REAL,
          evidence TEXT,
          recommendation TEXT,
          first_detected DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_observed DATETIME DEFAULT CURRENT_TIMESTAMP,
          frequency INTEGER DEFAULT 1,
          is_active BOOLEAN DEFAULT 1
        )
      `, (err) => {
        if (err) logger.error('Error creating user_patterns:', err);
        else logger.info('✓ Created user_patterns table');
      });

      // 8. Insight Metrics - time-series data for analytics
      db.run(`
        CREATE TABLE IF NOT EXISTS insight_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT DEFAULT 'default',
          metric_name TEXT NOT NULL,
          metric_value REAL NOT NULL,
          context TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) logger.error('Error creating insight_metrics:', err);
        else logger.info('✓ Created insight_metrics table');
      });

      // 9. Completion Streaks - gamification
      db.run(`
        CREATE TABLE IF NOT EXISTS completion_streaks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT DEFAULT 'default',
          streak_date DATE NOT NULL UNIQUE,
          tasks_completed INTEGER DEFAULT 0,
          tasks_total INTEGER DEFAULT 0,
          streak_count INTEGER DEFAULT 0,
          badges_earned TEXT,
          created_date DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) logger.error('Error creating completion_streaks:', err);
        else logger.info('✓ Created completion_streaks table');
      });

      // Create indexes for better query performance
      db.run('CREATE INDEX IF NOT EXISTS idx_task_intelligence_commitment ON task_intelligence(commitment_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_task_intelligence_cluster ON task_intelligence(cluster_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_task_intelligence_energy ON task_intelligence(energy_level)');
      db.run('CREATE INDEX IF NOT EXISTS idx_project_associations_project ON project_associations(project_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_project_associations_entity ON project_associations(entity_type, entity_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status)');
      db.run('CREATE INDEX IF NOT EXISTS idx_goals_target_date ON goals(target_date)');
      db.run('CREATE INDEX IF NOT EXISTS idx_user_patterns_active ON user_patterns(user_id, is_active)');
      db.run('CREATE INDEX IF NOT EXISTS idx_insight_metrics_timestamp ON insight_metrics(user_id, timestamp)');
      db.run('CREATE INDEX IF NOT EXISTS idx_completion_streaks_date ON completion_streaks(user_id, streak_date)', (err) => {
        if (err) {
          logger.error('Error creating indexes:', err);
          reject(err);
        } else {
          logger.info('✓ Created all indexes');
          resolve();
        }
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

    // 1. Task Intelligence
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_intelligence (
        id SERIAL PRIMARY KEY,
        commitment_id INTEGER NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
        cluster_id INTEGER REFERENCES task_clusters(id) ON DELETE SET NULL,
        energy_level VARCHAR(20) CHECK(energy_level IN ('deep_work', 'focused', 'administrative', 'collaborative', 'creative')),
        estimated_hours FLOAT DEFAULT 0.5,
        confidence_score FLOAT,
        optimal_time_of_day VARCHAR(20),
        actual_hours FLOAT,
        deferred_count INTEGER DEFAULT 0,
        keywords JSONB,
        created_date TIMESTAMP DEFAULT NOW()
      )
    `);
    logger.info('✓ Created task_intelligence table');

    // 2. Task Clusters
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_clusters (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        keywords JSONB,
        status VARCHAR(20) DEFAULT 'active' CHECK(status IN ('active', 'completed', 'archived')),
        total_estimated_hours FLOAT DEFAULT 0,
        completed_tasks INTEGER DEFAULT 0,
        total_tasks INTEGER DEFAULT 0,
        created_date TIMESTAMP DEFAULT NOW(),
        last_updated TIMESTAMP DEFAULT NOW()
      )
    `);
    logger.info('✓ Created task_clusters table');

    // 3. Task Relationships
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_relationships (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
        related_task_id INTEGER NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
        relationship_type VARCHAR(20) NOT NULL CHECK(relationship_type IN ('dependency', 'blocker', 'related')),
        created_date TIMESTAMP DEFAULT NOW()
      )
    `);
    logger.info('✓ Created task_relationships table');

    // 4. Projects
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'active' CHECK(status IN ('active', 'archived', 'on_hold')),
        start_date TIMESTAMP DEFAULT NOW(),
        target_end_date TIMESTAMP,
        keywords JSONB,
        tags JSONB,
        team_members JSONB,
        created_date TIMESTAMP DEFAULT NOW(),
        updated_date TIMESTAMP DEFAULT NOW()
      )
    `);
    logger.info('✓ Created projects table');

    // 5. Project Associations
    await client.query(`
      CREATE TABLE IF NOT EXISTS project_associations (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        entity_type VARCHAR(20) NOT NULL CHECK(entity_type IN ('task', 'transcript', 'goal')),
        entity_id INTEGER NOT NULL,
        confidence_score FLOAT DEFAULT 1.0,
        created_date TIMESTAMP DEFAULT NOW()
      )
    `);
    logger.info('✓ Created project_associations table');

    // 6. Goals
    await client.query(`
      CREATE TABLE IF NOT EXISTS goals (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        type VARCHAR(20) CHECK(type IN ('quarterly', 'annual', 'personal')),
        target_date TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'not_started' CHECK(status IN ('not_started', 'in_progress', 'completed', 'at_risk')),
        success_metrics JSONB,
        key_results JSONB,
        progress_percentage FLOAT DEFAULT 0,
        created_date TIMESTAMP DEFAULT NOW(),
        last_reviewed TIMESTAMP,
        updated_date TIMESTAMP DEFAULT NOW()
      )
    `);
    logger.info('✓ Created goals table');

    // 7. User Patterns
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_patterns (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) DEFAULT 'default',
        pattern_type VARCHAR(50) NOT NULL,
        description TEXT,
        confidence FLOAT,
        evidence JSONB,
        recommendation TEXT,
        first_detected TIMESTAMP DEFAULT NOW(),
        last_observed TIMESTAMP DEFAULT NOW(),
        frequency INTEGER DEFAULT 1,
        is_active BOOLEAN DEFAULT true
      )
    `);
    logger.info('✓ Created user_patterns table');

    // 8. Insight Metrics
    await client.query(`
      CREATE TABLE IF NOT EXISTS insight_metrics (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) DEFAULT 'default',
        metric_name VARCHAR(100) NOT NULL,
        metric_value FLOAT NOT NULL,
        context JSONB,
        timestamp TIMESTAMP DEFAULT NOW()
      )
    `);
    logger.info('✓ Created insight_metrics table');

    // 9. Completion Streaks
    await client.query(`
      CREATE TABLE IF NOT EXISTS completion_streaks (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) DEFAULT 'default',
        streak_date DATE NOT NULL,
        tasks_completed INTEGER DEFAULT 0,
        tasks_total INTEGER DEFAULT 0,
        streak_count INTEGER DEFAULT 0,
        badges_earned JSONB,
        created_date TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, streak_date)
      )
    `);
    logger.info('✓ Created completion_streaks table');

    // Create indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_task_intelligence_commitment ON task_intelligence(commitment_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_task_intelligence_cluster ON task_intelligence(cluster_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_task_intelligence_energy ON task_intelligence(energy_level)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_project_associations_project ON project_associations(project_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_project_associations_entity ON project_associations(entity_type, entity_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_goals_target_date ON goals(target_date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_patterns_active ON user_patterns(user_id, is_active)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_insight_metrics_timestamp ON insight_metrics(user_id, timestamp)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_completion_streaks_date ON completion_streaks(user_id, streak_date)');
    logger.info('✓ Created all indexes');

    await client.query('COMMIT');
    logger.info('✓ PostgreSQL migration completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('PostgreSQL migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Run Migration
 */
async function runMigration() {
  try {
    logger.info('='.repeat(60));
    logger.info('STARTING MIGRATION: Enhanced Intelligence Tables');
    logger.info('='.repeat(60));

    const dbType = getDbType();
    logger.info(`Database type: ${dbType}`);

    if (dbType === 'postgres' || dbType === 'postgresql') {
      const db = getDb();
      await migratePostgreSQL(db);
    } else {
      const db = getDb();
      await migrateSQLite(db);
    }

    logger.info('='.repeat(60));
    logger.info('✓ MIGRATION COMPLETED SUCCESSFULLY');
    logger.info('='.repeat(60));
    logger.info('\nNew tables created:');
    logger.info('  • task_intelligence - AI metadata for tasks');
    logger.info('  • task_clusters - Related task groupings');
    logger.info('  • task_relationships - Dependencies & blockers');
    logger.info('  • projects - Project organization');
    logger.info('  • project_associations - Link entities to projects');
    logger.info('  • goals - Quarterly/annual objectives');
    logger.info('  • user_patterns - Behavioral insights');
    logger.info('  • insight_metrics - Analytics data');
    logger.info('  • completion_streaks - Gamification tracking');
    logger.info('='.repeat(60));

  } catch (err) {
    logger.error('='.repeat(60));
    logger.error('✗ MIGRATION FAILED');
    logger.error(err);
    logger.error('='.repeat(60));
    throw err;
  }
}

// Run if called directly
if (require.main === module) {
  const { initializeDatabase } = require('../db');
  
  initializeDatabase()
    .then(() => runMigration())
    .then(() => {
      logger.info('Migration completed. You can now use the new features.');
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { runMigration, migrateSQLite, migratePostgreSQL };
