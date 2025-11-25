const express = require('express');
const router = express.Router();
const { createModuleLogger } = require('../utils/logger');
const microsoftPlanner = require('../services/microsoft-planner');

const logger = createModuleLogger('PLANNER');

/**
 * Microsoft OAuth - Get authorization URL
 */
router.get('/microsoft/auth', async (req, res) => {
  try {
    const authUrl = await microsoftPlanner.getAuthUrl();
    res.json({ authUrl });
  } catch (error) {
    logger.error('Error generating Microsoft auth URL', error);
    res.status(500).json({ 
      error: 'Error generating authorization URL',
      message: error.message
    });
  }
});

/**
 * Microsoft OAuth - Callback
 */
router.get('/microsoft/callback', async (req, res) => {
  const { code, error, state } = req.query;
  
  if (error) {
    logger.error('OAuth callback error', error);
    return res.redirect('/#config?error=microsoft_oauth_failed');
  }
  
  if (!code) {
    return res.redirect('/#config?error=no_code');
  }
  
  try {
    await microsoftPlanner.getTokenFromCode(code);
    logger.info('Microsoft Planner connected successfully');
    res.redirect('/#config?success=microsoft_planner_connected');
  } catch (error) {
    logger.error('Error exchanging code for token', error);
    res.redirect('/#config?error=microsoft_oauth_exchange_failed');
  }
});

/**
 * Microsoft Planner - Check connection status
 */
router.get('/microsoft/status', async (req, res) => {
  try {
    const connected = await microsoftPlanner.isConnected();
    res.json({ connected });
  } catch (error) {
    logger.error('Error checking Microsoft Planner status', error);
    res.json({ connected: false });
  }
});

/**
 * Microsoft Planner - Disconnect
 */
router.post('/microsoft/disconnect', async (req, res) => {
  try {
    await microsoftPlanner.disconnect();
    res.json({ success: true, message: 'Microsoft Planner disconnected' });
  } catch (error) {
    logger.error('Error disconnecting Microsoft Planner', error);
    res.status(500).json({ 
      error: 'Error disconnecting',
      message: error.message
    });
  }
});

/**
 * Create Microsoft task from commitment
 */
router.post('/microsoft/tasks', async (req, res) => {
  try {
    const { commitmentId, title, description, dueDate, importance, status } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    const task = await microsoftPlanner.createTask({
      title,
      description,
      dueDate,
      importance,
      status
    });
    
    res.json({ success: true, task });
  } catch (error) {
    logger.error('Error creating Microsoft task', error);
    res.status(500).json({ 
      error: 'Error creating task',
      message: error.message
    });
  }
});

/**
 * Sync all pending tasks to Microsoft Planner
 */
router.post('/microsoft/sync', async (req, res) => {
  try {
    const { getDb } = require('../database/db');
    const db = getDb();
    
    // Get all pending tasks that don't have a Microsoft task ID
    const tasks = await db.all(
      `SELECT * FROM commitments 
       WHERE status != 'completed' 
       AND (microsoft_task_id IS NULL OR microsoft_task_id = '')
       ORDER BY created_date DESC`
    );
    
    logger.info(`Syncing ${tasks.length} tasks to Microsoft Planner`);
    
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };
    
    for (const task of tasks) {
      try {
        const microsoftTask = await microsoftPlanner.createTaskFromCommitment(task);
        
        // Store Microsoft task ID
        await db.run(
          'UPDATE commitments SET microsoft_task_id = ? WHERE id = ?',
          [microsoftTask.id, task.id]
        );
        
        results.success++;
        logger.info(`Synced task ${task.id} to Microsoft Planner`);
      } catch (error) {
        results.failed++;
        results.errors.push({
          taskId: task.id,
          error: error.message
        });
        logger.warn(`Failed to sync task ${task.id}:`, error.message);
      }
    }
    
    res.json({
      success: true,
      synced: results.success,
      failed: results.failed,
      total: tasks.length,
      errors: results.errors
    });
  } catch (error) {
    logger.error('Error syncing tasks to Microsoft Planner', error);
    res.status(500).json({ 
      error: 'Error syncing tasks',
      message: error.message
    });
  }
});

/**
 * List Microsoft tasks
 */
router.get('/microsoft/tasks', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const tasks = await microsoftPlanner.listTasks(limit);
    res.json({ tasks });
  } catch (error) {
    logger.error('Error listing Microsoft tasks', error);
    res.status(500).json({ 
      error: 'Error listing tasks',
      message: error.message
    });
  }
});

module.exports = router;

