const express = require('express');
const router = express.Router();
const { getDb, getDbType } = require('../database/db');
const { createModuleLogger } = require('../utils/logger');
const googleCalendar = require('../services/google-calendar');
const microsoftPlanner = require('../services/microsoft-planner');
const jira = require('../services/jira');

const logger = createModuleLogger('COMMITMENTS');

/**
 * Get all commitments with optional filtering
 */
router.get('/', async (req, res) => {
  const { status } = req.query;
  logger.info(`Fetching commitments with status filter: ${status || 'all'}`);
  
  try {
    const db = getDb();
    let query = 'SELECT * FROM commitments WHERE profile_id = ?';
    const params = [req.profileId];
    
    if (status && status !== 'all') {
      if (status === 'overdue') {
        query += ' AND deadline < ? AND status != ?';
        params.push(new Date().toISOString(), 'completed');
      } else {
        query += ' AND status = ?';
        params.push(status);
      }
    }
    
    query += ' ORDER BY deadline ASC, created_date DESC';
    
    const rows = await db.all(query, params);
    logger.info(`Returning ${rows.length} commitments`);
    res.json(rows);
  } catch (err) {
    logger.error('Error fetching commitments:', err);
    res.status(500).json({ 
      error: 'Error fetching commitments',
      message: err.message
    });
  }
});

/**
 * Get a specific commitment
 */
router.get('/:id', async (req, res) => {
  const id = req.params.id;
  logger.info(`Fetching commitment ID: ${id}`);
  
  try {
    const db = getDb();
    const row = await db.get(
      'SELECT * FROM commitments WHERE id = ? AND profile_id = ?',
      [id, req.profileId]
    );
    
    if (!row) {
      logger.warn(`Commitment not found: ${id}`);
      return res.status(404).json({ error: 'Commitment not found' });
    }
    
    res.json(row);
  } catch (err) {
    logger.error(`Error fetching commitment ${id}:`, err);
    res.status(500).json({ 
      error: 'Error fetching commitment',
      message: err.message
    });
  }
});

/**
 * Update commitment status
 */
router.put('/:id', async (req, res) => {
  const id = req.params.id;
  const { status, assignee, deadline, description } = req.body;
  
  logger.info(`Updating commitment ${id}`, { status, assignee });
  
  try {
    const db = getDb();
    
    // Get current task data if we're changing status to completed
    let task = null;
    let shouldDeleteCalendarEvent = false;
    
    if (status === 'completed') {
      task = await db.get('SELECT calendar_event_id, deadline FROM commitments WHERE id = ? AND profile_id = ?', [id, req.profileId]);
      
      if (task && task.calendar_event_id) {
        // Check if event time is in the past
        const deadline = task.deadline ? new Date(task.deadline) : null;
        const now = new Date();
        
        // Only delete if event is in the future
        if (!deadline || deadline > now) {
          shouldDeleteCalendarEvent = true;
        } else {
          logger.info(`Keeping calendar event ${task.calendar_event_id} - event time is in the past`);
        }
      }
    }
    
    // Build update query dynamically based on provided fields
    const updates = [];
    const params = [];
    
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
      
      // If marking as completed, set completed_date
      if (status === 'completed') {
        updates.push('completed_date = ?');
        params.push(new Date().toISOString());
        
        // Clear calendar_event_id if we're deleting the event
        if (shouldDeleteCalendarEvent) {
          updates.push('calendar_event_id = NULL');
        }
      } else {
        // Clear completed_date if reopening
        updates.push('completed_date = NULL');
      }
    }
    
    if (assignee !== undefined) {
      updates.push('assignee = ?');
      params.push(assignee);
    }
    
    if (deadline !== undefined) {
      updates.push('deadline = ?');
      params.push(deadline);
    }
    
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    
    if (req.body.cluster_group !== undefined) {
      updates.push('cluster_group = ?');
      params.push(req.body.cluster_group);
    }
    
    if (req.body.completion_note !== undefined) {
      updates.push('completion_note = ?');
      params.push(req.body.completion_note);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    params.push(id);
    const query = `UPDATE commitments SET ${updates.join(', ')} WHERE id = ?`;
    
    const result = await db.run(query, params);
    
    if (result.changes === 0) {
      logger.warn(`Commitment not found: ${id}`);
      return res.status(404).json({ error: 'Commitment not found' });
    }
    
    // Get task data for external integrations
    const updatedTask = await db.get('SELECT jira_task_id, microsoft_task_id, calendar_event_id FROM commitments WHERE id = ? AND profile_id = ?', [id, req.profileId]);
    
    // Delete calendar event if needed (after updating database)
    if (shouldDeleteCalendarEvent && task && task.calendar_event_id) {
      try {
        const isConnected = await googleCalendar.isConnected(req.profileId);
        if (isConnected) {
          await googleCalendar.deleteEvent(task.calendar_event_id, req.profileId);
          logger.info(`Deleted calendar event ${task.calendar_event_id} for completed task ${id}`);
        }
      } catch (calError) {
        logger.warn(`Failed to delete calendar event: ${calError.message}`);
      }
    }
    
    // Close Jira issue if task is completed and has a Jira issue key
    if (status === 'completed' && updatedTask && updatedTask.jira_task_id) {
      try {
        const isJiraConnected = await jira.isConnected(req.profileId);
        if (isJiraConnected) {
          await jira.closeIssue(updatedTask.jira_task_id, req.body.completion_note, req.profileId);
          logger.info(`Closed Jira issue ${updatedTask.jira_task_id} for completed task ${id}`);
        }
      } catch (jiraError) {
        logger.warn(`Failed to close Jira issue: ${jiraError.message}`);
      }
    }
    
    // Complete Microsoft Planner task if task is completed and has a Microsoft task ID
    if (status === 'completed' && updatedTask && updatedTask.microsoft_task_id) {
      try {
        const isMicrosoftConnected = await microsoftPlanner.isConnected(req.profileId);
        if (isMicrosoftConnected) {
          await microsoftPlanner.completeTask(updatedTask.microsoft_task_id, req.body.completion_note, req.profileId);
          logger.info(`Completed Microsoft task ${updatedTask.microsoft_task_id} for completed task ${id}`);
        }
      } catch (msError) {
        logger.warn(`Failed to complete Microsoft task: ${msError.message}`);
      }
    }
    
    logger.info(`Commitment ${id} updated successfully`);
    res.json({ message: 'Commitment updated successfully' });
  } catch (err) {
    logger.error(`Error updating commitment ${id}:`, err);
    res.status(500).json({ 
      error: 'Error updating commitment',
      message: err.message
    });
  }
});

/**
 * Delete a commitment and remove from external services
 */
router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  logger.info(`Deleting commitment ID: ${id}`);
  
  try {
    const db = getDb();
    
    // Get task data before deleting to cleanup external integrations
    const task = await db.get('SELECT * FROM commitments WHERE id = ? AND profile_id = ?', [id, req.profileId]);
    
    if (!task) {
      logger.warn(`Commitment not found: ${id}`);
      return res.status(404).json({ error: 'Commitment not found' });
    }
    
    const deletionResults = {
      database: false,
      calendar: null,
      jira: null,
      microsoft: null
    };
    
    // Delete from Google Calendar if event exists
    if (task.calendar_event_id) {
      try {
        const isConnected = await googleCalendar.isConnected(req.profileId);
        if (isConnected) {
          await googleCalendar.deleteEvent(task.calendar_event_id, req.profileId);
          deletionResults.calendar = 'success';
          logger.info(`Deleted calendar event ${task.calendar_event_id}`);
        }
      } catch (calError) {
        deletionResults.calendar = 'failed';
        logger.warn(`Failed to delete calendar event: ${calError.message}`);
      }
    }
    
    // Delete from Jira if issue exists
    if (task.jira_task_id) {
      try {
        const isJiraConnected = await jira.isConnected(req.profileId);
        if (isJiraConnected) {
          await jira.deleteIssue(task.jira_task_id, req.profileId);
          deletionResults.jira = 'success';
          logger.info(`Deleted Jira issue ${task.jira_task_id}`);
        }
      } catch (jiraError) {
        deletionResults.jira = 'failed';
        logger.warn(`Failed to delete Jira issue: ${jiraError.message}`);
      }
    }
    
    // Delete from Microsoft Planner if task exists
    if (task.microsoft_task_id) {
      try {
        const isMicrosoftConnected = await microsoftPlanner.isConnected(req.profileId);
        if (isMicrosoftConnected) {
          await microsoftPlanner.deleteTask(task.microsoft_task_id, req.profileId);
          deletionResults.microsoft = 'success';
          logger.info(`Deleted Microsoft task ${task.microsoft_task_id}`);
        }
      } catch (msError) {
        deletionResults.microsoft = 'failed';
        logger.warn(`Failed to delete Microsoft task: ${msError.message}`);
      }
    }
    
    // Delete from database
    const result = await db.run('DELETE FROM commitments WHERE id = ?', [id]);
    deletionResults.database = result.changes > 0;
    
    logger.info(`Commitment ${id} deleted successfully. Results:`, deletionResults);
    res.json({ 
      message: 'Commitment deleted successfully',
      deletionResults
    });
  } catch (err) {
    logger.error(`Error deleting commitment ${id}:`, err);
    res.status(500).json({ 
      error: 'Error deleting commitment',
      message: err.message
    });
  }
});

/**
 * Get overdue commitments
 */
router.get('/status/overdue', async (req, res) => {
  logger.info('Fetching overdue commitments');
  
  try {
    const db = getDb();
    const rows = await db.all(
      `SELECT * FROM commitments 
       WHERE deadline < ? AND status != ? 
       ORDER BY deadline ASC`,
      [new Date().toISOString(), 'completed']
    );
    
    logger.info(`Found ${rows.length} overdue commitments`);
    res.json(rows);
  } catch (err) {
    logger.error('Error fetching overdue commitments:', err);
    res.status(500).json({ 
      error: 'Error fetching overdue commitments',
      message: err.message
    });
  }
});

/**
 * Create a new task manually (not from transcript)
 */
router.post('/', async (req, res) => {
  const { description, task_type, assignee, deadline, priority, urgency, suggested_approach } = req.body;
  
  if (!description) {
    return res.status(400).json({ error: 'Description is required' });
  }
  
  const taskType = task_type || 'commitment';
  const validTaskTypes = ['commitment', 'action', 'follow-up', 'risk'];
  if (!validTaskTypes.includes(taskType)) {
    return res.status(400).json({ error: `Invalid task_type. Must be one of: ${validTaskTypes.join(', ')}` });
  }
  
  logger.info(`Creating manual task: ${taskType} - ${description.substring(0, 50)}...`);
  
  try {
    const db = getDb();
    const dbType = getDbType();
    
    // Helper function to get boolean value for database
    const getBooleanValue = (val) => {
      if (dbType === 'postgres') {
        return val === true || val === 'true' || val === 1 || val === '1';
      } else {
        return val === true || val === 'true' || val === 1 || val === '1' ? 1 : 0;
      }
    };
    
    // Helper function to check if assignee needs confirmation
    const needsConfirmation = (assigneeName) => {
      if (!assigneeName) return false;
      const config = require('../config/manager').loadConfig();
      const userNames = (config.userNames || '').split(',').map(n => n.trim().toLowerCase());
      return !userNames.includes(assigneeName.toLowerCase());
    };
    
    // Helper function to check if assigned to user
    const isAssignedToUser = (assigneeName) => {
      if (!assigneeName) return false;
      const config = require('../config/manager').loadConfig();
      const userNames = (config.userNames || '').split(',').map(n => n.trim().toLowerCase());
      return userNames.includes(assigneeName.toLowerCase());
    };
    
    const requiresConfirmation = needsConfirmation(assignee);
    const isUserTask = isAssignedToUser(assignee);
    
    // Determine priority/urgency based on task type
    let finalPriority = priority || urgency || 'medium';
    if (taskType === 'risk') {
      finalPriority = priority || urgency || 'high'; // Risks default to high
    }
    
    // Insert task into database (transcript_id is null for manual tasks)
    const result = await db.run(
      'INSERT INTO commitments (transcript_id, description, assignee, deadline, urgency, suggested_approach, task_type, priority, status, needs_confirmation, profile_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        null, // transcript_id = null for manual tasks
        description,
        assignee || null,
        deadline || null,
        finalPriority,
        suggested_approach || null,
        taskType,
        finalPriority,
        'pending',
        getBooleanValue(requiresConfirmation),
        req.profileId
      ]
    );
    
    const insertedId = result.lastID || (result.rows && result.rows[0] && result.rows[0].id);
    logger.info(`Created manual task ${insertedId} of type ${taskType}`);
    
    const taskData = {
      id: insertedId,
      description,
      assignee: assignee || null,
      deadline: deadline || null,
      task_type: taskType,
      priority: finalPriority,
      urgency: finalPriority,
      suggested_approach: suggested_approach || null
    };
    
    // Auto-enhance task with AI intelligence (async, don't block)
    (async () => {
      try {
        const axios = require('axios');
        const baseURL = process.env.API_BASE_URL || 'http://localhost:3001';
        
        // Get effort estimation
        try {
          const effortResponse = await axios.post(`${baseURL}/api/intelligence/estimate-effort`, {
            description,
            context: `Task type: ${taskType}, Priority: ${finalPriority}`
          }, { timeout: 5000 });
          
          if (effortResponse.data && effortResponse.data.estimated_time) {
            await db.run(
              'UPDATE commitments SET suggested_approach = ? WHERE id = ? AND profile_id = ?',
              [`AI Estimate: ${effortResponse.data.estimated_time}. ${effortResponse.data.reasoning || ''}`.substring(0, 500), insertedId, req.profileId]
            );
            logger.info(`Auto-estimated effort for task ${insertedId}: ${effortResponse.data.estimated_time}`);
          }
        } catch (effortErr) {
          logger.debug('Effort estimation unavailable:', effortErr.message);
        }
        
        // Get energy classification
        try {
          const energyResponse = await axios.post(`${baseURL}/api/intelligence/classify-energy`, {
            description
          }, { timeout: 5000 });
          
          if (energyResponse.data && energyResponse.data.energy_level) {
            logger.info(`Auto-classified energy for task ${insertedId}: ${energyResponse.data.energy_level}`);
            // Could store this in a new column or in metadata
          }
        } catch (energyErr) {
          logger.debug('Energy classification unavailable:', energyErr.message);
        }
      } catch (err) {
        logger.debug('AI enhancement failed:', err.message);
      }
    })();
    
    // Create calendar event if applicable (only for user tasks with deadlines, not risks)
    if (taskType !== 'risk' && deadline && isUserTask && !requiresConfirmation) {
      const isGoogleConnected = await googleCalendar.isConnected(req.profileId);
      if (isGoogleConnected) {
        try {
          const event = await googleCalendar.createEventFromCommitment(taskData, req.profileId);
          await db.run('UPDATE commitments SET calendar_event_id = ? WHERE id = ? AND profile_id = ?', [event.id, insertedId, req.profileId]);
          logger.info(`Created calendar event ${event.id} for manual task ${insertedId}`);
        } catch (calError) {
          logger.warn(`Failed to create calendar event: ${calError.message}`);
        }
      }
    }
    
    // Create Microsoft Planner task if applicable (only for user tasks with deadlines, not risks)
    if (taskType !== 'risk' && deadline && isUserTask && !requiresConfirmation) {
      const isMicrosoftConnected = await microsoftPlanner.isConnected(req.profileId);
      if (isMicrosoftConnected) {
        try {
          const microsoftTask = await microsoftPlanner.createTaskFromCommitment(taskData, req.profileId);
          await db.run('UPDATE commitments SET microsoft_task_id = ? WHERE id = ? AND profile_id = ?', [microsoftTask.id, insertedId, req.profileId]);
          logger.info(`Created Microsoft task ${microsoftTask.id} for manual task ${insertedId}`);
        } catch (msError) {
          logger.warn(`Failed to create Microsoft task: ${msError.message}`);
        }
      }
    }
    
    // Create Jira issue if applicable (not for risks)
    if (taskType !== 'risk') {
      const isJiraConnected = await jira.isConnected(req.profileId);
      if (isJiraConnected) {
        try {
          const jiraIssue = await jira.createIssueFromCommitment(taskData, req.profileId);
          await db.run('UPDATE commitments SET jira_task_id = ? WHERE id = ? AND profile_id = ?', [jiraIssue.key, insertedId, req.profileId]);
          logger.info(`Created Jira issue ${jiraIssue.key} for manual task ${insertedId}`);
        } catch (jiraError) {
          logger.warn(`Failed to create Jira issue: ${jiraError.message}`);
        }
      }
    }
    
    // Fetch the created task to return
    const createdTask = await db.get('SELECT * FROM commitments WHERE id = ? AND profile_id = ?', [insertedId, req.profileId]);
    
    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      task: createdTask
    });
  } catch (err) {
    logger.error('Error creating manual task:', err);
    res.status(500).json({ 
      error: 'Error creating task',
      message: err.message
    });
  }
});

/**
 * Confirm or reject a task (for tasks needing confirmation)
 */
router.post('/:id/confirm', async (req, res) => {
  const id = req.params.id;
  const { confirmed } = req.body; // true to confirm, false to reject
  
  logger.info(`${confirmed ? 'Confirming' : 'Rejecting'} task ${id}`);
  
  try {
    const db = getDb();
    
    if (confirmed) {
      // Confirm the task - remove needs_confirmation flag
      const task = await db.get('SELECT * FROM commitments WHERE id = ? AND profile_id = ?', [id, req.profileId]);
      
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      // Update task to remove needs_confirmation
      const dbType = getDbType();
      const falseValue = dbType === 'postgres' ? false : 0;
      await db.run(
        'UPDATE commitments SET needs_confirmation = ? WHERE id = ?',
        [falseValue, id]
      );
      
      // If task has a deadline and Google Calendar is connected, create calendar event
      if (task.deadline) {
        try {
          const isConnected = await googleCalendar.isConnected(req.profileId);
          if (isConnected && !task.calendar_event_id) {
            const event = await googleCalendar.createEventFromCommitment({
              ...task,
              task_type: task.task_type || 'commitment'
            }, req.profileId);
            await db.run('UPDATE commitments SET calendar_event_id = ? WHERE id = ? AND profile_id = ?', [event.id, id, req.profileId]);
            logger.info(`Created calendar event ${event.id} for confirmed task ${id}`);
          }
        } catch (calError) {
          logger.warn(`Failed to create calendar event for confirmed task: ${calError.message}`);
        }
      }
      
      logger.info(`Task ${id} confirmed successfully`);
      res.json({ message: 'Task confirmed successfully' });
    } else {
      // Reject the task - delete it
      const result = await db.run('DELETE FROM commitments WHERE id = ? AND profile_id = ?', [id, req.profileId]);
      
      if (result.changes === 0) {
        logger.warn(`Task not found: ${id}`);
        return res.status(404).json({ error: 'Task not found' });
      }
      
      logger.info(`Task ${id} rejected and deleted`);
      res.json({ message: 'Task rejected and removed' });
    }
  } catch (err) {
    logger.error(`Error ${confirmed ? 'confirming' : 'rejecting'} task ${id}:`, err);
    res.status(500).json({ 
      error: `Error ${confirmed ? 'confirming' : 'rejecting'} task`,
      message: err.message
    });
  }
});

module.exports = router;

