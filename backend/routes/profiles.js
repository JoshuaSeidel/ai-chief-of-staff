/**
 * Profiles API Routes
 * Manage user profiles (Personal, Work, etc.)
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('PROFILES-API');

/**
 * GET /api/profiles
 * Get all profiles
 */
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const profiles = await db.all(
      'SELECT id, name, description, color, icon, is_default, display_order, preferences, created_at, updated_at FROM profiles ORDER BY display_order ASC, name ASC'
    );

    res.json({ success: true, profiles });
  } catch (err) {
    logger.error('Error fetching profiles:', err);
    res.status(500).json({ error: 'Failed to fetch profiles', details: err.message });
  }
});

/**
 * GET /api/profiles/:id
 * Get single profile with integration status
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const profile = await db.get(
      'SELECT * FROM profiles WHERE id = ?',
      [id]
    );

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Get integration count
    const integrations = await db.all(
      'SELECT integration_type, status, last_sync_at FROM profile_integrations WHERE profile_id = ?',
      [id]
    );

    // Get data counts
    const [transcriptCount, commitmentCount] = await Promise.all([
      db.get('SELECT COUNT(*) as count FROM transcripts WHERE profile_id = ?', [id]),
      db.get('SELECT COUNT(*) as count FROM commitments WHERE profile_id = ? AND status != ?', [id, 'completed'])
    ]);

    res.json({
      success: true,
      profile: {
        ...profile,
        integrations,
        stats: {
          transcripts: transcriptCount?.count || 0,
          activeCommitments: commitmentCount?.count || 0
        }
      }
    });
  } catch (err) {
    logger.error('Error fetching profile:', err);
    res.status(500).json({ error: 'Failed to fetch profile', details: err.message });
  }
});

/**
 * POST /api/profiles
 * Create new profile
 */
router.post('/', async (req, res) => {
  try {
    const { name, description, color, icon, copyFromProfileId } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Profile name is required' });
    }

    const db = getDb();

    // Check if name already exists
    const existing = await db.get('SELECT id FROM profiles WHERE name = ?', [name]);
    if (existing) {
      return res.status(409).json({ error: 'Profile name already exists' });
    }

    // Get next display order
    const lastProfile = await db.get('SELECT MAX(display_order) as max_order FROM profiles');
    const displayOrder = (lastProfile?.max_order || 0) + 1;

    // Create profile
    const result = await db.run(
      `INSERT INTO profiles (name, description, color, icon, display_order, is_default) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        description || '',
        color || '#3B82F6',
        icon || 'briefcase',
        displayOrder,
        false
      ]
    );

    const newProfileId = result.lastID;

    // If copying from another profile, copy integration settings
    if (copyFromProfileId) {
      const sourceIntegrations = await db.all(
        'SELECT integration_type, config, preferences FROM profile_integrations WHERE profile_id = ? AND status = ?',
        [copyFromProfileId, 'active']
      );

      for (const integration of sourceIntegrations) {
        try {
          await db.run(
            `INSERT INTO profile_integrations (profile_id, integration_type, config, status) 
             VALUES (?, ?, ?, ?)`,
            [newProfileId, integration.integration_type, integration.config, 'inactive'] // Set as inactive, user must reconnect
          );
          logger.info(`Copied ${integration.integration_type} config to new profile ${newProfileId}`);
        } catch (err) {
          logger.warn(`Failed to copy integration ${integration.integration_type}:`, err.message);
        }
      }
    }

    // Fetch the created profile
    const profile = await db.get('SELECT * FROM profiles WHERE id = ?', [newProfileId]);

    logger.info(`Created new profile: ${name} (ID: ${newProfileId})`);
    res.status(201).json({ success: true, profile });
  } catch (err) {
    logger.error('Error creating profile:', err);
    res.status(500).json({ error: 'Failed to create profile', details: err.message });
  }
});

/**
 * PUT /api/profiles/:id
 * Update profile
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color, icon, display_order, preferences } = req.body;
    const db = getDb();

    // Check if profile exists
    const existing = await db.get('SELECT id FROM profiles WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name.trim());
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (color !== undefined) {
      updates.push('color = ?');
      values.push(color);
    }
    if (icon !== undefined) {
      updates.push('icon = ?');
      values.push(icon);
    }
    if (display_order !== undefined) {
      updates.push('display_order = ?');
      values.push(display_order);
    }
    if (preferences !== undefined) {
      updates.push('preferences = ?');
      values.push(JSON.stringify(preferences));
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    if (updates.length > 1) { // More than just updated_at
      await db.run(
        `UPDATE profiles SET ${updates.join(', ')} WHERE id = ?`,
        values
      );
    }

    const profile = await db.get('SELECT * FROM profiles WHERE id = ?', [id]);
    logger.info(`Updated profile ${id}: ${name || profile.name}`);
    
    res.json({ success: true, profile });
  } catch (err) {
    logger.error('Error updating profile:', err);
    res.status(500).json({ error: 'Failed to update profile', details: err.message });
  }
});

/**
 * DELETE /api/profiles/:id
 * Delete profile (with safeguards)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { moveDataToProfileId } = req.body; // Optional: move data to another profile
    const db = getDb();

    // Check if profile exists
    const profile = await db.get('SELECT * FROM profiles WHERE id = ?', [id]);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Prevent deletion of last profile
    const profileCount = await db.get('SELECT COUNT(*) as count FROM profiles');
    if (profileCount.count <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last profile' });
    }

    // If moving data, validate target profile
    let targetProfileId = moveDataToProfileId;
    if (!targetProfileId) {
      // Default to first non-deleted profile
      const defaultTarget = await db.get(
        'SELECT id FROM profiles WHERE id != ? AND is_default = ? LIMIT 1',
        [id, true]
      );
      targetProfileId = defaultTarget?.id || 1;
    }

    // Move all data to target profile
    const tablesToUpdate = [
      'transcripts',
      'commitments',
      'context',
      'briefs',
      'task_intelligence',
      'behavioral_clusters',
      'task_clusters',
      'projects',
      'goals',
      'user_patterns',
      'insight_metrics',
      'completion_streaks',
      'notification_history'
    ];

    for (const table of tablesToUpdate) {
      try {
        await db.run(
          `UPDATE ${table} SET profile_id = ? WHERE profile_id = ?`,
          [targetProfileId, id]
        );
      } catch (err) {
        logger.warn(`Failed to move ${table} data:`, err.message);
      }
    }

    // Delete profile (CASCADE will handle integrations, calendar events, task integrations)
    await db.run('DELETE FROM profiles WHERE id = ?', [id]);

    logger.info(`Deleted profile ${id} (${profile.name}), moved data to profile ${targetProfileId}`);
    
    res.json({ 
      success: true, 
      message: 'Profile deleted successfully',
      dataMovedToProfileId: targetProfileId
    });
  } catch (err) {
    logger.error('Error deleting profile:', err);
    res.status(500).json({ error: 'Failed to delete profile', details: err.message });
  }
});

/**
 * POST /api/profiles/:id/set-default
 * Set profile as default
 */
router.post('/:id/set-default', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    // Check if profile exists
    const profile = await db.get('SELECT id FROM profiles WHERE id = ?', [id]);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Unset all defaults
    await db.run('UPDATE profiles SET is_default = ?', [false]);

    // Set this profile as default
    await db.run('UPDATE profiles SET is_default = ? WHERE id = ?', [true, id]);

    logger.info(`Set profile ${id} as default`);
    
    const profiles = await db.all('SELECT * FROM profiles ORDER BY display_order ASC');
    res.json({ success: true, profiles });
  } catch (err) {
    logger.error('Error setting default profile:', err);
    res.status(500).json({ error: 'Failed to set default profile', details: err.message });
  }
});

/**
 * POST /api/profiles/:id/reorder
 * Update display order
 */
router.post('/:id/reorder', async (req, res) => {
  try {
    const { id } = req.params;
    const { newOrder } = req.body;
    const db = getDb();

    await db.run(
      'UPDATE profiles SET display_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newOrder, id]
    );

    const profiles = await db.all('SELECT * FROM profiles ORDER BY display_order ASC');
    res.json({ success: true, profiles });
  } catch (err) {
    logger.error('Error reordering profile:', err);
    res.status(500).json({ error: 'Failed to reorder profile', details: err.message });
  }
});

module.exports = router;
