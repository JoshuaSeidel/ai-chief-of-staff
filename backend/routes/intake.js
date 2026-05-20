const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const microsoftIntake = require('../services/microsoft-intake');
const transcriptRoutes = require('./transcripts');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('INTAKE');

async function findExistingTranscript(filename, source, profileId) {
  const db = getDb();
  return db.get(
    'SELECT id, filename, processing_status, processing_progress FROM transcripts WHERE filename = ? AND source = ? AND profile_id = ?',
    [filename, source, profileId]
  );
}

async function processTranscriptOnce({ filename, content, source, meetingDate, profileId }) {
  const existing = await findExistingTranscript(filename, source, profileId);

  if (existing) {
    return {
      imported: false,
      transcriptId: existing.id,
      status: existing.processing_status || 'completed',
      processingProgress: existing.processing_progress
    };
  }

  const result = await transcriptRoutes.createAndProcessTranscript({
    filename,
    content,
    source,
    meetingDate,
    profileId
  });

  return {
    imported: true,
    transcriptId: result.transcriptId,
    status: result.status
  };
}

function summarizeCaptureAssets(captureAssets, usedTranscript = false) {
  return {
    usedTeamsTranscript: usedTranscript,
    onlineMeetingId: captureAssets?.onlineMeeting?.id || null,
    transcriptCount: captureAssets?.transcripts?.length || 0,
    recordingCount: captureAssets?.recordings?.length || 0,
    warnings: captureAssets?.warnings || []
  };
}

function getMicrosoftSetupMessage(error) {
  const message = error?.message || '';
  if (
    message.includes('Microsoft not connected')
    || message.includes('Microsoft OAuth credentials not configured')
  ) {
    return message;
  }

  return null;
}

function sendMicrosoftSetupState(res, collectionKey, error) {
  return res.json({
    success: true,
    connected: false,
    [collectionKey]: [],
    message: getMicrosoftSetupMessage(error)
  });
}

async function buildMeetingImportPayload(meeting, profileId) {
  const meetingDate = meeting.start?.dateTime ? meeting.start.dateTime.slice(0, 10) : null;
  const hasOnlineMeeting = Boolean(meeting.isOnlineMeeting || meeting.onlineMeeting || meeting.onlineMeetingUrl);

  if (hasOnlineMeeting) {
    try {
      const captureAssets = await microsoftIntake.getMeetingCaptureAssets(meeting, profileId);
      const latestTranscript = microsoftIntake.selectLatestTranscript(captureAssets.transcripts);

      if (captureAssets.onlineMeeting && latestTranscript) {
        const transcriptContent = await microsoftIntake.downloadTranscriptContent({
          organizerUserId: captureAssets.organizerUserId,
          onlineMeetingId: captureAssets.onlineMeeting.id,
          transcriptId: latestTranscript.id
        });

        return {
          filename: microsoftIntake.meetingTranscriptFilename(meeting, latestTranscript),
          content: microsoftIntake.formatMeetingWithTranscript(meeting, transcriptContent, captureAssets, latestTranscript),
          source: 'teams-transcript',
          meetingDate,
          profileId,
          capture: summarizeCaptureAssets(captureAssets, true)
        };
      }

      return {
        filename: microsoftIntake.meetingFilename(meeting),
        content: microsoftIntake.formatMeetingForTranscript(meeting),
        source: 'calendar-meeting',
        meetingDate,
        profileId,
        capture: summarizeCaptureAssets(captureAssets, false)
      };
    } catch (error) {
      logger.warn('Teams transcript capture unavailable; falling back to calendar meeting import', error.message);
      return {
        filename: microsoftIntake.meetingFilename(meeting),
        content: microsoftIntake.formatMeetingForTranscript(meeting),
        source: 'calendar-meeting',
        meetingDate,
        profileId,
        capture: {
          usedTeamsTranscript: false,
          onlineMeetingId: null,
          transcriptCount: 0,
          recordingCount: 0,
          warnings: [error.message]
        }
      };
    }
  }

  return {
    filename: microsoftIntake.meetingFilename(meeting),
    content: microsoftIntake.formatMeetingForTranscript(meeting),
    source: 'calendar-meeting',
    meetingDate,
    profileId,
    capture: {
      usedTeamsTranscript: false,
      onlineMeetingId: null,
      transcriptCount: 0,
      recordingCount: 0,
      warnings: []
    }
  };
}

router.get('/email/messages', async (req, res) => {
  try {
    const profileId = req.profileId || 2;
    const messages = await microsoftIntake.listMessages({
      limit: req.query.limit,
      unreadOnly: req.query.unreadOnly === 'true',
      query: req.query.query || ''
    }, profileId);

    res.json({ success: true, messages });
  } catch (error) {
    if (getMicrosoftSetupMessage(error)) {
      return sendMicrosoftSetupState(res, 'messages', error);
    }

    logger.error('Error listing email messages', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list email messages',
      message: error.message
    });
  }
});

router.post('/email/messages/:id/process', async (req, res) => {
  try {
    const profileId = req.profileId || 2;
    const message = await microsoftIntake.getMessage(req.params.id, profileId);
    const filename = microsoftIntake.messageFilename(message);
    const content = microsoftIntake.formatMessageForTranscript(message);
    const meetingDate = message.receivedDateTime ? message.receivedDateTime.slice(0, 10) : null;
    const result = await processTranscriptOnce({
      filename,
      content,
      source: 'email',
      meetingDate,
      profileId
    });

    res.json({
      success: true,
      message: result.imported ? 'Email queued for processing' : 'Email was already imported',
      ...result
    });
  } catch (error) {
    const setupMessage = getMicrosoftSetupMessage(error);
    if (setupMessage) {
      return res.status(409).json({
        success: false,
        connected: false,
        error: 'Microsoft not connected',
        message: setupMessage
      });
    }

    logger.error('Error processing email message', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process email message',
      message: error.message
    });
  }
});

router.post('/email/sync', async (req, res) => {
  try {
    const profileId = req.profileId || 2;
    const messages = await microsoftIntake.listMessages({
      limit: req.body.limit || 10,
      unreadOnly: req.body.unreadOnly === true,
      query: req.body.query || ''
    }, profileId);

    const results = [];
    for (const messageSummary of messages) {
      const message = await microsoftIntake.getMessage(messageSummary.id, profileId);
      const filename = microsoftIntake.messageFilename(message);
      const content = microsoftIntake.formatMessageForTranscript(message);
      const meetingDate = message.receivedDateTime ? message.receivedDateTime.slice(0, 10) : null;
      results.push(await processTranscriptOnce({
        filename,
        content,
        source: 'email',
        meetingDate,
        profileId
      }));
    }

    res.json({
      success: true,
      imported: results.filter(result => result.imported).length,
      skipped: results.filter(result => !result.imported).length,
      results
    });
  } catch (error) {
    const setupMessage = getMicrosoftSetupMessage(error);
    if (setupMessage) {
      return res.status(409).json({
        success: false,
        connected: false,
        error: 'Microsoft not connected',
        message: setupMessage
      });
    }

    logger.error('Error syncing email messages', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync email messages',
      message: error.message
    });
  }
});

router.get('/meetings', async (req, res) => {
  try {
    const profileId = req.profileId || 2;
    const meetings = await microsoftIntake.listMeetings({
      start: req.query.start,
      end: req.query.end,
      limit: req.query.limit,
      query: req.query.query || ''
    }, profileId);

    res.json({ success: true, meetings });
  } catch (error) {
    if (getMicrosoftSetupMessage(error)) {
      return sendMicrosoftSetupState(res, 'meetings', error);
    }

    logger.error('Error listing meetings', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list meetings',
      message: error.message
    });
  }
});

router.get('/meetings/:id/assets', async (req, res) => {
  try {
    const profileId = req.profileId || 2;
    const meeting = await microsoftIntake.getMeeting(req.params.id, profileId);
    const captureAssets = await microsoftIntake.getMeetingCaptureAssets(meeting, profileId);

    res.json({
      success: true,
      assets: captureAssets
    });
  } catch (error) {
    const setupMessage = getMicrosoftSetupMessage(error);
    if (setupMessage) {
      return res.status(409).json({
        success: false,
        connected: false,
        error: 'Microsoft not connected',
        message: setupMessage
      });
    }

    logger.error('Error listing meeting capture assets', error);
    res.status(503).json({
      success: false,
      error: 'Failed to list meeting capture assets',
      message: error.message
    });
  }
});

router.post('/meetings/:id/process', async (req, res) => {
  try {
    const profileId = req.profileId || 2;
    const meeting = await microsoftIntake.getMeeting(req.params.id, profileId);
    const payload = await buildMeetingImportPayload(meeting, profileId);
    const result = await processTranscriptOnce(payload);

    res.json({
      success: true,
      message: result.imported
        ? (payload.capture?.usedTeamsTranscript ? 'Teams transcript queued for processing' : 'Meeting queued for processing')
        : 'Meeting was already imported',
      source: payload.source,
      capture: payload.capture,
      ...result
    });
  } catch (error) {
    const setupMessage = getMicrosoftSetupMessage(error);
    if (setupMessage) {
      return res.status(409).json({
        success: false,
        connected: false,
        error: 'Microsoft not connected',
        message: setupMessage
      });
    }

    logger.error('Error processing meeting', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process meeting',
      message: error.message
    });
  }
});

router.post('/meetings/import', async (req, res) => {
  try {
    const profileId = req.profileId || 2;
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];

    if (ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Meeting IDs are required'
      });
    }

    const results = [];
    for (const id of ids) {
      const meeting = await microsoftIntake.getMeeting(id, profileId);
      const payload = await buildMeetingImportPayload(meeting, profileId);
      const result = await processTranscriptOnce(payload);
      results.push({
        ...result,
        source: payload.source,
        capture: payload.capture
      });
    }

    res.json({
      success: true,
      imported: results.filter(result => result.imported).length,
      skipped: results.filter(result => !result.imported).length,
      results
    });
  } catch (error) {
    const setupMessage = getMicrosoftSetupMessage(error);
    if (setupMessage) {
      return res.status(409).json({
        success: false,
        connected: false,
        error: 'Microsoft not connected',
        message: setupMessage
      });
    }

    logger.error('Error importing meetings', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import meetings',
      message: error.message
    });
  }
});

module.exports = router;
