const express = require('express');
const router = express.Router();
const { createModuleLogger } = require('../utils/logger');
const microsoftPlanner = require('../services/microsoft-planner');
const jira = require('../services/jira');

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
    
    // Provide more helpful error message for common issues
    let errorMessage = error.message;
    if (error.message.includes('not configured')) {
      errorMessage = `${error.message} Please configure Azure credentials in the Configuration page first.`;
    }
    
    res.status(500).json({ 
      error: 'Error generating authorization URL',
      message: errorMessage
    });
  }
});

/**
 * Microsoft OAuth - Callback
 */
router.get('/microsoft/callback', async (req, res) => {
  const { code, error, error_description, state } = req.query;
  
  if (error) {
    logger.error('OAuth callback error', { error, error_description });
    
    // Handle specific Azure AD errors
    let errorParam = 'microsoft_oauth_failed';
    if (error === 'access_denied') {
      errorParam = 'microsoft_oauth_access_denied';
    } else if (error_description && error_description.includes('AADSTS50020')) {
      // User account doesn't exist in tenant - likely trying to use work account with personal app
      errorParam = 'microsoft_oauth_wrong_account_type';
    }
    
    return res.redirect(`/#config?error=${errorParam}&error_details=${encodeURIComponent(error_description || error)}`);
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

/**
 * List available Microsoft To Do task lists
 */
router.get('/microsoft/lists', async (req, res) => {
  try {
    const lists = await microsoftPlanner.listTaskLists();
    res.json({ lists });
  } catch (error) {
    logger.error('Error listing Microsoft task lists', error);
    res.status(500).json({ 
      error: 'Error listing task lists',
      message: error.message
    });
  }
});

/**
 * Jira - Check connection status
 */
router.get('/jira/status', async (req, res) => {
  try {
    const connected = await jira.isConnected();
    res.json({ connected });
  } catch (error) {
    logger.error('Error checking Jira status', error);
    res.json({ connected: false });
  }
});

/**
 * Jira - Disconnect
 */
router.post('/jira/disconnect', async (req, res) => {
  try {
    await jira.disconnect();
    res.json({ success: true, message: 'Jira disconnected' });
  } catch (error) {
    logger.error('Error disconnecting Jira', error);
    res.status(500).json({ 
      error: 'Error disconnecting',
      message: error.message
    });
  }
});

/**
 * Jira - List projects
 */
router.get('/jira/projects', async (req, res) => {
  try {
    const projects = await jira.listProjects();
    res.json({ projects });
  } catch (error) {
    logger.error('Error listing Jira projects', error);
    res.status(500).json({ 
      error: 'Error listing projects',
      message: error.message
    });
  }
});

/**
 * Jira - Get issue types for a project
 */
router.get('/jira/issue-types/:projectKey', async (req, res) => {
  try {
    const { projectKey } = req.params;
    const issueTypes = await jira.getIssueTypes(projectKey);
    res.json({ issueTypes });
  } catch (error) {
    logger.error('Error getting Jira issue types', error);
    res.status(500).json({ 
      error: 'Error getting issue types',
      message: error.message
    });
  }
});

/**
 * Create Jira issue from commitment
 */
router.post('/jira/issues', async (req, res) => {
  try {
    const { summary, description, issueType, assignee, dueDate, priority } = req.body;
    
    if (!summary) {
      return res.status(400).json({ error: 'Summary is required' });
    }
    
    const issue = await jira.createIssue({
      summary,
      description,
      issueType,
      assignee,
      dueDate,
      priority
    });
    
    res.json({ success: true, issue });
  } catch (error) {
    logger.error('Error creating Jira issue', error);
    res.status(500).json({ 
      error: 'Error creating issue',
      message: error.message
    });
  }
});

/**
 * Sync all pending tasks to Jira
 */
router.post('/jira/sync', async (req, res) => {
  try {
    const { getDb } = require('../database/db');
    const db = getDb();
    
    // Get all pending tasks that don't have a Jira issue key
    const tasks = await db.all(
      `SELECT * FROM commitments 
       WHERE status != 'completed' 
       AND (jira_task_id IS NULL OR jira_task_id = '')
       ORDER BY created_date DESC`
    );
    
    logger.info(`Syncing ${tasks.length} tasks to Jira`);
    
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };
    
    for (const task of tasks) {
      try {
        const jiraIssue = await jira.createIssueFromCommitment(task);
        
        // Store Jira issue key (e.g., PROJ-123)
        await db.run(
          'UPDATE commitments SET jira_task_id = ? WHERE id = ?',
          [jiraIssue.key, task.id]
        );
        
        results.success++;
        logger.info(`Synced task ${task.id} to Jira as ${jiraIssue.key}`);
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
    logger.error('Error syncing tasks to Jira', error);
    res.status(500).json({ 
      error: 'Error syncing tasks',
      message: error.message
    });
  }
});

/**
 * List Jira issues
 */
router.get('/jira/issues', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const projectKey = req.query.projectKey || null;
    const issues = await jira.listIssues(projectKey, limit);
    res.json({ issues });
  } catch (error) {
    logger.error('Error listing Jira issues', error);
    res.status(500).json({ 
      error: 'Error listing issues',
      message: error.message
    });
  }
});

module.exports = router;

