const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { DEFAULT_PROMPTS } = require('../config/default-prompts');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('PROMPTS');

/**
 * Get all prompts
 */
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const rows = await db.all('SELECT * FROM prompts ORDER BY name');
    
    // If no prompts in database, initialize with defaults
    if (rows.length === 0) {
      logger.info('No prompts found, initializing with defaults');
      await initializeDefaultPrompts();
      const newRows = await db.all('SELECT * FROM prompts ORDER BY name');
      return res.json(newRows);
    }
    
    res.json(rows);
  } catch (error) {
    logger.error('Error fetching prompts:', error);
    res.status(500).json({ error: 'Failed to fetch prompts', message: error.message });
  }
});

/**
 * Get a specific prompt by key
 */
router.get('/:key', async (req, res) => {
  try {
    const db = getDb();
    const row = await db.get('SELECT * FROM prompts WHERE key = ?', [req.params.key]);
    
    if (!row) {
      return res.status(404).json({ error: 'Prompt not found' });
    }
    
    res.json(row);
  } catch (error) {
    logger.error('Error fetching prompt:', error);
    res.status(500).json({ error: 'Failed to fetch prompt', message: error.message });
  }
});

/**
 * Update a prompt
 */
router.put('/:key', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt text is required' });
    }
    
    const db = getDb();
    await db.run(
      'UPDATE prompts SET prompt = ?, updated_date = CURRENT_TIMESTAMP WHERE key = ?',
      [prompt, req.params.key]
    );
    
    logger.info(`Updated prompt: ${req.params.key}`);
    res.json({ message: 'Prompt updated successfully' });
  } catch (error) {
    logger.error('Error updating prompt:', error);
    res.status(500).json({ error: 'Failed to update prompt', message: error.message });
  }
});

/**
 * Reset a prompt to default
 */
router.post('/:key/reset', async (req, res) => {
  try {
    const defaultPrompt = DEFAULT_PROMPTS[req.params.key];
    
    if (!defaultPrompt) {
      return res.status(404).json({ error: 'Default prompt not found' });
    }
    
    const db = getDb();
    await db.run(
      'UPDATE prompts SET prompt = ?, updated_date = CURRENT_TIMESTAMP WHERE key = ?',
      [defaultPrompt.prompt, req.params.key]
    );
    
    logger.info(`Reset prompt to default: ${req.params.key}`);
    res.json({ message: 'Prompt reset to default successfully' });
  } catch (error) {
    logger.error('Error resetting prompt:', error);
    res.status(500).json({ error: 'Failed to reset prompt', message: error.message });
  }
});

/**
 * Initialize default prompts in database
 */
async function initializeDefaultPrompts() {
  const db = getDb();
  
  for (const [key, config] of Object.entries(DEFAULT_PROMPTS)) {
    try {
      // Use DatabaseWrapper which handles INSERT OR REPLACE for both SQLite and PostgreSQL
      await db.run(
        'INSERT OR REPLACE INTO prompts (key, name, description, prompt, created_date, updated_date) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [key, config.name, config.description, config.prompt]
      );
      logger.info(`Initialized prompt: ${key}`);
    } catch (error) {
      logger.error(`Error initializing prompt ${key}:`, error);
      // Try updating if insert failed
      try {
        await db.run(
          'UPDATE prompts SET name = ?, description = ?, prompt = ?, updated_date = CURRENT_TIMESTAMP WHERE key = ?',
          [config.name, config.description, config.prompt, key]
        );
        logger.info(`Updated existing prompt: ${key}`);
      } catch (updateError) {
        logger.error(`Failed to update prompt ${key}:`, updateError);
      }
    }
  }
}

module.exports = router;

