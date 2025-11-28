/**
 * Task Intelligence Service
 * 
 * Provides AI-powered task analysis including:
 * - Effort estimation
 * - Energy level classification
 * - Task clustering
 * - Optimal sequencing
 * - Capacity checking
 */

const { generateText } = require('./ai-service');
const { getDb, getDbType } = require('../database/db');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('TASK-INTELLIGENCE');

/**
 * Energy levels for task classification
 */
const ENERGY_LEVELS = {
  DEEP_WORK: 'deep_work',
  FOCUSED: 'focused',
  ADMINISTRATIVE: 'administrative',
  COLLABORATIVE: 'collaborative',
  CREATIVE: 'creative'
};

/**
 * Estimate task effort using AI
 * 
 * @param {string} taskDescription - The task description
 * @param {string} context - Additional context (historical tasks, user patterns, etc.)
 * @returns {Promise<Object>} - { estimated_hours, confidence, reasoning, breakdown }
 */
async function estimateTaskEffort(taskDescription, context = '') {
  try {
    logger.info(`Estimating effort for task: "${taskDescription.substring(0, 50)}..."`);

    const prompt = `You are a productivity expert helping estimate task duration.

Task: ${taskDescription}

${context ? `Context: ${context}` : ''}

Please analyze this task and provide:
1. Estimated hours to complete (be realistic)
2. Confidence level (0-1 scale)
3. Brief reasoning
4. Optional breakdown into subtasks

Consider:
- Task complexity
- Typical time for similar work
- Dependencies or research needed
- Review/iteration time

Respond in JSON format:
{
  "estimated_hours": 2.5,
  "confidence": 0.85,
  "reasoning": "Brief explanation",
  "breakdown": ["Subtask 1: 1hr", "Subtask 2: 1hr", "Review: 0.5hr"]
}`;

    const response = await generateText(prompt, {
      maxTokens: 500,
      temperature: 0.3  // Lower temperature for more consistent estimates
    });

    // Parse JSON response
    let result;
    try {
      result = JSON.parse(response);
    } catch (e) {
      logger.warn('Failed to parse AI response as JSON, using defaults');
      result = {
        estimated_hours: 0.5,
        confidence: 0.5,
        reasoning: 'Could not parse AI response',
        breakdown: []
      };
    }

    logger.info(`Estimated ${result.estimated_hours} hours with ${(result.confidence * 100).toFixed(0)}% confidence`);

    return result;

  } catch (err) {
    logger.error('Error estimating task effort:', err);
    // Return safe defaults on error
    return {
      estimated_hours: 0.5,
      confidence: 0.3,
      reasoning: 'Error occurred during estimation',
      breakdown: []
    };
  }
}

/**
 * Classify task by required energy level
 * 
 * @param {string} taskDescription - The task description
 * @returns {Promise<string>} - Energy level (deep_work, focused, administrative, etc.)
 */
async function classifyEnergyLevel(taskDescription) {
  try {
    logger.info(`Classifying energy level for: "${taskDescription.substring(0, 50)}..."`);

    const prompt = `Classify this task by the energy level it requires:

Task: ${taskDescription}

Energy Levels:
- deep_work: High cognitive load, requires focus and minimal interruptions (strategic planning, complex problem-solving, writing important documents)
- focused: Medium concentration required (code review, analysis, research)
- administrative: Low cognitive load, routine work (email, scheduling, data entry, simple updates)
- collaborative: Social energy, meetings, discussions (requires presence but not deep thinking)
- creative: Creative/divergent thinking (brainstorming, design, ideation)

Respond with ONLY the energy level name (e.g., "deep_work"), nothing else.`;

    const response = await generateText(prompt, {
      maxTokens: 50,
      temperature: 0.2
    });

    const energyLevel = response.trim().toLowerCase();

    // Validate response
    if (Object.values(ENERGY_LEVELS).includes(energyLevel)) {
      logger.info(`Classified as: ${energyLevel}`);
      return energyLevel;
    }

    // Default to administrative if invalid response
    logger.warn(`Invalid energy level "${energyLevel}", defaulting to administrative`);
    return ENERGY_LEVELS.ADMINISTRATIVE;

  } catch (err) {
    logger.error('Error classifying energy level:', err);
    return ENERGY_LEVELS.ADMINISTRATIVE;
  }
}

/**
 * Cluster related tasks using semantic similarity
 * 
 * @param {Array} tasks - Array of task objects
 * @returns {Promise<Array>} - Array of clusters
 */
async function clusterRelatedTasks(tasks) {
  try {
    logger.info(`Clustering ${tasks.length} tasks...`);

    if (tasks.length === 0) {
      return [];
    }

    // Prepare task descriptions for AI
    const taskList = tasks.map((t, idx) => 
      `${idx + 1}. ${t.description} (deadline: ${t.deadline || 'none'})`
    ).join('\n');

    const prompt = `Analyze these tasks and group related ones into clusters/themes:

${taskList}

Identify common themes, projects, or related work. Create meaningful clusters.

Respond in JSON format:
{
  "clusters": [
    {
      "name": "Cluster Name",
      "description": "Brief description",
      "task_indices": [1, 3, 5],
      "keywords": ["keyword1", "keyword2"]
    }
  ]
}`;

    const response = await generateText(prompt, {
      maxTokens: 1000,
      temperature: 0.4
    });

    let result;
    try {
      result = JSON.parse(response);
    } catch (e) {
      logger.warn('Failed to parse clustering response');
      return [];
    }

    // Save clusters to database
    const db = getDb();
    const clusters = [];

    for (const cluster of result.clusters || []) {
      // Insert cluster
      const clusterResult = await db.run(
        `INSERT INTO task_clusters (name, description, keywords, status, total_tasks)
         VALUES (?, ?, ?, 'active', ?)`,
        [
          cluster.name,
          cluster.description,
          JSON.stringify(cluster.keywords),
          cluster.task_indices.length
        ]
      );

      const clusterId = clusterResult.lastID;

      // Link tasks to cluster
      for (const taskIdx of cluster.task_indices) {
        const task = tasks[taskIdx - 1];
        if (task) {
          await db.run(
            `INSERT OR REPLACE INTO task_intelligence (commitment_id, cluster_id, keywords)
             VALUES (?, ?, ?)`,
            [task.id, clusterId, JSON.stringify(cluster.keywords)]
          );
        }
      }

      clusters.push({
        id: clusterId,
        ...cluster
      });
    }

    logger.info(`Created ${clusters.length} clusters`);
    return clusters;

  } catch (err) {
    logger.error('Error clustering tasks:', err);
    return [];
  }
}

/**
 * Suggest optimal task sequence
 * 
 * @param {Array} tasks - Array of task objects with intelligence data
 * @param {Object} userCalendar - User's calendar data
 * @returns {Promise<Array>} - Ordered array of task IDs
 */
async function suggestOptimalSequence(tasks, userCalendar = {}) {
  try {
    logger.info(`Suggesting optimal sequence for ${tasks.length} tasks`);

    // Get current time info
    const now = new Date();
    const hour = now.getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

    // Prepare task data for AI
    const taskData = tasks.map(t => ({
      id: t.id,
      description: t.description,
      deadline: t.deadline,
      energy_level: t.energy_level || 'administrative',
      estimated_hours: t.estimated_hours || 0.5,
      dependencies: t.dependencies || []
    }));

    const prompt = `You are a productivity expert. Suggest the optimal order to complete these tasks:

Tasks:
${JSON.stringify(taskData, null, 2)}

Current time: ${timeOfDay}

Consider:
1. Dependencies (must complete blocking tasks first)
2. Energy levels (deep work in morning, admin in afternoon)
3. Deadlines (urgent tasks first)
4. Momentum (quick wins to build momentum)

Respond with JSON array of task IDs in optimal order:
{
  "sequence": [task_id1, task_id2, task_id3],
  "reasoning": "Brief explanation of the sequencing logic"
}`;

    const response = await generateText(prompt, {
      maxTokens: 500,
      temperature: 0.3
    });

    let result;
    try {
      result = JSON.parse(response);
    } catch (e) {
      logger.warn('Failed to parse sequence response');
      // Fall back to simple deadline-based sort
      return tasks
        .sort((a, b) => {
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline) - new Date(b.deadline);
        })
        .map(t => t.id);
    }

    logger.info(`Suggested sequence: ${result.reasoning}`);
    return result.sequence;

  } catch (err) {
    logger.error('Error suggesting sequence:', err);
    return tasks.map(t => t.id);
  }
}

/**
 * Check if user is over-capacity
 * 
 * @param {Array} tasks - Array of tasks
 * @param {number} availableHours - Available work hours
 * @returns {Promise<Object>} - Capacity analysis
 */
async function checkCapacity(tasks, availableHours) {
  try {
    logger.info(`Checking capacity: ${tasks.length} tasks, ${availableHours} hours available`);

    // Calculate total estimated hours
    const totalEstimatedHours = tasks.reduce((sum, task) => {
      return sum + (task.estimated_hours || 0.5);
    }, 0);

    const isOverloaded = totalEstimatedHours > availableHours;
    const utilizationRate = totalEstimatedHours / availableHours;
    const deficit = Math.max(0, totalEstimatedHours - availableHours);

    // Find tasks to defer if overloaded
    let suggestedDeferrals = [];
    if (isOverloaded) {
      // Sort by priority (tasks without deadlines, or furthest deadlines first)
      const sortedTasks = [...tasks].sort((a, b) => {
        if (!a.deadline) return -1;
        if (!b.deadline) return 1;
        return new Date(b.deadline) - new Date(a.deadline);
      });

      let hoursToDefer = deficit;
      for (const task of sortedTasks) {
        if (hoursToDefer <= 0) break;
        suggestedDeferrals.push(task.id);
        hoursToDefer -= (task.estimated_hours || 0.5);
      }
    }

    const result = {
      is_overloaded: isOverloaded,
      available_hours: availableHours,
      committed_hours: totalEstimatedHours,
      utilization_rate: utilizationRate,
      deficit: deficit,
      suggested_deferrals: suggestedDeferrals,
      warning_level: utilizationRate > 1.2 ? 'critical' : utilizationRate > 0.9 ? 'high' : 'normal'
    };

    if (isOverloaded) {
      logger.warn(`⚠️  User is overloaded: ${totalEstimatedHours} hours committed vs ${availableHours} available`);
    } else {
      logger.info(`✓ Capacity OK: ${(utilizationRate * 100).toFixed(0)}% utilized`);
    }

    return result;

  } catch (err) {
    logger.error('Error checking capacity:', err);
    return {
      is_overloaded: false,
      available_hours: availableHours,
      committed_hours: 0,
      utilization_rate: 0,
      deficit: 0,
      suggested_deferrals: [],
      warning_level: 'unknown'
    };
  }
}

/**
 * Analyze task and store intelligence metadata
 * 
 * @param {number} taskId - Commitment ID
 * @param {string} description - Task description
 * @param {string} context - Additional context
 * @returns {Promise<Object>} - Intelligence data
 */
async function analyzeAndStoreTaskIntelligence(taskId, description, context = '') {
  try {
    logger.info(`Analyzing task ${taskId}...`);

    // Run analyses in parallel
    const [effort, energyLevel] = await Promise.all([
      estimateTaskEffort(description, context),
      classifyEnergyLevel(description)
    ]);

    // Determine optimal time of day based on energy level
    let optimalTime;
    if (energyLevel === ENERGY_LEVELS.DEEP_WORK || energyLevel === ENERGY_LEVELS.FOCUSED) {
      optimalTime = 'morning';
    } else if (energyLevel === ENERGY_LEVELS.CREATIVE) {
      optimalTime = 'afternoon';
    } else {
      optimalTime = 'afternoon';
    }

    // Store in database
    const db = getDb();
    await db.run(
      `INSERT OR REPLACE INTO task_intelligence 
       (commitment_id, energy_level, estimated_hours, confidence_score, optimal_time_of_day)
       VALUES (?, ?, ?, ?, ?)`,
      [taskId, energyLevel, effort.estimated_hours, effort.confidence, optimalTime]
    );

    const intelligence = {
      task_id: taskId,
      energy_level: energyLevel,
      estimated_hours: effort.estimated_hours,
      confidence_score: effort.confidence,
      optimal_time_of_day: optimalTime,
      reasoning: effort.reasoning,
      breakdown: effort.breakdown
    };

    logger.info(`✓ Task intelligence stored for task ${taskId}`);
    return intelligence;

  } catch (err) {
    logger.error(`Error analyzing task ${taskId}:`, err);
    throw err;
  }
}

/**
 * Get task intelligence data
 * 
 * @param {number} taskId - Commitment ID
 * @returns {Promise<Object|null>} - Intelligence data or null
 */
async function getTaskIntelligence(taskId) {
  try {
    const db = getDb();
    const row = await db.get(
      'SELECT * FROM task_intelligence WHERE commitment_id = ?',
      [taskId]
    );

    if (row && row.keywords) {
      try {
        row.keywords = JSON.parse(row.keywords);
      } catch (e) {
        row.keywords = [];
      }
    }

    return row || null;

  } catch (err) {
    logger.error(`Error getting task intelligence for ${taskId}:`, err);
    return null;
  }
}

module.exports = {
  ENERGY_LEVELS,
  estimateTaskEffort,
  classifyEnergyLevel,
  clusterRelatedTasks,
  suggestOptimalSequence,
  checkCapacity,
  analyzeAndStoreTaskIntelligence,
  getTaskIntelligence
};
