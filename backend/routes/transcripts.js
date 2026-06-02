const express = require('express');
const router = express.Router();
const { getDb, getDbType } = require('../database/db');
const { extractCommitments } = require('../services/claude');
const calendarSync = require('../services/calendar-sync');
const microsoftPlanner = require('../services/microsoft-planner');
const jira = require('../services/jira');
const fs = require('fs');
const { createModuleLogger } = require('../utils/logger');
const axios = require('axios');
const FormData = require('form-data');
const { getHttpsAgent } = require('../utils/https-agent');
const {
  getTaskProfileContext,
  recordSystemTaskUpdate,
  reviewExtractedTasksForCreation
} = require('../services/task-creation-governor');

const logger = createModuleLogger('TRANSCRIPTS');

// Voice processor service URL
const VOICE_PROCESSOR_URL = process.env.VOICE_PROCESSOR_URL || 'https://aicos-voice-processor:8004';
const MICROSERVICE_TIMEOUT = Number(process.env.VOICE_PROCESSOR_TIMEOUT_MS || 600000); // 10 minutes for meeting recordings

// Certificate-related error codes for better error detection
const CERT_ERROR_CODES = [
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'CERT_UNTRUSTED',
  'CERT_HAS_EXPIRED',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT'
];

const PRIORITY_RANK = {
  lowest: 1,
  low: 2,
  normal: 3,
  medium: 3,
  high: 4,
  highest: 5,
  critical: 5,
  urgent: 5
};

function normalizePriority(value, fallback = 'medium') {
  const normalized = String(value || '').toLowerCase().trim();
  if (!normalized) return fallback;
  if (normalized === 'normal') return 'medium';
  if (normalized === 'urgent' || normalized === 'critical') return 'highest';
  return PRIORITY_RANK[normalized] ? normalized : fallback;
}

function chooseHigherPriority(currentValue, nextValue) {
  const current = normalizePriority(currentValue);
  const next = normalizePriority(nextValue, current);
  return (PRIORITY_RANK[next] || 0) > (PRIORITY_RANK[current] || 0) ? next : current;
}

function normalizeDateValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toISOString().split('T')[0];
}

function areDatesDifferent(left, right) {
  return normalizeDateValue(left) !== normalizeDateValue(right);
}

function describeUpdateCandidate(candidate) {
  if (!candidate) return '';
  if (candidate.aiUpdates?.description) return candidate.aiUpdates.description;
  if (candidate.task_type === 'follow-up' && candidate.with) {
    return `Follow up with ${candidate.with}: ${candidate.description}`;
  }
  return candidate.description || '';
}

function buildUpdateNote(candidate, transcriptId) {
  const parts = [
    `Source transcript: ${transcriptId}`,
    candidate.gateReason,
    candidate.aiUpdates?.notes,
    `New signal: ${describeUpdateCandidate(candidate)}`
  ].filter(Boolean);

  if (candidate.deadline || candidate.aiUpdates?.deadline) {
    parts.push(`Date signal: ${candidate.aiUpdates?.deadline || candidate.deadline}`);
  }

  if (candidate.priority || candidate.aiUpdates?.priority) {
    parts.push(`Priority signal: ${candidate.aiUpdates?.priority || candidate.priority}`);
  }

  return parts.join('\n');
}

function appendNote(existing, note) {
  if (!note) return existing || null;
  const timestamp = new Date().toISOString();
  const block = `[${timestamp}] AI update\n${note}`;
  return existing ? `${existing}\n\n${block}` : block;
}

async function syncUpdatedTaskToExternalServices(db, beforeTask, updatedTask, updateNote, profileId) {
  if ((updatedTask.task_type || 'commitment') === 'risk') {
    return { calendarUpdated: false, microsoftUpdated: false, jiraUpdated: false };
  }

  const result = {
    calendarUpdated: false,
    microsoftUpdated: false,
    jiraUpdated: false
  };

  const deadlineChanged = areDatesDifferent(beforeTask.deadline, updatedTask.deadline);

  if (beforeTask.calendar_event_id && deadlineChanged) {
    try {
      const isConnected = await calendarSync.isConnected(profileId);
      if (isConnected) {
        if (beforeTask.calendar_event_id) {
          await calendarSync.deleteEvent(beforeTask.calendar_event_id, profileId);
        }

        if (updatedTask.deadline) {
          const { event, provider } = await calendarSync.createEventFromCommitment(updatedTask, profileId);
          await db.run(
            'UPDATE commitments SET calendar_event_id = ? WHERE id = ? AND profile_id = ?',
            [event.id, updatedTask.id, profileId]
          );
          updatedTask.calendar_event_id = event.id;
          logger.info(`Updated ${provider} calendar event ${event.id} for task ${updatedTask.id}`);
        } else if (beforeTask.calendar_event_id) {
          await db.run(
            'UPDATE commitments SET calendar_event_id = NULL WHERE id = ? AND profile_id = ?',
            [updatedTask.id, profileId]
          );
          updatedTask.calendar_event_id = null;
        }
        result.calendarUpdated = true;
      }
    } catch (error) {
      logger.warn(`Failed to update calendar event for task ${updatedTask.id}: ${error.message}`);
    }
  }

  if (updatedTask.microsoft_task_id) {
    try {
      const isMicrosoftConnected = await microsoftPlanner.isConnected(profileId);
      if (isMicrosoftConnected) {
        result.microsoftUpdated = await microsoftPlanner.updateTaskFromCommitment(
          updatedTask.microsoft_task_id,
          updatedTask,
          updateNote,
          profileId
        );
      }
    } catch (error) {
      logger.warn(`Failed to update Microsoft task ${updatedTask.microsoft_task_id}: ${error.message}`);
    }
  }

  if (updatedTask.jira_task_id) {
    try {
      const isJiraConnected = await jira.isConnected(profileId);
      if (isJiraConnected) {
        result.jiraUpdated = await jira.updateIssueFromCommitment(
          updatedTask.jira_task_id,
          updatedTask,
          updateNote,
          profileId
        );
      }
    } catch (error) {
      logger.warn(`Failed to update Jira issue ${updatedTask.jira_task_id}: ${error.message}`);
    }
  }

  return result;
}

async function applyTaskUpdatesFromReview(db, transcriptId, review, profileId) {
  const updates = review.updates || [];
  let updatedCount = 0;

  for (const candidate of updates) {
    const existingId = candidate.duplicateOfId;
    if (!existingId) continue;

    const beforeTask = await db.get(
      'SELECT * FROM commitments WHERE id = ? AND profile_id = ?',
      [existingId, profileId]
    );

    if (!beforeTask) {
      logger.warn(`Task creation review referenced missing duplicate task ${existingId}`);
      continue;
    }

    const updateNote = buildUpdateNote(candidate, transcriptId);
    const desiredPriority = candidate.aiUpdates?.priority || candidate.priority;
    const mergedPriority = chooseHigherPriority(beforeTask.priority || beforeTask.urgency, desiredPriority);
    const desiredDeadline = candidate.aiUpdates?.deadline || candidate.deadline || null;
    const improvedDescription = candidate.aiUpdates?.description || null;
    const changes = [];
    const params = [];
    const changedFields = {};

    if (improvedDescription && improvedDescription !== beforeTask.description) {
      changes.push('description = ?');
      params.push(improvedDescription);
      changedFields.description = { from: beforeTask.description, to: improvedDescription };
    }

    if (desiredDeadline && areDatesDifferent(beforeTask.deadline, desiredDeadline)) {
      changes.push('deadline = ?');
      params.push(desiredDeadline);
      changedFields.deadline = { from: beforeTask.deadline, to: desiredDeadline };
    }

    if (mergedPriority !== normalizePriority(beforeTask.priority || beforeTask.urgency)) {
      changes.push('priority = ?', 'urgency = ?');
      params.push(mergedPriority, mergedPriority);
      changedFields.priority = { from: beforeTask.priority || beforeTask.urgency, to: mergedPriority };
    }

    const desiredAssignee = candidate.aiUpdates?.assignee || candidate.assignee || null;
    if (desiredAssignee && !beforeTask.assignee) {
      changes.push('assignee = ?');
      params.push(desiredAssignee);
      changedFields.assignee = { from: beforeTask.assignee, to: desiredAssignee };
    }

    const nextSuggestedApproach = appendNote(beforeTask.suggested_approach, candidate.aiUpdates?.notes || updateNote);
    const nextSystemNotes = appendNote(beforeTask.system_notes, updateNote);
    changes.push('suggested_approach = ?', 'system_notes = ?');
    params.push(nextSuggestedApproach, nextSystemNotes);
    changedFields.notes = { appended: true };

    params.push(existingId, profileId);
    await db.run(
      `UPDATE commitments SET ${changes.join(', ')} WHERE id = ? AND profile_id = ?`,
      params
    );

    const updatedTask = await db.get(
      'SELECT * FROM commitments WHERE id = ? AND profile_id = ?',
      [existingId, profileId]
    );

    await syncUpdatedTaskToExternalServices(db, beforeTask, updatedTask, updateNote, profileId);
    await recordSystemTaskUpdate({
      profileId,
      task: updatedTask,
      reason: candidate.gateReason || 'New meeting/email signal updated existing task',
      updates: changedFields
    });

    updatedCount++;
  }

  return updatedCount;
}

/**
 * Check if a file is an audio file based on extension and mimetype
 */
function isAudioFile(filename, mimetype) {
  const audioExtensions = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm', '.ogg', '.flac'];
  const audioMimetypes = ['audio/', 'video/mp4', 'video/webm'];
  
  // Check by extension
  const ext = filename ? filename.toLowerCase().substring(filename.lastIndexOf('.')) : '';
  if (audioExtensions.includes(ext)) {
    return true;
  }
  
  // Check by mimetype
  if (mimetype) {
    if (audioMimetypes.some(type => mimetype.toLowerCase().startsWith(type))) {
      return true;
    }
  }
  
  return false;
}

/**
 * Transcribe audio file using voice-processor microservice
 */
async function transcribeAudioBuffer(audioBuffer, originalFilename, contentType = 'audio/webm') {
  try {
    logger.info(`Sending audio file to voice-processor: ${originalFilename}`);

    // Create form data for voice-processor
    const formData = new FormData();
    formData.append('file', audioBuffer, {
      filename: originalFilename,
      contentType
    });

    // Call voice-processor microservice with HTTPS agent
    const response = await axios.post(
      `${VOICE_PROCESSOR_URL}/transcribe`,
      formData,
      {
        headers: formData.getHeaders(),
        timeout: MICROSERVICE_TIMEOUT,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        httpsAgent: getHttpsAgent()
      }
    );
    
    logger.info(`Audio transcription successful: ${response.data.text?.length || 0} characters`);
    return response.data.text;

  } catch (error) {
    logger.error(`Audio transcription failed: ${error.message}`, { 
      code: error.code, 
      response: error.response?.status 
    });
    
    // Check if voice-processor is unavailable
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.response?.status === 503) {
      throw new Error('Voice processor service is unavailable. Please ensure the voice-processor microservice is running.');
    }
    
    // Check for certificate errors
    const isCertError = CERT_ERROR_CODES.includes(error.code) || 
                        (error.message && error.message.toLowerCase().includes('certificate'));
    if (isCertError) {
      throw new Error('TLS certificate verification failed. Set ALLOW_INSECURE_TLS environment variable to a truthy value (true, 1, yes, or on) or configure proper certificates.');
    }
    
    throw new Error(`Audio transcription failed: ${error.message}`);
  }
}

async function transcribeAudio(filePath, originalFilename, contentType = 'audio/webm') {
  const audioBuffer = fs.readFileSync(filePath);
  return transcribeAudioBuffer(audioBuffer, originalFilename, contentType);
}

async function createAndProcessTranscript({
  filename,
  content,
  source = 'manual',
  meetingDate = null,
  profileId = 2,
  statusMessage = 'Queued for AI extraction.'
}) {
  if (!filename || !content) {
    throw new Error('Filename and content are required');
  }

  const db = getDb();
  const result = await db.run(
    'INSERT INTO transcripts (filename, content, source, meeting_date, processing_status, processing_progress, status_message, profile_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [filename, content, source, meetingDate, 'processing', 0, statusMessage, profileId]
  );

  const transcriptId = result.lastID;
  const transcript = { id: transcriptId, filename, content, meeting_date: meetingDate };
  const reqContext = { profileId };

  processTranscriptAsync(transcriptId, transcript, db, reqContext).catch(err => {
    logger.error(`Background processing error for transcript ${transcriptId}:`, err);
  });

  return {
    transcriptId,
    status: 'processing'
  };
}

async function createPendingTranscript({
  filename,
  content,
  source = 'teams-pending',
  meetingDate = null,
  profileId = 2,
  statusMessage = 'Teams transcript and recording are not available yet. The next Teams sync will retry this meeting.'
}) {
  if (!filename || !content) {
    throw new Error('Filename and content are required');
  }

  const db = getDb();
  const result = await db.run(
    'INSERT INTO transcripts (filename, content, source, meeting_date, processing_status, processing_progress, status_message, processed, profile_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [filename, content, source, meetingDate, 'pending', 0, statusMessage, false, profileId]
  );

  return {
    transcriptId: result.lastID,
    status: 'pending'
  };
}

async function updateAndProcessTranscript({
  id,
  filename,
  content,
  source = 'manual',
  meetingDate = null,
  profileId = 2,
  statusMessage = 'Queued for AI extraction.'
}) {
  if (!id || !filename || !content) {
    throw new Error('Transcript id, filename, and content are required');
  }

  const db = getDb();
  await db.run(
    `UPDATE transcripts
     SET filename = ?, content = ?, source = ?, meeting_date = ?, processed = ?, processing_status = ?, processing_progress = ?, status_message = ?
     WHERE id = ? AND profile_id = ?`,
    [filename, content, source, meetingDate, false, 'processing', 0, statusMessage, id, profileId]
  );

  const transcript = { id, filename, content, meeting_date: meetingDate };
  const reqContext = { profileId };

  processTranscriptAsync(id, transcript, db, reqContext).catch(err => {
    logger.error(`Background processing error for transcript ${id}:`, err);
  });

  return {
    transcriptId: id,
    status: 'processing'
  };
}

/**
 * Save all task types (commitments, actions, follow-ups, risks) and create calendar events
 */
async function saveAllTasksWithCalendar(db, transcriptId, extracted, req) {
  const profileId = req.profileId || 2;
  const isMicrosoftConnected = await microsoftPlanner.isConnected(profileId);
  const isJiraConnected = await jira.isConnected(profileId);
  const transcriptSource = await db.get(
    'SELECT source, content, filename FROM transcripts WHERE id = ? AND profile_id = ?',
    [transcriptId, profileId]
  );

  const review = await reviewExtractedTasksForCreation(extracted, {
    profileId,
    sourceText: transcriptSource?.content || '',
    sourceType: transcriptSource?.source || ''
  });
  extracted = review.filtered;
  const profileContext = review.context || await getTaskProfileContext(profileId);
  const userNames = profileContext.userAliases || [];
  const primaryUserName = profileContext.primaryUserName || userNames[0] || null;
  const autoCreateCalendarEvents = profileContext.preferences?.taskCalendarAutoCreate === true;
  const isCalendarConnected = autoCreateCalendarEvents ? await calendarSync.isConnected(profileId) : false;
  logger.info(`Profile ${profileId} - Calendar auto-create: ${autoCreateCalendarEvents}, Calendar connected: ${isCalendarConnected}, Microsoft Planner connected: ${isMicrosoftConnected}, Jira connected: ${isJiraConnected}`);
  logger.info(`Task creation review filtered extraction`, {
    accepted: review.accepted.length,
    updates: review.updates.length,
    skipped: review.skipped.length,
    skippedReasons: review.skipped.slice(0, 10).map(item => item.reason)
  });

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
    if (userNames.length === 0) return true;
    return !isAssignedToUser(assignee); // Not assigned to user = needs confirmation
  };

  // Get database type for boolean handling
  const dbType = getDbType();
  const getBooleanValue = (value) => dbType === 'postgres' ? value : (value ? 1 : 0);

  let totalSaved = 0;
  const totalUpdated = await applyTaskUpdatesFromReview(db, transcriptId, review, profileId);
  let calendarEventsCreated = 0;
  
  // Prepare statement for all task types (with needs_confirmation)
  const stmt = db.prepare(
    'INSERT INTO commitments (transcript_id, description, assignee, deadline, urgency, suggested_approach, task_type, priority, status, needs_confirmation, profile_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
        }, { 
          timeout: 3000,
          headers: {
            'X-Profile-Id': req.profileId.toString()
          }
        });
        
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
        getBooleanValue(requiresConfirmation), // needs_confirmation
        req.profileId
      );
      
      const insertedId = result.lastID || (result.rows && result.rows[0] && result.rows[0].id);
      totalSaved++;
      
      // Only create calendar events for tasks clearly assigned to the user
      if (item.deadline && isUserTask && !requiresConfirmation) {
        // Create calendar event
        if (autoCreateCalendarEvents && isCalendarConnected) {
          try {
            const { event, provider } = await calendarSync.createEventFromCommitment({ ...item, id: insertedId, task_type: 'commitment' }, profileId);
            await db.run('UPDATE commitments SET calendar_event_id = ? WHERE id = ? AND profile_id = ?', [event.id, insertedId, req.profileId]);
            calendarEventsCreated++;
            logger.info(`Created ${provider} calendar event ${event.id} for commitment ${insertedId}`);
          } catch (calError) {
            logger.warn(`Failed to create calendar event: ${calError.message}`);
          }
        }
      }

      if (isUserTask && !requiresConfirmation && isMicrosoftConnected) {
        try {
          const microsoftTask = await microsoftPlanner.createTaskFromCommitment({ ...item, id: insertedId, task_type: 'commitment' }, profileId);
          await db.run('UPDATE commitments SET microsoft_task_id = ? WHERE id = ? AND profile_id = ?', [microsoftTask.id, insertedId, req.profileId]);
          logger.info(`Created Microsoft task ${microsoftTask.id} for commitment ${insertedId}`);
        } catch (msError) {
          logger.warn(`Failed to create Microsoft task: ${msError.message}`);
        }
      }
      
      // Create Jira issue for all commitments (regardless of deadline or assignment)
      if (isJiraConnected) {
        try {
          const jiraIssue = await jira.createIssueFromCommitment({ ...item, id: insertedId, task_type: 'commitment' }, req.profileId);
          await db.run('UPDATE commitments SET jira_task_id = ? WHERE id = ? AND profile_id = ?', [jiraIssue.key, insertedId, req.profileId]);
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
        getBooleanValue(requiresConfirmation),
        req.profileId
      );
      
      const insertedId = result.lastID || (result.rows && result.rows[0] && result.rows[0].id);
      totalSaved++;
      
      // Only create calendar events for tasks clearly assigned to the user
      if (item.deadline && isUserTask && !requiresConfirmation) {
        // Create calendar event
        if (autoCreateCalendarEvents && isCalendarConnected) {
          try {
            const { event, provider } = await calendarSync.createEventFromCommitment({ ...item, id: insertedId, task_type: 'action' }, profileId);
            await db.run('UPDATE commitments SET calendar_event_id = ? WHERE id = ? AND profile_id = ?', [event.id, insertedId, req.profileId]);
            calendarEventsCreated++;
            logger.info(`Created ${provider} calendar event ${event.id} for action ${insertedId}`);
          } catch (calError) {
            logger.warn(`Failed to create calendar event: ${calError.message}`);
          }
        }
        
      }

      if (isUserTask && !requiresConfirmation && isMicrosoftConnected) {
        try {
          const microsoftTask = await microsoftPlanner.createTaskFromCommitment({ ...item, id: insertedId, task_type: 'action' }, profileId);
          await db.run('UPDATE commitments SET microsoft_task_id = ? WHERE id = ? AND profile_id = ?', [microsoftTask.id, insertedId, req.profileId]);
          logger.info(`Created Microsoft task ${microsoftTask.id} for action ${insertedId}`);
        } catch (msError) {
          logger.warn(`Failed to create Microsoft task: ${msError.message}`);
        }
      }
      
      // Create Jira issue for all actions (regardless of deadline or assignment)
      if (isJiraConnected) {
        try {
          const jiraIssue = await jira.createIssueFromCommitment({ ...item, id: insertedId, task_type: 'action' }, req.profileId);
          await db.run('UPDATE commitments SET jira_task_id = ? WHERE id = ? AND profile_id = ?', [jiraIssue.key, insertedId, req.profileId]);
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
      const assignee = primaryUserName;
      const requiresConfirmation = needsConfirmation(assignee);
      const isUserTask = Boolean(assignee) && isAssignedToUser(assignee);
      
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
        getBooleanValue(requiresConfirmation),
        req.profileId
      );
      
      const insertedId = result.lastID || (result.rows && result.rows[0] && result.rows[0].id);
      totalSaved++;
      
      // Only create calendar events for tasks clearly assigned to the user
      if (item.deadline && isUserTask && !requiresConfirmation) {
        // Create calendar event
        if (autoCreateCalendarEvents && isCalendarConnected) {
          try {
            const { event, provider } = await calendarSync.createEventFromCommitment({ ...item, description, id: insertedId, task_type: 'follow-up' }, profileId);
            await db.run('UPDATE commitments SET calendar_event_id = ? WHERE id = ? AND profile_id = ?', [event.id, insertedId, req.profileId]);
            calendarEventsCreated++;
            logger.info(`Created ${provider} calendar event ${event.id} for follow-up ${insertedId}`);
          } catch (calError) {
            logger.warn(`Failed to create calendar event: ${calError.message}`);
          }
        }
        
      }

      if (isUserTask && !requiresConfirmation && isMicrosoftConnected) {
        try {
          const microsoftTask = await microsoftPlanner.createTaskFromCommitment({ ...item, description, id: insertedId, task_type: 'follow-up' }, profileId);
          await db.run('UPDATE commitments SET microsoft_task_id = ? WHERE id = ? AND profile_id = ?', [microsoftTask.id, insertedId, req.profileId]);
          logger.info(`Created Microsoft task ${microsoftTask.id} for follow-up ${insertedId}`);
        } catch (msError) {
          logger.warn(`Failed to create Microsoft task: ${msError.message}`);
        }
      }
      
      // Create Jira issue for all follow-ups (regardless of deadline or assignment)
      if (isJiraConnected) {
        try {
          const jiraIssue = await jira.createIssueFromCommitment({ ...item, description, id: insertedId, task_type: 'follow-up' }, req.profileId);
          await db.run('UPDATE commitments SET jira_task_id = ? WHERE id = ? AND profile_id = ?', [jiraIssue.key, insertedId, req.profileId]);
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
        getBooleanValue(false), // needs_confirmation = false for risks
        req.profileId
      );
      
      const insertedId = result.lastID || (result.rows && result.rows[0] && result.rows[0].id);
      totalSaved++;
      
      // Risks are not synced to Jira, Microsoft Planner, or calendar - they're informational/awareness items only
    }
    logger.info(`Saved ${extracted.risks.length} risks (no calendar events for risks)`);
  }
  
  await stmt.finalize();
  logger.info(`Total: Saved ${totalSaved} tasks, updated ${totalUpdated} tasks, created ${calendarEventsCreated} calendar events`);
  
  return {
    saved: totalSaved,
    updated: totalUpdated,
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
      logger.warn('File upload rejected', {
        reason: err.message,
        code: err.code
      });
      return res.status(400).json({ error: 'File upload failed', message: err.message });
    }

    if (!req.file) {
      logger.warn('No file uploaded in request');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    logger.info(`Uploaded file: ${req.file.originalname} (${req.file.size} bytes)`);

    try {
      const db = getDb();
      
      // Check if this is an audio file
      const isAudio = isAudioFile(req.file.originalname, req.file.mimetype);
      logger.info(`File type: ${isAudio ? 'audio' : 'text'} (mimetype: ${req.file.mimetype})`);
      
      let content;
      
      if (isAudio) {
        // Audio file - transcribe it using voice-processor
        logger.info('Audio file detected, transcribing...');
        try {
          content = await transcribeAudio(req.file.path, req.file.originalname);
          logger.info(`Transcription complete: ${content.length} characters`);
        } catch (transcribeError) {
          // Extract meaningful error message from axios error
          const errorMessage = transcribeError.response?.data?.message 
            || transcribeError.message 
            || 'Unknown error';
          const errorCode = transcribeError.code;
          
          logger.error('Transcription error:', { 
            message: errorMessage, 
            code: errorCode,
            status: transcribeError.response?.status 
          });
          
          // Clean up uploaded file
          try {
            fs.unlinkSync(req.file.path);
          } catch (cleanupErr) {
            logger.warn('Failed to clean up uploaded file:', cleanupErr);
          }
          return res.status(500).json({ 
            error: 'Audio transcription failed', 
            message: transcribeError.message
          });
        }
      } else {
        // Text file - read as UTF-8
        content = fs.readFileSync(req.file.path, 'utf-8');
        logger.info(`Read file content: ${content.length} characters`);
      }

      // Get meeting date from form data (optional)
      const meetingDate = req.body.meetingDate || req.body.meeting_date || null;
      logger.info(`Meeting date: ${meetingDate || 'not provided'}`);

      // Save to database with processing status
      const result = await db.run(
        'INSERT INTO transcripts (filename, content, source, meeting_date, processing_status, processing_progress, status_message, profile_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          req.file.originalname,
          content,
          isAudio ? 'recording' : 'upload',
          meetingDate,
          'processing',
          0,
          isAudio ? 'Audio was transcribed and is queued for AI extraction.' : 'Uploaded transcript is queued for AI extraction.',
          req.profileId
        ]
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
      processTranscriptAsync(transcriptId, transcript, db, req).catch(err => {
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
    const { transcriptId } = await createAndProcessTranscript({
      filename,
      content,
      source: source || 'manual',
      meetingDate: meetingDateValue,
      profileId: req.profileId
    });

    // Return immediately - process in background
    res.json({ 
      success: true,
      message: 'Transcript saved, processing in background',
      transcriptId,
      status: 'processing'
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
      'SELECT id, filename, upload_date, processed, source, processing_status, processing_progress, status_message FROM transcripts WHERE profile_id = ? ORDER BY upload_date DESC LIMIT ?',
      [req.profileId, limit]
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
      'SELECT * FROM transcripts WHERE id = ? AND profile_id = ?',
      [id, req.profileId]
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
      'DELETE FROM transcripts WHERE id = ? AND profile_id = ?',
      [id, req.profileId]
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
      'SELECT * FROM commitments WHERE transcript_id = ? AND profile_id = ? ORDER BY created_date DESC',
      [id, req.profileId]
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
      'SELECT * FROM context WHERE transcript_id = ? AND profile_id = ? ORDER BY created_date DESC',
      [id, req.profileId]
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
    const transcript = await db.get('SELECT * FROM transcripts WHERE id = ? AND profile_id = ?', [id, req.profileId]);
    
    if (!transcript) {
      logger.warn(`Transcript ${id} not found for reprocessing`);
      return res.status(404).json({ error: 'Transcript not found' });
    }
    
    // Set status to processing immediately
    await db.run(
      'UPDATE transcripts SET processing_status = ?, processing_progress = ?, status_message = ? WHERE id = ? AND profile_id = ?',
      ['processing', 0, 'Reprocessing started. Existing extracted tasks are being refreshed from this transcript.', id, req.profileId]
    );
    
    logger.info(`Reprocessing transcript: ${transcript.filename}`);
    
    // Return immediately - process in background
    res.json({ 
      success: true,
      message: 'Transcript reprocessing started',
      status: 'processing'
    });
    
    // Process in background
    processTranscriptAsync(id, transcript, db, req).catch(err => {
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
async function processTranscriptAsync(id, transcript, db, req) {
  try {
    // Update progress: Deleting old data
    await db.run(
      'UPDATE transcripts SET processing_progress = ?, status_message = ? WHERE id = ? AND profile_id = ?',
      [10, 'Removing previously extracted tasks and notes for this transcript.', id, req.profileId]
    );
    
    // Delete existing commitments and context for this transcript
    // Get existing calendar event IDs before deleting
    const existingTasks = await db.all('SELECT calendar_event_id FROM commitments WHERE transcript_id = ? AND profile_id = ? AND calendar_event_id IS NOT NULL', [id, req.profileId]);
    const eventIdsToDelete = existingTasks.map(t => t.calendar_event_id).filter(Boolean);
    
    // Delete calendar events if a calendar is connected
    if (eventIdsToDelete.length > 0 && await calendarSync.isConnected(req.profileId)) {
      logger.info(`Deleting ${eventIdsToDelete.length} calendar events for transcript ${id}`);
      try {
        await calendarSync.deleteEvents(eventIdsToDelete, req.profileId);
        logger.info(`Deleted calendar events successfully`);
      } catch (calError) {
        logger.warn(`Failed to delete some calendar events:`, calError.message);
      }
    }
    
    // Delete tasks and context from database
    await db.run('DELETE FROM commitments WHERE transcript_id = ? AND profile_id = ?', [id, req.profileId]);
    await db.run('DELETE FROM context WHERE transcript_id = ? AND profile_id = ?', [id, req.profileId]);
    logger.info(`Cleared existing tasks and context for transcript ${id}`);
    
    // Update progress: Extracting with AI
    await db.run(
      'UPDATE transcripts SET processing_progress = ?, status_message = ? WHERE id = ? AND profile_id = ?',
      [30, 'AI extraction is reading the transcript for commitments, follow-ups, risks, and notes.', id, req.profileId]
    );
    
    // Extract commitments using Claude (use meeting_date if available)
    const meetingDate = transcript.meeting_date || null;
    const extracted = await extractCommitments(transcript.content, meetingDate, req.profileId);
    logger.info('Commitments extracted successfully', {
      commitments: extracted.commitments?.length || 0,
      actionItems: extracted.actionItems?.length || 0,
      meetingDate
    });
    
    // Update progress: Saving tasks
    await db.run(
      'UPDATE transcripts SET processing_progress = ?, status_message = ? WHERE id = ? AND profile_id = ?',
      [70, 'Saving extracted tasks and syncing eligible task-system records.', id, req.profileId]
    );
    
    // Save commitments and create calendar events
    const taskStats = await saveAllTasksWithCalendar(db, id, extracted, req);
    
    // Update progress: Generating meeting notes
    await db.run(
      'UPDATE transcripts SET processing_progress = ?, status_message = ? WHERE id = ? AND profile_id = ?',
      [85, 'Generating the meeting recap.', id, req.profileId]
    );
    
    // Generate meeting notes
    try {
      const aiService = require('../services/ai-service');
      const meetingNotes = await aiService.generateMeetingNotes(transcript.content, req.profileId);
      await db.run('UPDATE transcripts SET meeting_notes = ? WHERE id = ? AND profile_id = ?', [meetingNotes, id, req.profileId]);
      logger.info(`Generated meeting notes for transcript ${id}`);
    } catch (notesError) {
      logger.warn(`Failed to generate meeting notes for transcript ${id}:`, notesError.message);
      // Don't fail the whole process if notes generation fails
    }
    
    // Update progress: Complete
    await db.run('UPDATE transcripts SET processing_status = ?, processing_progress = ?, processed = ?, status_message = ? WHERE id = ? AND profile_id = ?',
      ['completed', 100, true, 'Processing completed successfully.', id, req.profileId]);
    
    logger.info(`Transcript ${id} reprocessing completed successfully`, taskStats);
    
  } catch (error) {
    logger.error(`Error in background processing for transcript ${id}:`, error);
    
    // Mark as failed
    await db.run('UPDATE transcripts SET processing_status = ?, processing_progress = ?, processed = ?, status_message = ? WHERE id = ? AND profile_id = ?',
      ['failed', 0, true, error.message || 'Transcript processing failed. Check backend logs for details.', id, req.profileId]);
  }
}

/**
 * GET /api/transcripts/:id/meeting-notes
 * Get or generate meeting notes for a transcript
 */
router.get('/:id/meeting-notes', async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { regenerate } = req.query;

    logger.info(`Fetching meeting notes for transcript ${id}`, { regenerate: regenerate === 'true' });

    // Get transcript
    const transcript = await db.get('SELECT * FROM transcripts WHERE id = ? AND profile_id = ?', [id, req.profileId]);
    
    if (!transcript) {
      return res.status(404).json({ success: false, message: 'Transcript not found' });
    }

    // If notes exist and not regenerating, return them
    if (transcript.meeting_notes && regenerate !== 'true') {
      logger.info(`Returning cached meeting notes for transcript ${id}`);
      return res.json({
        success: true,
        notes: transcript.meeting_notes,
        cached: true
      });
    }

    // Generate new meeting notes
    logger.info(`Generating meeting notes for transcript ${id}`);
    const aiService = require('../services/ai-service');
    const notes = await aiService.generateMeetingNotes(transcript.content, req.profileId);

    // Save notes to database
    await db.run('UPDATE transcripts SET meeting_notes = ? WHERE id = ? AND profile_id = ?', [notes, id, req.profileId]);
    
    logger.info(`Meeting notes generated and saved for transcript ${id}`);

    res.json({
      success: true,
      notes,
      cached: false
    });

  } catch (error) {
    logger.error('Error generating meeting notes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate meeting notes',
      error: error.message
    });
  }
});

/**
 * POST /api/transcripts/:id/meeting-notes
 * Manually save/update meeting notes for a transcript
 */
router.post('/:id/meeting-notes', async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { notes } = req.body;

    if (!notes) {
      return res.status(400).json({ success: false, message: 'Notes content required' });
    }

    logger.info(`Saving manual meeting notes for transcript ${id}`);

    // Verify transcript exists
    const transcript = await db.get('SELECT id FROM transcripts WHERE id = ? AND profile_id = ?', [id, req.profileId]);
    
    if (!transcript) {
      return res.status(404).json({ success: false, message: 'Transcript not found' });
    }

    // Save notes
    await db.run('UPDATE transcripts SET meeting_notes = ? WHERE id = ? AND profile_id = ?', [notes, id, req.profileId]);
    
    logger.info(`Meeting notes manually saved for transcript ${id}`);

    res.json({
      success: true,
      message: 'Meeting notes saved successfully'
    });

  } catch (error) {
    logger.error('Error saving meeting notes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save meeting notes',
      error: error.message
    });
  }
});

router.createAndProcessTranscript = createAndProcessTranscript;
router.createPendingTranscript = createPendingTranscript;
router.updateAndProcessTranscript = updateAndProcessTranscript;
router.transcribeAudioBuffer = transcribeAudioBuffer;
router.saveAllTasksWithCalendar = saveAllTasksWithCalendar;

module.exports = router;
