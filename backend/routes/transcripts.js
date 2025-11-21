const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { extractCommitments } = require('../services/claude');
const fs = require('fs');

// Logger for the transcripts route
const logger = {
  info: (msg, ...args) => console.log(`[TRANSCRIPTS] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[TRANSCRIPTS ERROR] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[TRANSCRIPTS WARNING] ${msg}`, ...args)
};

/**
 * Upload transcript
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

      // Save to database
      const result = await db.run(
        'INSERT INTO transcripts (filename, content, source) VALUES (?, ?, ?)',
        [req.file.originalname, content, 'upload']
      );

      const transcriptId = result.lastID;
      logger.info(`Transcript saved with ID: ${transcriptId}`);

      try {
        // Extract commitments using Claude
        logger.info('Extracting commitments with Claude...');
        const extracted = await extractCommitments(content);
        logger.info(`Extracted ${extracted.commitments?.length || 0} commitments, ${extracted.actionItems?.length || 0} action items`);

        // Save commitments
        if (extracted.commitments && extracted.commitments.length > 0) {
          const stmt = db.prepare('INSERT INTO commitments (transcript_id, description, assignee, deadline) VALUES (?, ?, ?, ?)');
          
          for (const commitment of extracted.commitments) {
            stmt.run(transcriptId, commitment.description, commitment.assignee, commitment.deadline);
          }
          
          await stmt.finalize();
          logger.info(`Saved ${extracted.commitments.length} commitments`);
        }

        // Save context items
        if (extracted.actionItems && extracted.actionItems.length > 0) {
          const stmt = db.prepare('INSERT INTO context (transcript_id, context_type, content, priority) VALUES (?, ?, ?, ?)');
          
          for (const item of extracted.actionItems) {
            stmt.run(transcriptId, 'action_item', item.description, item.priority);
          }
          
          await stmt.finalize();
          logger.info(`Saved ${extracted.actionItems.length} action items`);
        }

        res.json({
          message: 'Transcript uploaded and processed successfully',
          transcriptId,
          extracted
        });
      } catch (extractError) {
        logger.error('Error extracting commitments:', extractError);
        res.json({
          message: 'Transcript uploaded but extraction failed',
          transcriptId,
          warning: 'Could not extract commitments automatically',
          error: extractError.message
        });
      }
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
 * Get all transcripts
 */
router.get('/', async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  logger.info(`Fetching up to ${limit} transcripts`);
  
  try {
    const db = getDb();
    const rows = await db.all(
      'SELECT id, filename, upload_date, processed, source FROM transcripts ORDER BY upload_date DESC LIMIT ?',
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

module.exports = router;
