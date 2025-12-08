/**
 * Local Intelligence Service Implementation
 * 
 * Provides fallback implementations for intelligence features when microservices are unavailable.
 * Uses database queries + AI service for analysis.
 */

const { getDb } = require('../database/db');
const { callAI } = require('../services/ai-service');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('INTELLIGENCE-LOCAL');

/**
 * Analyze task completion patterns from database
 */
async function analyzeTaskPatterns(req, time_range = '30d') {
  try {
    const db = getDb();
    
    // Parse time range
    const daysMatch = time_range.match(/(\d+)d/);
    const days = daysMatch ? parseInt(daysMatch[1]) : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    logger.info(`Analyzing patterns for last ${days} days`);
    
    // Get all commitments (tasks) created in time range
    const allTasks = await db.all(
      'SELECT * FROM commitments WHERE created_date >= ? AND profile_id = ? ORDER BY created_date DESC',
      [startDate.toISOString(), req.profileId]
    );
    
    // Get completed tasks (completed in time range, regardless of when created)
    const completedTasks = await db.all(
      'SELECT * FROM commitments WHERE status = ? AND completed_date >= ? AND completed_date IS NOT NULL AND profile_id = ? ORDER BY completed_date DESC',
      ['completed', startDate.toISOString(), req.profileId]
    );
    
    // Get pending tasks
    const pendingTasks = await db.all(
      'SELECT * FROM commitments WHERE status = ? AND created_date >= ? AND profile_id = ? ORDER BY created_date DESC',
      ['pending', startDate.toISOString(), req.profileId]
    );
    
    // Get overdue tasks
    const now = new Date().toISOString();
    const overdueTasks = await db.all(
      'SELECT * FROM commitments WHERE status != ? AND deadline < ? AND deadline IS NOT NULL AND profile_id = ?',
      ['completed', now, req.profileId]
    );
    
    logger.info(`Found ${allTasks.length} total tasks, ${completedTasks.length} completed, ${pendingTasks.length} pending, ${overdueTasks.length} overdue`);
    
    // Check if there's enough data
    if (completedTasks.length === 0) {
      return {
        error: 'Pattern analysis requires task completion history. This feature analyzes your productivity patterns over time.',
        note: 'Use the Tasks page to mark tasks as complete, then return here to analyze patterns.',
        stats: {
          total_tasks: allTasks.length,
          completed: 0,
          pending: pendingTasks.length,
          overdue: overdueTasks.length,
          completion_rate: 0
        }
      };
    }
    
    // Calculate basic stats
    const completionRate = allTasks.length > 0 ? (completedTasks.length / allTasks.length * 100).toFixed(1) : 0;
    
    // Calculate average time to completion
    const completionTimes = completedTasks
      .filter(t => t.completed_date && t.created_date)
      .map(t => {
        const completed = new Date(t.completed_date);
        const created = new Date(t.created_date);
        return (completed - created) / (1000 * 60 * 60 * 24); // days
      });
    
    const avgCompletionTime = completionTimes.length > 0
      ? (completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length).toFixed(1)
      : 0;
    
    // Group tasks by day of week
    const tasksByDay = {};
    completedTasks.forEach(task => {
      if (task.completed_date) {
        const day = new Date(task.completed_date).toLocaleDateString('en-US', { weekday: 'long' });
        tasksByDay[day] = (tasksByDay[day] || 0) + 1;
      }
    });
    
    // Find most productive day
    let mostProductiveDay = 'N/A';
    let maxTasks = 0;
    Object.entries(tasksByDay).forEach(([day, count]) => {
      if (count > maxTasks) {
        maxTasks = count;
        mostProductiveDay = day;
      }
    });
    
    // Use AI to generate insights
    const prompt = `You are a productivity analyst. Analyze the following task completion data and provide actionable insights.

Task Statistics (Last ${days} days):
- Total tasks: ${allTasks.length}
- Completed: ${completedTasks.length}
- Pending: ${pendingTasks.length}
- Overdue: ${overdueTasks.length}
- Completion rate: ${completionRate}%
- Average time to complete: ${avgCompletionTime} days
- Most productive day: ${mostProductiveDay} (${maxTasks} tasks)

Recent Completed Tasks:
${completedTasks.slice(0, 10).map(t => `- ${t.description} (completed: ${new Date(t.completed_date).toLocaleDateString()})`).join('\n')}

Recent Pending Tasks:
${pendingTasks.slice(0, 10).map(t => `- ${t.description} (deadline: ${t.deadline ? new Date(t.deadline).toLocaleDateString() : 'none'})`).join('\n')}

${overdueTasks.length > 0 ? `Overdue Tasks:\n${overdueTasks.slice(0, 5).map(t => `- ${t.description} (deadline: ${new Date(t.deadline).toLocaleDateString()})`).join('\n')}` : ''}

Provide a productivity analysis with:
1. **Working Patterns**: What patterns do you see in task completion?
2. **Focus Time**: When is productivity highest?
3. **Completion Trends**: Are tasks being completed on time?
4. **Recommendations**: 3-5 specific actionable suggestions to improve productivity
5. **Risk Alerts**: Any concerning patterns or overdue items?

Format as markdown with sections. Be specific and actionable.`;

    logger.info('Generating AI insights for pattern analysis');
    
    const aiResponse = await callAI(
      [{ role: 'user', content: prompt }],
      null,
      2048,
      req.profileId
    );
    
    const insights = aiResponse.content;
    
    return {
      success: true,
      time_range: `${days} days`,
      stats: {
        total_tasks: allTasks.length,
        completed: completedTasks.length,
        pending: pendingTasks.length,
        overdue: overdueTasks.length,
        completion_rate: parseFloat(completionRate),
        avg_completion_days: parseFloat(avgCompletionTime),
        most_productive_day: mostProductiveDay,
        tasks_by_day: tasksByDay
      },
      insights: insights,
      analysis_date: new Date().toISOString()
    };
    
  } catch (error) {
    logger.error('Error analyzing task patterns:', error);
    throw error;
  }
}

/**
 * Estimate effort required for a task using AI
 * @param {string} description - Task description
 * @param {string} context - Optional context
 * @param {number} profileId - Profile ID for AI preferences
 */
async function estimateEffort(description, context = '', profileId = 2) {
  try {
    logger.info(`Estimating effort for task: ${description.substring(0, 50)}...`);
    
    const prompt = `You are a task estimation expert. Estimate the effort required for the following task.

Task: ${description}
${context ? `Context: ${context}` : ''}

Provide:
1. **Estimated Time**: Provide a specific time estimate (e.g., "2-3 hours", "1 day", "1 week")
2. **Complexity**: Rate as Low, Medium, or High
3. **Reasoning**: Explain your estimate
4. **Breakdown**: If complex, break down into sub-tasks with time estimates
5. **Risks**: Identify potential time delays

Format as JSON:
{
  "estimated_time": "2-3 hours",
  "complexity": "Medium",
  "reasoning": "...",
  "breakdown": ["Step 1 (30min)", "Step 2 (1hr)"],
  "risks": ["May need additional review time"]
}`;

    const aiResponse = await callAI(
      [{ role: 'user', content: prompt }],
      null,
      1024,
      profileId
    );
    
    // Try to parse JSON from response
    let result;
    try {
      const jsonMatch = aiResponse.content.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { 
        estimated_time: "Unable to parse",
        raw_response: aiResponse.content 
      };
    } catch (parseErr) {
      result = { estimated_time: "Unable to parse", raw_response: aiResponse.content };
    }
    
    return { success: true, ...result };
  } catch (error) {
    logger.error('Error estimating effort:', error);
    throw error;
  }
}

/**
 * Classify energy level required for a task
 * @param {string} description - Task description
 * @param {number} profileId - Profile ID for AI preferences
 */
async function classifyEnergy(description, profileId = 2) {
  try {
    logger.info(`Classifying energy for task: ${description.substring(0, 50)}...`);
    
    const prompt = `You are an energy classification expert. Classify the energy level required for this task.

Task: ${description}

Classify the task as:
- **High Energy**: Requires deep focus, creativity, critical thinking (e.g., strategic planning, complex problem-solving)
- **Medium Energy**: Requires moderate focus (e.g., writing reports, routine meetings)
- **Low Energy**: Can be done with minimal focus (e.g., email responses, scheduling, routine admin)

Respond with JSON:
{
  "energy_level": "High|Medium|Low",
  "reasoning": "...",
  "best_time": "When to do this task for optimal results",
  "duration_recommendation": "Suggested time block"
}`;

    const aiResponse = await callAI(
      [{ role: 'user', content: prompt }],
      null,
      512,
      profileId
    );
    
    let result;
    try {
      const jsonMatch = aiResponse.content.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { 
        energy_level: "Medium",
        raw_response: aiResponse.content 
      };
    } catch (parseErr) {
      result = { energy_level: "Medium", raw_response: aiResponse.content };
    }
    
    return { success: true, ...result };
  } catch (error) {
    logger.error('Error classifying energy:', error);
    throw error;
  }
}

/**
 * Cluster related tasks together
 * @param {Array} tasks - Array of task objects
 * @param {number} profileId - Profile ID for AI preferences
 */
async function clusterTasks(tasks, profileId = 2) {
  try {
    logger.info(`Clustering ${tasks.length} tasks`);
    
    const taskList = tasks.map((t, i) => `${i + 1}. ${t.description}`).join('\n');
    
    const prompt = `You are a task organization expert. Group these related tasks into logical clusters.

Tasks:
${taskList}

Group them into clusters based on:
- Similar themes/projects
- Related activities
- Dependencies
- Optimal execution order

Respond with JSON:
{
  "clusters": [
    {
      "name": "Cluster name",
      "tasks": [1, 3, 5],
      "reasoning": "Why these tasks are grouped",
      "suggested_order": "Sequential or Parallel"
    }
  ],
  "recommendations": "Overall suggestions for execution"
}`;

    const aiResponse = await callAI(
      [{ role: 'user', content: prompt }],
      null,
      1024,
      req.profileId
    );
    
    let result;
    try {
      const jsonMatch = aiResponse.content.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { 
        clusters: [],
        raw_response: aiResponse.content 
      };
    } catch (parseErr) {
      result = { clusters: [], raw_response: aiResponse.content };
    }
    
    return { success: true, ...result };
  } catch (error) {
    logger.error('Error clustering tasks:', error);
    throw error;
  }
}

/**
 * Parse natural language task into structured format
 * @param {string} text - Task text to parse
 * @param {number} profileId - Profile ID for AI preferences
 */
async function parseTask(text, profileId = 2) {
  try {
    logger.info(`Parsing task: ${text.substring(0, 50)}...`);
    
    const prompt = `You are a natural language processing expert. Parse this task description into structured data.

Task: ${text}

Extract:
- **Title**: Concise task title (max 80 chars)
- **Description**: Full task description
- **Deadline**: Any date/time mentioned (ISO 8601 format or "none")
- **Priority**: High/Medium/Low based on language used
- **Tags**: Relevant categories/tags
- **Assignee**: Person mentioned or "unassigned"

Respond with JSON:
{
  "title": "...",
  "description": "...",
  "deadline": "2024-12-31" or "none",
  "priority": "High|Medium|Low",
  "tags": ["tag1", "tag2"],
  "assignee": "name" or "unassigned"
}`;

    const aiResponse = await callAI(
      [{ role: 'user', content: prompt }],
      null,
      512,
      profileId
    );
    
    let result;
    try {
      const jsonMatch = aiResponse.content.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { 
        title: text.substring(0, 80),
        description: text,
        raw_response: aiResponse.content 
      };
    } catch (parseErr) {
      result = { 
        title: text.substring(0, 80),
        description: text,
        raw_response: aiResponse.content 
      };
    }
    
    return { success: true, ...result };
  } catch (error) {
    logger.error('Error parsing task:', error);
    throw error;
  }
}

/**
 * Extract dates from text
 * @param {string} text - Text to extract dates from
 * @param {number} profileId - Profile ID for AI preferences
 */
async function extractDates(text, profileId = 2) {
  try {
    logger.info(`Extracting dates from text: ${text.substring(0, 50)}...`);
    
    const prompt = `Extract all dates and deadlines from this text. Return ISO 8601 format dates.

Text: ${text}

Respond with JSON:
{
  "dates": [
    {
      "original": "next Friday",
      "parsed": "2024-12-06",
      "type": "deadline|meeting|event"
    }
  ]
}`;

    const aiResponse = await callAI(
      [{ role: 'user', content: prompt }],
      null,
      512,
      profileId
    );
    
    let result;
    try {
      const jsonMatch = aiResponse.content.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { 
        dates: [],
        raw_response: aiResponse.content 
      };
    } catch (parseErr) {
      result = { dates: [], raw_response: aiResponse.content };
    }
    
    return { success: true, ...result };
  } catch (error) {
    logger.error('Error extracting dates:', error);
    throw error;
  }
}

/**
 * Get context from database (fallback for context-service)
 */
async function getContext(req, category = null, source = null, limit = 50, active_only = true) {
  try {
    const db = getDb();
    logger.info(`Getting context: category=${category}, source=${source}, limit=${limit}`);
    
    // Query transcripts and commitments
    let query = 'SELECT * FROM transcripts WHERE profile_id = ?';
    const params = [req.profileId];
    
    if (active_only) {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      query += ' AND created_date >= ?';
      params.push(twoWeeksAgo.toISOString());
    }
    
    query += ' ORDER BY created_date DESC LIMIT ?';
    params.push(limit);
    
    const transcripts = await db.all(query, params);
    
    // Get related commitments
    const commitments = await db.all(
      'SELECT * FROM commitments WHERE profile_id = ? ORDER BY created_date DESC LIMIT ?',
      [req.profileId, limit]
    );
    
    return {
      success: true,
      context: transcripts.map(t => ({
        id: t.id,
        content: t.transcript_text,
        source: 'transcript',
        date: t.created_date,
        title: t.title || `Transcript ${t.id}`
      })),
      commitments: commitments.map(c => ({
        id: c.id,
        description: c.description,
        status: c.status,
        deadline: c.deadline,
        created: c.created_date
      })),
      count: transcripts.length
    };
  } catch (error) {
    logger.error('Error getting context:', error);
    throw error;
  }
}

/**
 * Search context (fallback for context-service)
 */
async function searchContext(req, query, category = null, limit = 20) {
  try {
    const db = getDb();
    logger.info(`Searching context for: ${query}`);
    
    // Simple text search in transcripts and commitments
    const transcripts = await db.all(
      `SELECT * FROM transcripts 
       WHERE transcript_text LIKE ? AND profile_id = ?
       ORDER BY created_date DESC LIMIT ?`,
      [`%${query}%`, req.profileId, limit]
    );
    
    const commitments = await db.all(
      `SELECT * FROM commitments 
       WHERE description LIKE ? AND profile_id = ?
       ORDER BY created_date DESC LIMIT ?`,
      [`%${query}%`, req.profileId, limit]
    );
    
    return {
      success: true,
      query,
      results: [
        ...transcripts.map(t => ({
          type: 'transcript',
          id: t.id,
          content: t.transcript_text,
          date: t.created_date,
          relevance: 'matched'
        })),
        ...commitments.map(c => ({
          type: 'commitment',
          id: c.id,
          content: c.description,
          date: c.created_date,
          status: c.status,
          relevance: 'matched'
        }))
      ],
      count: transcripts.length + commitments.length
    };
  } catch (error) {
    logger.error('Error searching context:', error);
    throw error;
  }
}

module.exports = {
  analyzeTaskPatterns,
  estimateEffort,
  classifyEnergy,
  clusterTasks,
  parseTask,
  extractDates,
  getContext,
  searchContext
};
