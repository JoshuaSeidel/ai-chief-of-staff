const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { extractCommitments } = require('../services/claude');
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
    const content = text || html.replace(/<[^>]*>/g, '');
    
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
      logger.info(`Extracted ${extracted.commitments?.length || 0} commitments, ${extracted.actionItems?.length || 0} action items`);

      // Save commitments
      if (extracted.commitments && extracted.commitments.length > 0) {
        const stmt = db.prepare('INSERT INTO commitments (transcript_id, description, assignee, deadline, profile_id) VALUES (?, ?, ?, ?, ?)');
        
        for (const commitment of extracted.commitments) {
          stmt.run(transcriptId, commitment.description, commitment.assignee || null, commitment.deadline || null, req.profileId);
        }
        
        await stmt.finalize();
        logger.info(`Saved ${extracted.commitments.length} commitments from email`);
      }

      // Save context items
      if (extracted.actionItems && extracted.actionItems.length > 0) {
        const stmt = db.prepare('INSERT INTO context (transcript_id, context_type, content, priority, profile_id) VALUES (?, ?, ?, ?, ?)');
        
        for (const item of extracted.actionItems) {
          stmt.run(transcriptId, 'action_item', item.description, item.priority || 'medium', req.profileId);
        }
        
        await stmt.finalize();
        logger.info(`Saved ${extracted.actionItems.length} action items from email`);
      }

      res.json({
        message: 'Email processed successfully',
        transcriptId,
        extracted
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

