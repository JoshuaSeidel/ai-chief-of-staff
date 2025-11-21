const express = require('express');
const router = express.Router();
const { getDb, getDbType, migrateToPostgres } = require('../database/db');
const configManager = require('../config/manager');

/**
 * Get system configuration from /data/config.json
 */
router.get('/system', (req, res) => {
  try {
    const config = configManager.loadConfig();
    // Don't send passwords in response
    if (config.postgres) {
      const sanitized = { ...config };
      if (sanitized.postgres.password) {
        sanitized.postgres.password = '********';
      }
      return res.json(sanitized);
    }
    res.json(config);
  } catch (err) {
    console.error('Error loading system config:', err);
    res.status(500).json({ error: 'Error loading system configuration' });
  }
});

/**
 * Update system configuration and optionally migrate
 */
router.post('/system', async (req, res) => {
  try {
    const updates = req.body;
    console.log('Updating system configuration:', { ...updates, postgres: updates.postgres ? { ...updates.postgres, password: '****' } : undefined });
    
    const currentConfig = configManager.loadConfig();
    const dbTypeChanged = updates.dbType && updates.dbType !== currentConfig.dbType;
    
    // Save new configuration
    const newConfig = configManager.updateConfig(updates);
    
    // If switching to PostgreSQL, trigger migration
    if (dbTypeChanged && updates.dbType === 'postgres') {
      console.log('Database type changed to PostgreSQL, migration will occur on next restart');
      return res.json({ 
        message: 'Configuration saved. Please restart the application to migrate to PostgreSQL.',
        requiresRestart: true
      });
    }
    
    res.json({ message: 'Configuration updated successfully', config: newConfig });
  } catch (err) {
    console.error('Error updating system config:', err);
    res.status(500).json({ error: 'Error updating system configuration' });
  }
});

/**
 * Trigger migration manually
 */
router.post('/migrate', async (req, res) => {
  try {
    const config = configManager.loadConfig();
    if (config.dbType !== 'postgres') {
      return res.status(400).json({ error: 'Target database must be PostgreSQL' });
    }
    
    await migrateToPostgres();
    res.json({ message: 'Migration completed successfully' });
  } catch (err) {
    console.error('Error during migration:', err);
    res.status(500).json({ error: 'Migration failed', details: err.message });
  }
});

/**
 * Get application configuration from database
 */
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const dbType = getDbType();
    
    if (dbType === 'postgres') {
      const result = await db.query('SELECT * FROM config');
      const config = {};
      result.rows.forEach(row => {
        try {
          config[row.key] = JSON.parse(row.value);
        } catch {
          config[row.key] = row.value;
        }
      });
      res.json(config);
    } else {
      db.all('SELECT * FROM config', (err, rows) => {
        if (err) {
          console.error('Error fetching config:', err);
          return res.status(500).json({ error: 'Error fetching configuration' });
        }
        
        const config = {};
        rows.forEach(row => {
          try {
            config[row.key] = JSON.parse(row.value);
          } catch {
            config[row.key] = row.value;
          }
        });
        
        res.json(config);
      });
    }
  } catch (err) {
    console.error('Error fetching config:', err);
    res.status(500).json({ error: 'Error fetching configuration' });
  }
});

/**
 * Update configuration in database
 */
router.post('/', async (req, res) => {
  try {
    const { key, value } = req.body;
    
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'Key and value are required' });
    }
    
    const db = getDb();
    const dbType = getDbType();
    
    // Store strings as-is, only stringify complex objects
    const storedValue = typeof value === 'string' ? value : JSON.stringify(value);
    
    if (dbType === 'postgres') {
      await db.query(
        `INSERT INTO config (key, value, updated_date) 
         VALUES ($1, $2, CURRENT_TIMESTAMP) 
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_date = CURRENT_TIMESTAMP`,
        [key, storedValue]
      );
      res.json({ message: 'Configuration updated successfully', key, value });
    } else {
      db.run(
        'INSERT OR REPLACE INTO config (key, value, updated_date) VALUES (?, ?, CURRENT_TIMESTAMP)',
        [key, storedValue],
        function(err) {
          if (err) {
            console.error('Error updating config:', err);
            return res.status(500).json({ error: 'Error updating configuration' });
          }
          res.json({ message: 'Configuration updated successfully', key, value });
        }
      );
    }
  } catch (err) {
    console.error('Error updating config:', err);
    res.status(500).json({ error: 'Error updating configuration' });
  }
});

/**
 * Bulk update configuration in database
 */
router.put('/', async (req, res) => {
  try {
    const config = req.body;
    
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'Configuration object required' });
    }
    
    const db = getDb();
    const dbType = getDbType();
    
    if (dbType === 'postgres') {
      for (const [key, value] of Object.entries(config)) {
        // Store strings as-is, only stringify complex objects
        const storedValue = typeof value === 'string' ? value : JSON.stringify(value);
        await db.query(
          `INSERT INTO config (key, value, updated_date) 
           VALUES ($1, $2, CURRENT_TIMESTAMP) 
           ON CONFLICT (key) DO UPDATE SET value = $2, updated_date = CURRENT_TIMESTAMP`,
          [key, storedValue]
        );
      }
      res.json({ message: 'Configuration updated successfully' });
    } else {
      const stmt = db.prepare('INSERT OR REPLACE INTO config (key, value, updated_date) VALUES (?, ?, CURRENT_TIMESTAMP)');
      
      for (const [key, value] of Object.entries(config)) {
        // Store strings as-is, only stringify complex objects
        const storedValue = typeof value === 'string' ? value : JSON.stringify(value);
        stmt.run(key, storedValue);
      }
      
      stmt.finalize((err) => {
        if (err) {
          console.error('Error updating config:', err);
          return res.status(500).json({ error: 'Error updating configuration' });
        }
        res.json({ message: 'Configuration updated successfully' });
      });
    }
  } catch (err) {
    console.error('Error updating config:', err);
    res.status(500).json({ error: 'Error updating configuration' });
  }
});

/**
 * Get specific config value from database
 */
router.get('/:key', async (req, res) => {
  try {
    const db = getDb();
    const dbType = getDbType();
    
    if (dbType === 'postgres') {
      const result = await db.query('SELECT value FROM config WHERE key = $1', [req.params.key]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Configuration key not found' });
      }
      try {
        res.json({ key: req.params.key, value: JSON.parse(result.rows[0].value) });
      } catch {
        res.json({ key: req.params.key, value: result.rows[0].value });
      }
    } else {
      db.get(
        'SELECT value FROM config WHERE key = ?',
        [req.params.key],
        (err, row) => {
          if (err) {
            console.error('Error fetching config:', err);
            return res.status(500).json({ error: 'Error fetching configuration' });
          }
          if (!row) {
            return res.status(404).json({ error: 'Configuration key not found' });
          }
          try {
            res.json({ key: req.params.key, value: JSON.parse(row.value) });
          } catch {
            res.json({ key: req.params.key, value: row.value });
          }
        }
      );
    }
  } catch (err) {
    console.error('Error fetching config:', err);
    res.status(500).json({ error: 'Error fetching configuration' });
  }
});

module.exports = router;
