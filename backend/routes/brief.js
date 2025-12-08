const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { generateDailyBrief, generateWeeklyReport, detectPatterns, flagRisks } = require('../services/claude');

// Logger for the brief route
const logger = {
  info: (msg, ...args) => console.log(`[BRIEF] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[BRIEF ERROR] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[BRIEF WARNING] ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[BRIEF DEBUG] ${msg}`, ...args)
};

/**
 * Generate daily brief
 */
router.post('/generate', async (req, res) => {
  logger.info('Generating daily brief...');
  
  try {
    const db = getDb();
    
    // Get context from last 2 weeks
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const twoWeeksAgoISO = twoWeeksAgo.toISOString();

    logger.info(`Fetching context from ${twoWeeksAgoISO}`);

    // Fetch recent context
    const contextQuery = `
      SELECT * FROM context 
      WHERE created_date >= ? AND status = 'active' AND profile_id = ?
      ORDER BY created_date DESC
    `;

    const commitmentsQuery = `
      SELECT * FROM commitments 
      WHERE created_date >= ? AND status != 'completed' AND profile_id = ?
      ORDER BY deadline ASC
    `;

    const transcriptsQuery = `
      SELECT * FROM transcripts 
      WHERE upload_date >= ?
      ORDER BY upload_date DESC
    `;

    try {
      // Use the unified interface with await
      const contextRows = await db.all(contextQuery, [twoWeeksAgoISO, req.profileId]);
      logger.info(`Found ${contextRows.length} context entries`);
      
      const commitmentRows = await db.all(commitmentsQuery, [twoWeeksAgoISO, req.profileId]);
      logger.info(`Found ${commitmentRows.length} commitments`);
      
      const transcriptRows = await db.all(transcriptsQuery, [twoWeeksAgoISO, req.profileId]);
      logger.info(`Found ${transcriptRows.length} transcripts`);

      const contextData = {
        context: contextRows,
        commitments: commitmentRows,
        recentTranscripts: transcriptRows.slice(0, 5) // Last 5 transcripts
      };

      logger.info('Calling Claude API to generate brief...');
      
      // Get pattern insights to enhance brief
      let patternInsights = null;
      try {
        const axios = require('axios');
        const baseURL = process.env.API_BASE_URL || 'http://localhost:3001';
        const patternResponse = await axios.post(`${baseURL}/api/intelligence/analyze-patterns`, {
          time_range: '7d'
        }, { timeout: 10000 });
        
        if (patternResponse.data && patternResponse.data.success) {
          patternInsights = patternResponse.data;
          logger.info('Pattern analysis added to brief context');
        }
      } catch (patternErr) {
        logger.debug('Pattern analysis unavailable for brief:', patternErr.message);
      }
      
      // Add pattern insights to context if available
      if (patternInsights && patternInsights.insights) {
        contextData.productivity_patterns = {
          insights: patternInsights.insights,
          stats: patternInsights.stats
        };
      }
      
      const brief = await generateDailyBrief(contextData, req.profileId);
      logger.info('Brief generated successfully');

      // Save brief to database
      const today = new Date().toISOString().split('T')[0];
      const result = await db.run(
        'INSERT INTO briefs (brief_date, content, profile_id) VALUES (?, ?, ?)',
        [today, brief, req.profileId]
      );
      
      logger.info(`Brief saved with ID: ${result.lastID}`);

      res.json({ 
        brief, 
        generatedAt: new Date().toISOString(),
        stats: {
          contextCount: contextRows.length,
          commitmentCount: commitmentRows.length,
          transcriptCount: transcriptRows.length
        }
      });
    } catch (dbError) {
      logger.error('Database error while fetching context:', dbError);
      throw dbError;
    }
  } catch (error) {
    logger.error('Error generating brief:', error);
    res.status(500).json({ 
      error: 'Error generating brief', 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Get recent briefs
 */
router.get('/recent', async (req, res) => {
  const limit = parseInt(req.query.limit) || 7;
  logger.info(`Fetching ${limit} recent briefs`);
  
  try {
    const db = getDb();
    const rows = await db.all(
      'SELECT * FROM briefs WHERE profile_id = ? ORDER BY brief_date DESC LIMIT ?',
      [req.profileId, limit]
    );
    
    logger.info(`Returning ${rows.length} briefs`);
    res.json(rows);
  } catch (err) {
    logger.error('Error fetching recent briefs:', err);
    res.status(500).json({ 
      error: 'Error fetching briefs',
      message: err.message
    });
  }
});

/**
 * Get brief by date
 */
router.get('/:date', async (req, res) => {
  const date = req.params.date;
  logger.info(`Fetching brief for date: ${date}`);
  
  try {
    const db = getDb();
    const row = await db.get(
      'SELECT * FROM briefs WHERE brief_date = ? AND profile_id = ?',
      [date, req.profileId]
    );
    
    if (!row) {
      logger.warn(`Brief not found for date: ${date}`);
      return res.status(404).json({ error: 'Brief not found' });
    }
    
    logger.info(`Brief found for date: ${date}`);
    res.json(row);
  } catch (err) {
    logger.error(`Error fetching brief for ${date}:`, err);
    res.status(500).json({ 
      error: 'Error fetching brief',
      message: err.message
    });
  }
});

/**
 * Delete a brief
 */
router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  logger.info(`Deleting brief ID: ${id}`);
  
  try {
    const db = getDb();
    const result = await db.run(
      'DELETE FROM briefs WHERE id = ? AND profile_id = ?',
      [id, req.profileId]
    );
    
    if (result.changes === 0) {
      logger.warn(`Brief not found with ID: ${id}`);
      return res.status(404).json({ error: 'Brief not found' });
    }
    
    logger.info(`Brief ${id} deleted successfully`);
    res.json({ message: 'Brief deleted successfully' });
  } catch (err) {
    logger.error(`Error deleting brief ${id}:`, err);
    res.status(500).json({ 
      error: 'Error deleting brief',
      message: err.message
    });
  }
});

/**
 * Generate weekly report
 */
router.post('/weekly-report', async (req, res) => {
  logger.info('Generating weekly report...');
  
  try {
    const db = getDb();
    
    // Get data from last 7 days
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoISO = weekAgo.toISOString();

    logger.info(`Fetching data from ${weekAgoISO}`);

    // Fetch transcripts from the week
    const transcriptsQuery = `
      SELECT * FROM transcripts 
      WHERE upload_date >= ? AND profile_id = ?
      ORDER BY upload_date DESC
    `;

    // Fetch commitments from the week
    const commitmentsQuery = `
      SELECT * FROM commitments 
      WHERE created_date >= ? AND profile_id = ?
      ORDER BY status, deadline ASC
    `;

    // Fetch context from the week
    const contextQuery = `
      SELECT * FROM context 
      WHERE created_date >= ? AND status = 'active' AND profile_id = ?
      ORDER BY created_date DESC
    `;

    // Fetch briefs from the week
    const briefsQuery = `
      SELECT * FROM briefs 
      WHERE created_date >= ? AND profile_id = ?
      ORDER BY brief_date DESC
    `;

    const transcriptRows = await db.all(transcriptsQuery, [weekAgoISO, req.profileId]);
    const commitmentRows = await db.all(commitmentsQuery, [weekAgoISO, req.profileId]);
    const contextRows = await db.all(contextQuery, [weekAgoISO, req.profileId]);
    const briefRows = await db.all(briefsQuery, [weekAgoISO, req.profileId]);

    logger.info(`Found ${transcriptRows.length} transcripts, ${commitmentRows.length} commitments, ${contextRows.length} context items`);

    // Calculate completed vs pending tasks
    const completedTasks = commitmentRows.filter(c => c.status === 'completed');
    const pendingTasks = commitmentRows.filter(c => c.status !== 'completed');
    
    // Group tasks by type
    const tasksByType = {
      commitments: commitmentRows.filter(c => (c.task_type || 'commitment') === 'commitment'),
      actions: commitmentRows.filter(c => c.task_type === 'action'),
      followUps: commitmentRows.filter(c => c.task_type === 'follow-up'),
      risks: commitmentRows.filter(c => c.task_type === 'risk')
    };

    const weekData = {
      transcripts: transcriptRows,
      tasks: {
        all: commitmentRows,
        completed: completedTasks,
        pending: pendingTasks,
        byType: tasksByType
      },
      // Keep commitments for backward compatibility
      commitments: {
        all: commitmentRows,
        completed: completedTasks,
        pending: pendingTasks
      },
      context: contextRows,
      briefs: briefRows,
      stats: {
        totalTranscripts: transcriptRows.length,
        totalTasks: commitmentRows.length,
        completedTasks: completedTasks.length,
        pendingTasks: pendingTasks.length,
        byType: {
          commitments: tasksByType.commitments.length,
          actions: tasksByType.actions.length,
          followUps: tasksByType.followUps.length,
          risks: tasksByType.risks.length
        },
        contextItems: contextRows.length
      }
    };

    logger.info('Calling Claude API to generate weekly report...');
    const report = await generateWeeklyReport(weekData, req.profileId);
    logger.info('Weekly report generated successfully');

    res.json({ 
      report, 
      generatedAt: new Date().toISOString(),
      stats: weekData.stats
    });
  } catch (error) {
    logger.error('Error generating weekly report:', error);
    res.status(500).json({ 
      error: 'Error generating weekly report', 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Detect patterns across recent transcripts
 */
router.post('/patterns', async (req, res) => {
  logger.info('Detecting patterns across transcripts...');
  
  try {
    const db = getDb();
    
    // Get transcripts from last 2 weeks
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    
    const transcripts = await db.all(
      'SELECT * FROM transcripts WHERE upload_date >= ? AND profile_id = ? ORDER BY upload_date DESC LIMIT 10',
      [twoWeeksAgo.toISOString(), req.profileId]
    );
    
    if (transcripts.length === 0) {
      return res.status(400).json({ 
        error: 'Not enough data', 
        message: 'Need at least one transcript to detect patterns' 
      });
    }
    
    logger.info(`Analyzing ${transcripts.length} transcripts for patterns`);
    const patterns = await detectPatterns(transcripts, req.profileId);
    
    res.json({
      patterns,
      transcriptsAnalyzed: transcripts.length,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error detecting patterns:', error);
    res.status(500).json({ 
      error: 'Error detecting patterns', 
      message: error.message
    });
  }
});

/**
 * Flag risks in current commitments and context
 */
router.post('/risks', async (req, res) => {
  logger.info('Flagging risks...');
  
  try {
    const db = getDb();
    
    // Get active commitments
    const commitments = await db.all(
      'SELECT * FROM commitments WHERE status != ? AND profile_id = ? ORDER BY deadline ASC',
      ['completed', req.profileId]
    );
    
    // Get active context
    const context = await db.all(
      'SELECT * FROM context WHERE status = ? AND profile_id = ? ORDER BY created_date DESC LIMIT 50',
      ['active', req.profileId]
    );
    
    logger.info(`Analyzing ${commitments.length} commitments and ${context.length} context items for risks`);
    
    const risks = await flagRisks({ commitments, context }, req.profileId);
    
    res.json({
      risks,
      commitmentsAnalyzed: commitments.length,
      contextAnalyzed: context.length,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error flagging risks:', error);
    res.status(500).json({ 
      error: 'Error flagging risks', 
      message: error.message
    });
  }
});

module.exports = router;
