const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { extractCommitments } = require('../services/claude');
const transcriptRoutes = require('./transcripts');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('WEBHOOK');

/**
 * Email forwarding webhook
 * Accepts emails forwarded from services like SendGrid, Mailgun, etc.
 */
router.post('/email', async (req, res) => {
  logger.info('Email webhook received');
  
  try {
    const { from, subject, text, html } = req.body;
    
    if (!text && !html) {
      logger.warn('Email webhook received without text content');
      return res.status(400).json({ error: 'No email content provided' });
    }

    // Use text content, fallback to HTML stripped of tags
    const rawContent = text || html.replace(/<[^>]*>/g, '');
    const content = [
      `Email: ${subject || '(No subject)'}`,
      `From: ${from || 'Unknown'}`,
      'To: Unknown',
      '',
      rawContent
    ].join('\n');
    
    logger.info(`Processing email: "${subject}" from ${from}`);
    
    const db = getDb();

    // Save email as transcript
    const filename = `Email: ${subject || 'No Subject'}.txt`;
    const result = await db.run(
      'INSERT INTO transcripts (filename, content, source, profile_id) VALUES (?, ?, ?, ?)',
      [filename, content, 'email', req.profileId]
    );

    const transcriptId = result.lastID;
    logger.info(`Email saved as transcript ID: ${transcriptId}`);

    try {
      // Extract commitments using Claude
      logger.info('Extracting commitments from email...');
      const extracted = await extractCommitments(content, null, req.profileId);
      logger.info('Email extraction completed', {
        commitments: extracted.commitments?.length || 0,
        actionItems: extracted.actionItems?.length || 0,
        followUps: extracted.followUps?.length || 0,
        risks: extracted.risks?.length || 0
      });

      const taskStats = await transcriptRoutes.saveAllTasksWithCalendar(db, transcriptId, extracted, req);

      res.json({
        message: 'Email processed successfully',
        transcriptId,
        extracted: taskStats.byType,
        tasks: taskStats
      });
    } catch (extractError) {
      logger.error('Error extracting commitments from email:', extractError);
      res.json({
        message: 'Email saved but extraction failed',
        transcriptId,
        warning: 'Could not extract commitments automatically'
      });
    }
  } catch (error) {
    logger.error('Error processing email webhook:', error);
    res.status(500).json({ 
      error: 'Error processing email', 
      message: error.message
    });
  }
});

/**
 * Generic webhook for testing
 */
router.post('/test', (req, res) => {
  logger.info('Test webhook received:', req.body);
  res.json({ 
    message: 'Webhook received successfully',
    timestamp: new Date().toISOString(),
    body: req.body
  });
});

/**
 * Health check for webhooks
 */
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
