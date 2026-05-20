const express = require('express');
const { getDb, getDbType } = require('../database/db');
const { createModuleLogger } = require('../utils/logger');

const router = express.Router();
const logger = createModuleLogger('ADMIN');

const WIPE_CONFIRMATION = 'WIPE HISTORY';

const HISTORY_TABLES = [
  'profile_task_integrations',
  'profile_calendar_events',
  'task_relationships',
  'task_intelligence',
  'project_associations',
  'context',
  'briefs',
  'notification_history',
  'completion_streaks',
  'insight_metrics',
  'user_patterns',
  'goals',
  'projects',
  'behavioral_clusters',
  'task_clusters',
  'commitments',
  'transcripts'
];

const RELATION_SCOPES = {
  task_relationships: `
    WHERE task_id IN (SELECT id FROM commitments WHERE profile_id = ?)
       OR related_task_id IN (SELECT id FROM commitments WHERE profile_id = ?)
  `,
  task_intelligence: `
    WHERE commitment_id IN (SELECT id FROM commitments WHERE profile_id = ?)
  `,
  project_associations: `
    WHERE project_id IN (SELECT id FROM projects WHERE profile_id = ?)
       OR (entity_type = 'task' AND entity_id IN (SELECT id FROM commitments WHERE profile_id = ?))
       OR (entity_type = 'transcript' AND entity_id IN (SELECT id FROM transcripts WHERE profile_id = ?))
       OR (entity_type = 'goal' AND entity_id IN (SELECT id FROM goals WHERE profile_id = ?))
  `
};

function requireConfiguredAdminToken(req, res, next) {
  if (process.env.AICOS_AUTH_TOKEN || process.env.API_TOKEN) return next();

  return res.status(403).json({
    success: false,
    error: 'Admin token required',
    message: 'Set AICOS_AUTH_TOKEN or API_TOKEN before using destructive admin tools.'
  });
}

function normalizeScope(scope) {
  return scope === 'all-profiles' ? 'all-profiles' : 'current-profile';
}

function relationParamCount(whereClause = '') {
  return (whereClause.match(/\?/g) || []).length;
}

async function tableExists(db, dbType, table) {
  if (dbType === 'postgres' || dbType === 'postgresql') {
    const row = await db.get(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ?
      ) as exists`,
      [table]
    );
    return Boolean(row?.exists);
  }

  const row = await db.get(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [table]
  );
  return Boolean(row);
}

async function columnExists(db, dbType, table, column) {
  if (dbType === 'postgres' || dbType === 'postgresql') {
    const row = await db.get(
      `SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ? AND column_name = ?
      ) as exists`,
      [table, column]
    );
    return Boolean(row?.exists);
  }

  const columns = await db.all(`PRAGMA table_info(${table})`);
  return columns.some(col => col.name === column);
}

async function getScopedClause(db, dbType, table, scope, profileId) {
  if (scope === 'all-profiles') {
    return { where: '', params: [], scoped: true };
  }

  if (await columnExists(db, dbType, table, 'profile_id')) {
    return { where: 'WHERE profile_id = ?', params: [profileId], scoped: true };
  }

  if (RELATION_SCOPES[table]) {
    const where = RELATION_SCOPES[table];
    return {
      where,
      params: Array(relationParamCount(where)).fill(profileId),
      scoped: true
    };
  }

  return { where: '', params: [], scoped: false };
}

async function buildHistorySummary(scope, profileId) {
  const db = getDb();
  const dbType = getDbType();
  const tables = [];
  let totalRows = 0;

  for (const table of HISTORY_TABLES) {
    try {
      if (!await tableExists(db, dbType, table)) continue;

      const scopedClause = await getScopedClause(db, dbType, table, scope, profileId);
      if (!scopedClause.scoped) {
        tables.push({ table, count: null, scoped: false });
        continue;
      }

      const row = await db.get(
        `SELECT COUNT(*) as count FROM ${table} ${scopedClause.where}`,
        scopedClause.params
      );
      const count = Number(row?.count || 0);
      totalRows += count;
      tables.push({ table, count, scoped: true });
    } catch (error) {
      logger.warn(`Failed to summarize ${table}`, { error: error.message });
      tables.push({ table, count: null, scoped: false, error: error.message });
    }
  }

  return {
    scope,
    profileId: scope === 'current-profile' ? profileId : null,
    totalRows,
    tables
  };
}

async function wipeHistory(scope, profileId) {
  const db = getDb();
  const dbType = getDbType();
  const deleted = [];
  const skipped = [];
  let totalDeleted = 0;

  for (const table of HISTORY_TABLES) {
    try {
      if (!await tableExists(db, dbType, table)) {
        skipped.push({ table, reason: 'missing table' });
        continue;
      }

      const scopedClause = await getScopedClause(db, dbType, table, scope, profileId);
      if (!scopedClause.scoped) {
        skipped.push({ table, reason: 'not safely scoped for current profile' });
        continue;
      }

      const result = await db.run(
        `DELETE FROM ${table} ${scopedClause.where}`,
        scopedClause.params
      );
      const changes = Number(result?.changes || 0);
      totalDeleted += changes;
      deleted.push({ table, count: changes });
    } catch (error) {
      logger.error(`Failed to wipe ${table}`, { error: error.message });
      throw new Error(`Failed to wipe ${table}: ${error.message}`);
    }
  }

  return { totalDeleted, deleted, skipped };
}

router.get('/history/summary', requireConfiguredAdminToken, async (req, res) => {
  try {
    const scope = normalizeScope(req.query.scope);
    const summary = await buildHistorySummary(scope, req.profileId || 2);
    res.json({
      success: true,
      confirmation: WIPE_CONFIRMATION,
      ...summary
    });
  } catch (error) {
    logger.error('Failed to build history summary', error);
    res.status(500).json({
      success: false,
      error: 'Failed to build history summary',
      message: error.message
    });
  }
});

router.post('/history/wipe', requireConfiguredAdminToken, async (req, res) => {
  try {
    const scope = normalizeScope(req.body?.scope);
    const confirmation = String(req.body?.confirmation || '').trim();

    if (confirmation !== WIPE_CONFIRMATION) {
      return res.status(400).json({
        success: false,
        error: 'Confirmation required',
        message: `Type ${WIPE_CONFIRMATION} to wipe history.`
      });
    }

    const profileId = req.profileId || 2;
    const before = await buildHistorySummary(scope, profileId);
    const result = await wipeHistory(scope, profileId);
    const after = await buildHistorySummary(scope, profileId);

    logger.warn('History wiped from admin console', {
      scope,
      profileId: scope === 'current-profile' ? profileId : null,
      totalDeleted: result.totalDeleted,
      requestId: req.id
    });

    res.json({
      success: true,
      message: 'History wiped successfully',
      scope,
      profileId: scope === 'current-profile' ? profileId : null,
      before,
      after,
      ...result
    });
  } catch (error) {
    logger.error('Failed to wipe history', error);
    res.status(500).json({
      success: false,
      error: 'Failed to wipe history',
      message: error.message
    });
  }
});

module.exports = router;
