/**
 * Task Intelligence API Routes
 * 
 * Endpoints for AI-powered task analysis:
 * - POST /estimate-effort - Get effort estimation
 * - POST /classify-energy - Classify energy level
 * - GET /clusters - Get task clusters
 * - POST /clusters - Create clusters
 * - POST /suggest-sequence - Get optimal task order
 * - POST /check-capacity - Check for overload
 * - POST /analyze - Full task analysis
 */

const express = require('express');
const router = express.Router();
const { getDb, getDbType } = require('../database/db');
const { createModuleLogger } = require('../utils/logger');
const taskIntelligence = require('../services/task-intelligence');

const logger = createModuleLogger('INTELLIGENCE-API');

/**
 * POST /api/intelligence/estimate-effort
 * Get AI effort estimation for a task
 */
router.post('/estimate-effort', async (req, res) => {
  try {
    const { description, context } = req.body;

    if (!description) {
      return res.status(400).json({ error: 'Task description is required' });
    }

    logger.info(`Estimating effort for: "${description.substring(0, 50)}..."`);

    const estimation = await taskIntelligence.estimateTaskEffort(description, context || '');

    res.json(estimation);

  } catch (err) {
    logger.error('Error estimating effort:', err);
    res.status(500).json({ 
      error: 'Failed to estimate effort',
      message: err.message 
    });
  }
});

/**
 * POST /api/intelligence/classify-energy
 * Classify task by energy level required
 */
router.post('/classify-energy', async (req, res) => {
  try {
    const { description } = req.body;

    if (!description) {
      return res.status(400).json({ error: 'Task description is required' });
    }

    logger.info(`Classifying energy level for: "${description.substring(0, 50)}..."`);

    const energyLevel = await taskIntelligence.classifyEnergyLevel(description);

    res.json({ 
      energy_level: energyLevel,
      description: getEnergyLevelDescription(energyLevel)
    });

  } catch (err) {
    logger.error('Error classifying energy:', err);
    res.status(500).json({ 
      error: 'Failed to classify energy level',
      message: err.message 
    });
  }
});

/**
 * GET /api/intelligence/clusters
 * Get all task clusters
 */
router.get('/clusters', async (req, res) => {
  try {
    const { status } = req.query;

    const db = getDb();
    let query = 'SELECT * FROM task_clusters';
    const params = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY last_updated DESC';

    const clusters = await db.all(query, params);

    // Parse JSON fields
    for (const cluster of clusters) {
      if (cluster.keywords) {
        try {
          cluster.keywords = JSON.parse(cluster.keywords);
        } catch (e) {
          cluster.keywords = [];
        }
      }
    }

    // Get task counts for each cluster
    for (const cluster of clusters) {
      const tasks = await db.all(
        `SELECT c.*, ti.energy_level, ti.estimated_hours
         FROM commitments c
         JOIN task_intelligence ti ON c.id = ti.commitment_id
         WHERE ti.cluster_id = ?`,
        [cluster.id]
      );

      cluster.tasks = tasks;
      cluster.task_count = tasks.length;
      cluster.completed_count = tasks.filter(t => t.status === 'completed').length;
      cluster.total_hours = tasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
    }

    logger.info(`Returning ${clusters.length} clusters`);
    res.json(clusters);

  } catch (err) {
    logger.error('Error fetching clusters:', err);
    res.status(500).json({ 
      error: 'Failed to fetch clusters',
      message: err.message 
    });
  }
});

/**
 * POST /api/intelligence/clusters
 * Create task clusters from existing tasks
 */
router.post('/clusters', async (req, res) => {
  try {
    const { task_ids } = req.body;

    if (!task_ids || !Array.isArray(task_ids) || task_ids.length === 0) {
      return res.status(400).json({ error: 'task_ids array is required' });
    }

    logger.info(`Creating clusters from ${task_ids.length} tasks`);

    // Get tasks from database
    const db = getDb();
    const placeholders = task_ids.map(() => '?').join(',');
    const tasks = await db.all(
      `SELECT * FROM commitments WHERE id IN (${placeholders})`,
      task_ids
    );

    if (tasks.length === 0) {
      return res.status(404).json({ error: 'No tasks found' });
    }

    // Perform clustering
    const clusters = await taskIntelligence.clusterRelatedTasks(tasks);

    res.json({
      message: `Created ${clusters.length} clusters`,
      clusters
    });

  } catch (err) {
    logger.error('Error creating clusters:', err);
    res.status(500).json({ 
      error: 'Failed to create clusters',
      message: err.message 
    });
  }
});

/**
 * POST /api/intelligence/suggest-sequence
 * Get optimal task ordering
 */
router.post('/suggest-sequence', async (req, res) => {
  try {
    const { task_ids } = req.body;

    if (!task_ids || !Array.isArray(task_ids) || task_ids.length === 0) {
      return res.status(400).json({ error: 'task_ids array is required' });
    }

    logger.info(`Suggesting sequence for ${task_ids.length} tasks`);

    // Get tasks with intelligence data
    const db = getDb();
    const placeholders = task_ids.map(() => '?').join(',');
    const tasks = await db.all(
      `SELECT c.*, ti.energy_level, ti.estimated_hours, ti.optimal_time_of_day
       FROM commitments c
       LEFT JOIN task_intelligence ti ON c.id = ti.commitment_id
       WHERE c.id IN (${placeholders})`,
      task_ids
    );

    if (tasks.length === 0) {
      return res.status(404).json({ error: 'No tasks found' });
    }

    // Get suggested sequence
    const sequence = await taskIntelligence.suggestOptimalSequence(tasks);

    res.json({
      sequence,
      task_count: tasks.length
    });

  } catch (err) {
    logger.error('Error suggesting sequence:', err);
    res.status(500).json({ 
      error: 'Failed to suggest sequence',
      message: err.message 
    });
  }
});

/**
 * POST /api/intelligence/check-capacity
 * Check if user is over-committed
 */
router.post('/check-capacity', async (req, res) => {
  try {
    const { task_ids, available_hours } = req.body;

    if (!task_ids || !Array.isArray(task_ids)) {
      return res.status(400).json({ error: 'task_ids array is required' });
    }

    if (!available_hours || available_hours <= 0) {
      return res.status(400).json({ error: 'available_hours must be positive number' });
    }

    logger.info(`Checking capacity: ${task_ids.length} tasks, ${available_hours} hours`);

    // Get tasks with intelligence data
    const db = getDb();
    const placeholders = task_ids.map(() => '?').join(',');
    const tasks = await db.all(
      `SELECT c.*, ti.estimated_hours
       FROM commitments c
       LEFT JOIN task_intelligence ti ON c.id = ti.commitment_id
       WHERE c.id IN (${placeholders})`,
      task_ids
    );

    // Check capacity
    const capacityAnalysis = await taskIntelligence.checkCapacity(tasks, available_hours);

    res.json(capacityAnalysis);

  } catch (err) {
    logger.error('Error checking capacity:', err);
    res.status(500).json({ 
      error: 'Failed to check capacity',
      message: err.message 
    });
  }
});

/**
 * POST /api/intelligence/analyze
 * Full task analysis (effort + energy + store intelligence)
 */
router.post('/analyze', async (req, res) => {
  try {
    const { task_id, description, context } = req.body;

    if (!task_id) {
      return res.status(400).json({ error: 'task_id is required' });
    }

    if (!description) {
      return res.status(400).json({ error: 'description is required' });
    }

    logger.info(`Full analysis for task ${task_id}`);

    const intelligence = await taskIntelligence.analyzeAndStoreTaskIntelligence(
      task_id,
      description,
      context || ''
    );

    res.json(intelligence);

  } catch (err) {
    logger.error('Error analyzing task:', err);
    res.status(500).json({ 
      error: 'Failed to analyze task',
      message: err.message 
    });
  }
});

/**
 * GET /api/intelligence/task/:id
 * Get intelligence data for a specific task
 */
router.get('/task/:id', async (req, res) => {
  try {
    const taskId = req.params.id;

    logger.info(`Getting intelligence for task ${taskId}`);

    const intelligence = await taskIntelligence.getTaskIntelligence(taskId);

    if (!intelligence) {
      return res.status(404).json({ error: 'No intelligence data found for this task' });
    }

    res.json(intelligence);

  } catch (err) {
    logger.error('Error getting task intelligence:', err);
    res.status(500).json({ 
      error: 'Failed to get task intelligence',
      message: err.message 
    });
  }
});

/**
 * Helper function to get energy level description
 */
function getEnergyLevelDescription(level) {
  const descriptions = {
    deep_work: 'High cognitive load, requires focus and minimal interruptions',
    focused: 'Medium concentration required',
    administrative: 'Low cognitive load, routine work',
    collaborative: 'Social energy, meetings and discussions',
    creative: 'Creative and divergent thinking'
  };

  return descriptions[level] || 'Unknown energy level';
}

module.exports = router;
