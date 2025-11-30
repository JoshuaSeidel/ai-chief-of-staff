/**
 * Configuration Management API Routes
 * Handles system configuration stored in PostgreSQL
 */

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// Database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * GET /api/config
 * Get all non-sensitive configuration
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT config_key, config_value, config_type, category, description, is_sensitive
      FROM configurations
      ORDER BY category, config_key
    `);
    
    // Group by category and mask sensitive values
    const configs = {};
    result.rows.forEach(row => {
      if (!configs[row.category]) {
        configs[row.category] = {};
      }
      
      let value = row.config_value;
      
      // Cast to appropriate type
      if (row.config_type === 'boolean') {
        value = value === 'true';
      } else if (row.config_type === 'integer') {
        value = parseInt(value, 10);
      } else if (row.config_type === 'json') {
        try {
          value = JSON.parse(value);
        } catch (e) {
          // Keep as string if parse fails
        }
      }
      
      // Mask sensitive values
      if (row.is_sensitive && value) {
        value = '***REDACTED***';
      }
      
      configs[row.category][row.config_key] = {
        value,
        type: row.config_type,
        description: row.description,
        is_sensitive: row.is_sensitive
      };
    });
    
    res.json({
      success: true,
      configs
    });
  } catch (error) {
    console.error('Error fetching configs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch configuration',
      error: error.message
    });
  }
});

/**
 * GET /api/config/:key
 * Get specific configuration value
 */
router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    
    const result = await pool.query(
      'SELECT config_value, config_type, is_sensitive FROM configurations WHERE config_key = $1',
      [key]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Configuration not found'
      });
    }
    
    const row = result.rows[0];
    let value = row.config_value;
    
    // Cast to appropriate type
    if (row.config_type === 'boolean') {
      value = value === 'true';
    } else if (row.config_type === 'integer') {
      value = parseInt(value, 10);
    } else if (row.config_type === 'json') {
      try {
        value = JSON.parse(value);
      } catch (e) {
        // Keep as string if parse fails
      }
    }
    
    // Mask sensitive values
    if (row.is_sensitive && value) {
      value = '***REDACTED***';
    }
    
    res.json({
      success: true,
      key,
      value,
      type: row.config_type,
      is_sensitive: row.is_sensitive
    });
  } catch (error) {
    console.error('Error fetching config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch configuration',
      error: error.message
    });
  }
});

/**
 * PUT /api/config/:key
 * Update configuration value
 */
router.put('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    let { value } = req.body;
    
    if (value === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Value is required'
      });
    }
    
    // Get current config to determine type
    const current = await pool.query(
      'SELECT config_type, is_sensitive FROM configurations WHERE config_key = $1',
      [key]
    );
    
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Configuration not found'
      });
    }
    
    const { config_type, is_sensitive } = current.rows[0];
    
    // Convert value to string for storage
    let valueStr;
    if (config_type === 'json') {
      valueStr = JSON.stringify(value);
    } else if (config_type === 'boolean') {
      valueStr = value ? 'true' : 'false';
    } else {
      valueStr = String(value);
    }
    
    // Update configuration
    await pool.query(
      `UPDATE configurations 
       SET config_value = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2
       WHERE config_key = $3`,
      [valueStr, 'ui-user', key]
    );
    
    res.json({
      success: true,
      message: 'Configuration updated',
      key,
      value: is_sensitive ? '***REDACTED***' : value
    });
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update configuration',
      error: error.message
    });
  }
});

/**
 * GET /api/config/category/:category
 * Get all configurations for a category
 */
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    
    const result = await pool.query(
      `SELECT config_key, config_value, config_type, description, is_sensitive
       FROM configurations
       WHERE category = $1
       ORDER BY config_key`,
      [category]
    );
    
    const configs = {};
    result.rows.forEach(row => {
      let value = row.config_value;
      
      // Cast to appropriate type
      if (row.config_type === 'boolean') {
        value = value === 'true';
      } else if (row.config_type === 'integer') {
        value = parseInt(value, 10);
      } else if (row.config_type === 'json') {
        try {
          value = JSON.parse(value);
        } catch (e) {
          // Keep as string if parse fails
        }
      }
      
      // Mask sensitive values
      if (row.is_sensitive && value) {
        value = '***REDACTED***';
      }
      
      configs[row.config_key] = {
        value,
        type: row.config_type,
        description: row.description,
        is_sensitive: row.is_sensitive
      };
    });
    
    res.json({
      success: true,
      category,
      configs
    });
  } catch (error) {
    console.error('Error fetching category configs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch category configuration',
      error: error.message
    });
  }
});

/**
 * POST /api/config/test-provider
 * Test AI provider connection
 */
router.post('/test-provider', async (req, res) => {
  try {
    const { provider, api_key, model } = req.body;
    
    if (!provider) {
      return res.status(400).json({
        success: false,
        message: 'Provider is required'
      });
    }
    
    // Test the provider
    let testResult = { success: false, message: 'Unknown provider' };
    
    if (provider === 'anthropic') {
      const { Anthropic } = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: api_key });
      
      try {
        const response = await client.messages.create({
          model: model || 'claude-sonnet-4-5-20250929',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Test' }]
        });
        testResult = { success: true, message: 'Anthropic connection successful' };
      } catch (error) {
        testResult = { success: false, message: `Anthropic error: ${error.message}` };
      }
    } else if (provider === 'openai') {
      const { OpenAI } = require('openai');
      const client = new OpenAI({ apiKey: api_key });
      
      try {
        await client.models.list();
        testResult = { success: true, message: 'OpenAI connection successful' };
      } catch (error) {
        testResult = { success: false, message: `OpenAI error: ${error.message}` };
      }
    } else if (provider === 'ollama') {
      const axios = require('axios');
      const base_url = req.body.base_url || 'http://ollama:11434';
      
      try {
        await axios.get(`${base_url}/api/tags`);
        testResult = { success: true, message: 'Ollama connection successful' };
      } catch (error) {
        testResult = { success: false, message: `Ollama error: ${error.message}` };
      }
    }
    
    res.json(testResult);
  } catch (error) {
    console.error('Error testing provider:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test provider',
      error: error.message
    });
  }
});

/**
 * GET /api/config/history/:key
 * Get configuration change history
 */
router.get('/history/:key', async (req, res) => {
  try {
    const { key } = req.params;
    
    const result = await pool.query(
      `SELECT old_value, new_value, changed_by, changed_at, change_reason
       FROM configuration_history
       WHERE config_key = $1
       ORDER BY changed_at DESC
       LIMIT 50`,
      [key]
    );
    
    res.json({
      success: true,
      key,
      history: result.rows
    });
  } catch (error) {
    console.error('Error fetching config history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch configuration history',
      error: error.message
    });
  }
});

module.exports = router;
