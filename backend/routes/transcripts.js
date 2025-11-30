const express = require('express');
const router = express.Router();
const { getDb, getDbType } = require('../database/db');
const { extractCommitments } = require('../services/claude');
const googleCalendar = require('../services/google-calendar');
const microsoftPlanner = require('../services/microsoft-planner');
const jira = require('../services/jira');
const fs = require('fs');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('TRANSCRIPTS');

/**
 * Save all task types (commitments, actions, follow-ups, risks) and create calendar events
 */
async function saveAllTasksWithCalendar(db, transcriptId, extracted) {
  const isGoogleConnected = await googleCalendar.isConnected();
  const isMicrosoftConnected = await microsoftPlanner.isConnected();
  const isJiraConnected = await jira.isConnected();
  logger.info(`Google Calendar connected: ${isGoogleConnected}, Microsoft Planner connected: ${isMicrosoftConnected}, Jira connected: ${isJiraConnected}`);

  // Get user names from config
  let userNames = [];
  try {
    const userNamesConfig = await db.get('SELECT value FROM config WHERE key = ?', ['userNames']);
    if (userNamesConfig && userNamesConfig.value) {
      userNames = userNamesConfig.value.split(',').map(name => name.trim()).filter(Boolean);
      logger.info(`User names configured: ${userNames.join(', ')}`);
    }
  } catch (err) {
    logger.warn('Could not retrieve user names from config:', err.message);
  }

  // Helper function to check if assignee matches user
  const isAssignedToUser = (assignee) => {
    if (!assignee || !userNames.length) return false;
    const assigneeLower = assignee.toLowerCase().trim();
    return userNames.some(name => name.toLowerCase() === assigneeLower);
  };

  // Helper function to check if assignee needs confirmation
  const needsConfirmation = (assignee) => {
    if (!assignee) return true; // No assignee = needs confirmation
    const assigneeLower = assignee.toLowerCase().trim();
    if (assigneeLower === 'tbd' || assigneeLower === 'unknown' || assigneeLower === '') return true;
    if (userNames.length === 0) return false; // No user names configured = don't require confirmation
    return !isAssignedToUser(assignee); // Not assigned to user = needs confirmation
  };

  // Get database type for boolean handling
  const dbType = getDbType();
  const getBooleanValue = (value) => dbType === 'postgres' ? value : (value ? 1 : 0);

  let totalSaved = 0;
  let calendarEventsCreated = 0;
  
  // Prepare statement for all task types (with needs_confirmation)
  const stmt = db.prepare(
    'INSERT INTO commitments (transcript_id, description, assignee, deadline, urgency, suggested_approach, task_type, priority, status, needs_confirmation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  // Save commitments
  if (extracted.commitments && extracted.commitments.length > 0) {
    // Auto-enhance commitments with AI parsing (batch process)
    const enhancedCommitments = [];
    for (const item of extracted.commitments) {
      let enhanced = { ...item };
      
      // Try to parse task for better deadline/priority extraction
      try {
        const axios = require('axios');
        const baseURL = process.env.API_BASE_URL || 'http://localhost:3001';
        const parseResponse = await axios.post(`${baseURL}/api/intelligence/parse-task`, {
          text: item.description
        }, { timeout: 3000 });
        
        if (parseResponse.data && parseResponse.data.success) {
          // Use parsed data to enhance commitment
          if (parseResponse.data.deadline && parseResponse.data.deadline !== 'none' && !enhanced.deadline) {
            enhanced.deadline = parseResponse.data.deadline;
            logger.info(`Auto-parsed deadline for commitment: ${parseResponse.data.deadline}`);
          }
          if (parseResponse.data.priority && !enhanced.urgency) {
            enhanced.urgency = parseResponse.data.priority.toLowerCase();
          }
        }
      } catch (parseErr) {
        logger.debug('NL parsing unavailable for commitment:', parseErr.message);
      }
      
      enhancedCommitments.push(enhanced);
    }
    
    for (const item of enhancedCommitments) {
      const assignee = item.assignee || null;
      const requiresConfirmation = needsConfirmation(assignee);
      const isUserTask = isAssignedToUser(assignee);
      
      const result = await stmt.run(
        transcriptId,
        item.description,
        assignee,
        item.deadline || null,
        item.urgency || 'medium',
        item.suggested_approach || null,
        'commitment',
        item.urgency || 'medium',
        'pending',
        getBooleanValue(requiresConfirmation) // needs_confirmation
      );
      
      const insertedId = result.lastID || (result.rows && result.rows[0] && result.rows[0].id);
      totalSaved++;
      
      // Only create calendar events and Microsoft tasks for tasks clearly assigned to the user
      if (item.deadline && isUserTask && !requiresConfirmation) {
        // Create Google Calendar event
        if (isGoogleConnected) {
          try {
            const event = await googleCalendar.createEventFromCommitment({ ...item, id: insertedId, task_type: 'commitment' });
            await db.run('UPDATE commitments SET calendar_event_id = ? WHERE id = ?', [event.id, insertedId]);
            calendarEventsCreated++;
          } catch (calError) {
            logger.warn(`Failed to create calendar event: ${calError.message}`);
          }
        }
        
        // Create Microsoft Planner task
        if (isMicrosoftConnected) {
          try {
            const microsoftTask = await microsoftPlanner.createTaskFromCommitment({ ...item, id: insertedId, task_type: 'commitment' });
            await db.run('UPDATE commitments SET microsoft_task_id = ? WHERE id = ?', [microsoftTask.id, insertedId]);
            logger.info(`Created Microsoft task ${microsoftTask.id} for commitment ${insertedId}`);
          } catch (msError) {
            logger.warn(`Failed to create Microsoft task: ${msError.message}`);
          }
        }
        
      }
      
      // Create Jira issue for all commitments (regardless of deadline or assignment)
      if (isJiraConnected) {
        try {
          const jiraIssue = await jira.createIssueFromCommitment({ ...item, id: insertedId, task_type: 'commitment' });
          await db.run('UPDATE commitments SET jira_task_id = ? WHERE id = ?', [jiraIssue.key, insertedId]);
          logger.info(`Created Jira issue ${jiraIssue.key} for commitment ${insertedId}`);
        } catch (jiraError) {
          logger.warn(`Failed to create Jira issue: ${jiraError.message}`);
        }
      }
    }
    logger.info(`Saved ${extracted.commitments.length} commitments`);
  }

  // Save action items
  if (extracted.actionItems && extracted.actionItems.length > 0) {
    for (const item of extracted.actionItems) {
      const assignee = item.assignee || null;
      const requiresConfirmation = needsConfirmation(assignee);
      const isUserTask = isAssignedToUser(assignee);
      
      const result = await stmt.run(
        transcriptId,
        item.description,
        assignee,
        item.deadline || null,
        item.priority || 'medium',
        item.suggested_approach || null,
        'action',
        item.priority || 'medium',
        'pending',
        getBooleanValue(requiresConfirmation)
      );
      
      const insertedId = result.lastID || (result.rows && result.rows[0] && result.rows[0].id);
      totalSaved++;
      
      // Only create calendar events and Microsoft tasks for tasks clearly assigned to the user
      if (item.deadline && isUserTask && !requiresConfirmation) {
        // Create Google Calendar event
        if (isGoogleConnected) {
          try {
            const event = await googleCalendar.createEventFromCommitment({ ...item, id: insertedId, task_type: 'action' });
            await db.run('UPDATE commitments SET calendar_event_id = ? WHERE id = ?', [event.id, insertedId]);
            calendarEventsCreated++;
          } catch (calError) {
            logger.warn(`Failed to create calendar event: ${calError.message}`);
          }
        }
        
        // Create Microsoft Planner task
        if (isMicrosoftConnected) {
          try {
            const microsoftTask = await microsoftPlanner.createTaskFromCommitment({ ...item, id: insertedId, task_type: 'action' });
            await db.run('UPDATE commitments SET microsoft_task_id = ? WHERE id = ?', [microsoftTask.id, insertedId]);
            logger.info(`Created Microsoft task ${microsoftTask.id} for action ${insertedId}`);
          } catch (msError) {
            logger.warn(`Failed to create Microsoft task: ${msError.message}`);
          }
        }
        
      }
      
      // Create Jira issue for all actions (regardless of deadline or assignment)
      if (isJiraConnected) {
        try {
          const jiraIssue = await jira.createIssueFromCommitment({ ...item, id: insertedId, task_type: 'action' });
          await db.run('UPDATE commitments SET jira_task_id = ? WHERE id = ?', [jiraIssue.key, insertedId]);
          logger.info(`Created Jira issue ${jiraIssue.key} for action ${insertedId}`);
        } catch (jiraError) {
          logger.warn(`Failed to create Jira issue: ${jiraError.message}`);
        }
      }
    }
    logger.info(`Saved ${extracted.actionItems.length} action items`);
  }

  // Save follow-ups
  if (extracted.followUps && extracted.followUps.length > 0) {
    for (const item of extracted.followUps) {
      const description = item.with ? `Follow up with ${item.with}: ${item.description}` : item.description;
      const assignee = item.with || null;
      const requiresConfirmation = needsConfirmation(assignee);
      const isUserTask = isAssignedToUser(assignee);
      
      const result = await stmt.run(
        transcriptId,
        description,
        assignee,
        item.deadline || null,
        item.priority || 'medium',
        null,
        'follow-up',
        item.priority || 'medium',
        'pending',
        getBooleanValue(requiresConfirmation)
      );
      
      const insertedId = result.lastID || (result.rows && result.rows[0] && result.rows[0].id);
      totalSaved++;
      
      // Only create calendar events and Microsoft tasks for tasks clearly assigned to the user
      if (item.deadline && isUserTask && !requiresConfirmation) {
        // Create Google Calendar event
        if (isGoogleConnected) {
          try {
            const event = await googleCalendar.createEventFromCommitment({ ...item, description, id: insertedId, task_type: 'follow-up' });
            await db.run('UPDATE commitments SET calendar_event_id = ? WHERE id = ?', [event.id, insertedId]);
            calendarEventsCreated++;
          } catch (calError) {
            logger.warn(`Failed to create calendar event: ${calError.message}`);
          }
        }
        
        // Create Microsoft Planner task
        if (isMicrosoftConnected) {
          try {
            const microsoftTask = await microsoftPlanner.createTaskFromCommitment({ ...item, description, id: insertedId, task_type: 'follow-up' });
            await db.run('UPDATE commitments SET microsoft_task_id = ? WHERE id = ?', [microsoftTask.id, insertedId]);
            logger.info(`Created Microsoft task ${microsoftTask.id} for follow-up ${insertedId}`);
          } catch (msError) {
            logger.warn(`Failed to create Microsoft task: ${msError.message}`);
          }
        }
        
      }
      
      // Create Jira issue for all follow-ups (regardless of deadline or assignment)
      if (isJiraConnected) {
        try {
          const jiraIssue = await jira.createIssueFromCommitment({ ...item, description, id: insertedId, task_type: 'follow-up' });
          await db.run('UPDATE commitments SET jira_task_id = ? WHERE id = ?', [jiraIssue.key, insertedId]);
          logger.info(`Created Jira issue ${jiraIssue.key} for follow-up ${insertedId}`);
        } catch (jiraError) {
          logger.warn(`Failed to create Jira issue: ${jiraError.message}`);
        }
      }
    }
    logger.info(`Saved ${extracted.followUps.length} follow-ups`);
  }

  // Save risks (no calendar events for risks - they're informational only)
  if (extracted.risks && extracted.risks.length > 0) {
    for (const item of extracted.risks) {
      // Risks don't have assignees, so they don't need confirmation
      const result = await stmt.run(
        transcriptId,
        item.description,
        null,
        item.deadline || null,
        item.impact || 'high',
        item.mitigation || null,
        'risk',
        item.impact || 'high',
        'pending',
        getBooleanValue(false) // needs_confirmation = false for risks
      );
      
      const insertedId = result.lastID || (result.rows && result.rows[0] && result.rows[0].id);
      totalSaved++;
      
      // Risks are not synced to Jira, Microsoft Planner, or calendar - they're informational/awareness items only
    }
    logger.info(`Saved ${extracted.risks.length} risks (no calendar events for risks)`);
  }
  
  await stmt.finalize();
  logger.info(`Total: Saved ${totalSaved} tasks, created ${calendarEventsCreated} calendar events`);
  
  return {
    saved: totalSaved,
    calendarEvents: calendarEventsCreated,
    byType: {
      commitments: extracted.commitments?.length || 0,
      actions: extracted.actionItems?.length || 0,
      followUps: extracted.followUps?.length || 0,
      risks: extracted.risks?.length || 0
    }
  };
}

/**
 * Upload transcript file
 */
router.post('/upload', (req, res) => {
  const upload = req.app.get('upload');
  
  upload.single('transcript')(req, res, async (err) => {
    if (err) {
      logger.error('File upload error:', err);
      return res.status(400).json({ error: 'File upload failed', message: err.message });
    }

    if (!req.file) {
      logger.warn('No file uploaded in request');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    logger.info(`Uploaded file: ${req.file.originalname} (${req.file.size} bytes)`);

    try {
      const db = getDb();
      
      // Read transcript content
      const content = fs.readFileSync(req.file.path, 'utf-8');
      logger.info(`Read file content: ${content.length} characters`);

      // Get meeting date from form data (optional)
      const meetingDate = req.body.meetingDate || req.body.meeting_date || null;
      logger.info(`Meeting date: ${meetingDate || 'not provided'}`);

      // Save to database with processing status
      const result = await db.run(
        'INSERT INTO transcripts (filename, content, source, meeting_date, processing_status, processing_progress) VALUES (?, ?, ?, ?, ?, ?)',
        [req.file.originalname, content, 'upload', meetingDate, 'processing', 0]
      );

      const transcriptId = result.lastID;
      logger.info(`Transcript saved with ID: ${transcriptId}`);

      // Clean up uploaded file
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupErr) {
        logger.warn('Failed to clean up uploaded file:', cleanupErr);
      }

      // Return immediately - process in background
      res.json({ 
        success: true,
        message: 'Transcript uploaded, processing in background',
        transcriptId,
        status: 'processing'
      });

      // Process in background
      const transcript = { id: transcriptId, filename: req.file.originalname, content, meeting_date: meetingDate };
      processTranscriptAsync(transcriptId, transcript, db).catch(err => {
        logger.error(`Background processing error for transcript ${transcriptId}:`, err);
      });
    } catch (error) {
      logger.error('Error processing transcript:', error);
      res.status(500).json({ 
        error: 'Error processing transcript', 
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });
});

/**
 * Upload transcript text (manual paste)
 */
router.post('/upload-text', async (req, res) => {
  const { filename, content, source, meetingDate, meeting_date } = req.body;

  if (!filename || !content) {
    logger.warn('Text upload attempted without filename or content');
    return res.status(400).json({ error: 'Filename and content are required' });
  }

  const meetingDateValue = meetingDate || meeting_date || null;
  logger.info(`Manual text upload: ${filename} (${content.length} characters), meeting date: ${meetingDateValue || 'not provided'}`);

  try {
    const db = getDb();

    // Save to database with processing status
    const result = await db.run(
      'INSERT INTO transcripts (filename, content, source, meeting_date, processing_status, processing_progress) VALUES (?, ?, ?, ?, ?, ?)',
      [filename, content, source || 'manual', meetingDateValue, 'processing', 0]
    );

    const transcriptId = result.lastID;
    logger.info(`Transcript saved with ID: ${transcriptId}`);

    // Return immediately - process in background
    res.json({ 
      success: true,
      message: 'Transcript saved, processing in background',
      transcriptId,
      status: 'processing'
    });

    // Process in background
    const transcript = { id: transcriptId, filename, content, meeting_date: meetingDateValue };
    processTranscriptAsync(transcriptId, transcript, db).catch(err => {
      logger.error(`Background processing error for transcript ${transcriptId}:`, err);
    });
  } catch (error) {
    logger.error('Error processing text upload:', error);
    res.status(500).json({ 
      error: 'Error processing text upload', 
      message: error.message
    });
  }
});

/**
 * Get all transcripts
 */
router.get('/', async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  logger.info(`Fetching up to ${limit} transcripts`);
  
  try {
    const db = getDb();
    const rows = await db.all(
      'SELECT id, filename, upload_date, processed, source, processing_status, processing_progress FROM transcripts ORDER BY upload_date DESC LIMIT ?',
      [limit]
    );
    
    logger.info(`Returning ${rows.length} transcripts`);
    res.json(rows);
  } catch (err) {
    logger.error('Error fetching transcripts:', err);
    res.status(500).json({ 
      error: 'Error fetching transcripts',
      message: err.message
    });
  }
});

/**
 * Get transcript by ID
 */
router.get('/:id', async (req, res) => {
  const id = req.params.id;
  logger.info(`Fetching transcript ID: ${id}`);
  
  try {
    const db = getDb();
    const row = await db.get(
      'SELECT * FROM transcripts WHERE id = ?',
      [id]
    );
    
    if (!row) {
      logger.warn(`Transcript not found: ${id}`);
      return res.status(404).json({ error: 'Transcript not found' });
    }
    
    logger.info(`Transcript found: ${id} (${row.filename})`);
    res.json(row);
  } catch (err) {
    logger.error(`Error fetching transcript ${id}:`, err);
    res.status(500).json({ 
      error: 'Error fetching transcript',
      message: err.message
    });
  }
});

/**
 * Delete transcript
 */
router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  logger.info(`Deleting transcript ID: ${id}`);
  
  try {
    const db = getDb();
    const result = await db.run(
      'DELETE FROM transcripts WHERE id = ?',
      [id]
    );
    
    if (result.changes === 0) {
      logger.warn(`Transcript not found: ${id}`);
      return res.status(404).json({ error: 'Transcript not found' });
    }
    
    logger.info(`Transcript ${id} deleted successfully`);
    res.json({ message: 'Transcript deleted successfully' });
  } catch (err) {
    logger.error(`Error deleting transcript ${id}:`, err);
    res.status(500).json({ 
      error: 'Error deleting transcript',
      message: err.message
    });
  }
});

/**
 * Get commitments for a transcript
 */
router.get('/:id/commitments', async (req, res) => {
  const id = req.params.id;
  logger.info(`Fetching commitments for transcript ID: ${id}`);
  
  try {
    const db = getDb();
    const rows = await db.all(
      'SELECT * FROM commitments WHERE transcript_id = ? ORDER BY created_date DESC',
      [id]
    );
    
    logger.info(`Found ${rows.length} commitments for transcript ${id}`);
    res.json(rows);
  } catch (err) {
    logger.error(`Error fetching commitments for transcript ${id}:`, err);
    res.status(500).json({ 
      error: 'Error fetching commitments',
      message: err.message
    });
  }
});

/**
 * Get context items for a transcript
 */
router.get('/:id/context', async (req, res) => {
  const id = req.params.id;
  logger.info(`Fetching context for transcript ID: ${id}`);
  
  try {
    const db = getDb();
    const rows = await db.all(
      'SELECT * FROM context WHERE transcript_id = ? ORDER BY created_date DESC',
      [id]
    );
    
    logger.info(`Found ${rows.length} context items for transcript ${id}`);
    res.json(rows);
  } catch (err) {
    logger.error(`Error fetching context for transcript ${id}:`, err);
    res.status(500).json({ 
      error: 'Error fetching context',
      message: err.message
    });
  }
});

/**
 * Reprocess a transcript to extract commitments again
 */
router.post('/:id/reprocess', async (req, res) => {
  const id = req.params.id;
  logger.info(`Reprocessing transcript ID: ${id}`);
  
  try {
    const db = getDb();
    
    // Get the transcript
    const transcript = await db.get('SELECT * FROM transcripts WHERE id = ?', [id]);
    
    if (!transcript) {
      logger.warn(`Transcript ${id} not found for reprocessing`);
      return res.status(404).json({ error: 'Transcript not found' });
    }
    
    // Set status to processing immediately
    await db.run('UPDATE transcripts SET processing_status = ?, processing_progress = ? WHERE id = ?', ['processing', 0, id]);
    
    logger.info(`Reprocessing transcript: ${transcript.filename}`);
    
    // Return immediately - process in background
    res.json({ 
      success: true,
      message: 'Transcript reprocessing started',
      status: 'processing'
    });
    
    // Process in background
    processTranscriptAsync(id, transcript, db).catch(err => {
      logger.error(`Background processing error for transcript ${id}:`, err);
    });
    
  } catch (err) {
    logger.error(`Error starting reprocess for transcript ${id}:`, err);
    res.status(500).json({ 
      error: 'Error starting reprocess',
      message: err.message
    });
  }
});

/**
 * Process transcript in background
 */
async function processTranscriptAsync(id, transcript, db) {
  try {
    // Update progress: Deleting old data
    await db.run('UPDATE transcripts SET processing_progress = ? WHERE id = ?', [10, id]);
    
    // Delete existing commitments and context for this transcript
    // Get existing calendar event IDs before deleting
    const existingTasks = await db.all('SELECT calendar_event_id FROM commitments WHERE transcript_id = ? AND calendar_event_id IS NOT NULL', [id]);
    const eventIdsToDelete = existingTasks.map(t => t.calendar_event_id).filter(Boolean);
    
    // Delete calendar events if Google Calendar is connected
    if (eventIdsToDelete.length > 0 && await googleCalendar.isConnected()) {
      logger.info(`Deleting ${eventIdsToDelete.length} calendar events for transcript ${id}`);
      try {
        await googleCalendar.deleteEvents(eventIdsToDelete);
        logger.info(`Deleted calendar events successfully`);
      } catch (calError) {
        logger.warn(`Failed to delete some calendar events:`, calError.message);
      }
    }
    
    // Delete tasks and context from database
    await db.run('DELETE FROM commitments WHERE transcript_id = ?', [id]);
    await db.run('DELETE FROM context WHERE transcript_id = ?', [id]);
    logger.info(`Cleared existing tasks and context for transcript ${id}`);
    
    // Update progress: Extracting with AI
    await db.run('UPDATE transcripts SET processing_progress = ? WHERE id = ?', [30, id]);
    
    // Extract commitments using Claude (use meeting_date if available)
    const meetingDate = transcript.meeting_date || null;
    const extracted = await extractCommitments(transcript.content, meetingDate);
    logger.info('Commitments extracted successfully', {
      commitments: extracted.commitments?.length || 0,
      actionItems: extracted.actionItems?.length || 0,
      meetingDate
    });
    
    // Update progress: Saving tasks
    await db.run('UPDATE transcripts SET processing_progress = ? WHERE id = ?', [70, id]);
    
    // Save commitments and create calendar events
    const taskStats = await saveAllTasksWithCalendar(db, id, extracted);
    
    // Update progress: Complete
    await db.run('UPDATE transcripts SET processing_status = ?, processing_progress = ?, processed = ? WHERE id = ?', 
      ['completed', 100, true, id]);
    
    logger.info(`Transcript ${id} reprocessing completed successfully`, taskStats);
    
  } catch (error) {
    logger.error(`Error in background processing for transcript ${id}:`, error);
    
    // Mark as failed
    await db.run('UPDATE transcripts SET processing_status = ?, processing_progress = ?, processed = ? WHERE id = ?', 
      ['failed', 0, true, id]);
  }
}

module.exports = router;
