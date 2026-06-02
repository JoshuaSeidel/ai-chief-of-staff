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

function getAiResponseText(aiResponse) {
  return String(aiResponse?.text || aiResponse?.content || '').trim();
}

function parseDatabaseDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const text = String(value).trim();
  if (!text) return null;

  const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
  const looksLikeSqliteTimestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(text);
  const normalized = looksLikeSqliteTimestamp && !hasExplicitTimezone
    ? `${text.replace(' ', 'T')}Z`
    : text;
  const parsed = new Date(normalized);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateForPrompt(value) {
  const parsed = parseDatabaseDate(value);
  return parsed ? parsed.toLocaleDateString('en-US') : 'unknown';
}

function isKnownAiProviderFailure(error) {
  return /api key|not configured|authentication|unauthorized|forbidden|rate limit|timeout|network|econn|unavailable|overload|quota/i
    .test(error?.message || '');
}

function aiFallbackMetadata(error) {
  return {
    ai_analysis_available: false,
    ai_analysis_error: error?.message || 'AI provider unavailable'
  };
}

function buildFallbackPatternInsights({
  days,
  allTasks,
  completedTasks,
  pendingTasks,
  overdueTasks,
  completionRate,
  avgCompletionTime,
  mostProductiveDay,
  maxTasks,
  error
}) {
  const reason = /api key|not configured|authentication|unauthorized/i.test(error?.message || '')
    ? 'AI insights are unavailable because the AI provider is not configured.'
    : 'AI insights are unavailable right now.';

  return [
    `**Computed Summary (${days} days)**`,
    '',
    reason,
    '',
    `- Completion rate: ${completionRate}%`,
    `- Completed tasks: ${completedTasks.length} of ${allTasks.length}`,
    `- Pending tasks: ${pendingTasks.length}`,
    `- Overdue tasks: ${overdueTasks.length}`,
    `- Average completion time: ${avgCompletionTime} days`,
    maxTasks > 0 ? `- Most productive day: ${mostProductiveDay} (${maxTasks} completed)` : null,
    '',
    overdueTasks.length > 0
      ? 'Review overdue work first, then complete or reschedule stale tasks so the dashboard reflects current priorities.'
      : 'Keep completing tasks to build enough history for richer trend analysis.'
  ].filter(Boolean).join('\n');
}

/**
 * Analyze task completion patterns from database
 */
async function analyzeTaskPatterns(req, time_range = '30d', options = {}) {
  try {
    const db = getDb();
    const mode = options.mode === 'fast' ? 'fast' : 'full';
    const reasoningEffort = options.reasoningEffort || 'high';
    
    // Parse time range
    const daysMatch = time_range.match(/(\d+)d/);
    const days = daysMatch ? parseInt(daysMatch[1]) : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    logger.info(`Analyzing patterns for last ${days} days with mode=${mode}, reasoning=${reasoningEffort}`);
    
    // Get all tasks that were either created OR completed in the time range
    // This ensures we capture all relevant activity for accurate completion rate
    // Use UNION to avoid duplicates if a task was both created and completed in range
    const allTasksCreated = await db.all(
      'SELECT * FROM commitments WHERE created_date >= ? AND profile_id = ?',
      [startDate.toISOString(), req.profileId]
    );
    
    const allTasksCompleted = await db.all(
      'SELECT * FROM commitments WHERE status = ? AND completed_date >= ? AND completed_date IS NOT NULL AND profile_id = ?',
      ['completed', startDate.toISOString(), req.profileId]
    );
    
    // Combine and deduplicate by task ID
    const taskMap = new Map();
    [...allTasksCreated, ...allTasksCompleted].forEach(task => {
      if (!taskMap.has(task.id)) {
        taskMap.set(task.id, task);
      }
    });
    const allTasks = Array.from(taskMap.values()).sort((a, b) => 
      (parseDatabaseDate(b.created_date)?.getTime() || 0) - (parseDatabaseDate(a.created_date)?.getTime() || 0)
    );
    
    // Get completed tasks (completed in time range, regardless of when created)
    const completedTasks = await db.all(
      'SELECT * FROM commitments WHERE status = ? AND completed_date >= ? AND completed_date IS NOT NULL AND profile_id = ? ORDER BY completed_date DESC',
      ['completed', startDate.toISOString(), req.profileId]
    );
    
    // Get pending tasks (created in time range and still pending)
    const pendingTasks = await db.all(
      'SELECT * FROM commitments WHERE status = ? AND created_date >= ? AND profile_id = ? ORDER BY created_date DESC',
      ['pending', startDate.toISOString(), req.profileId]
    );
    
    // Get overdue tasks (all profiles, not just time range)
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
    // Completion rate = completed tasks / all tasks that were active in the time range
    const completionRate = allTasks.length > 0 ? (completedTasks.length / allTasks.length * 100).toFixed(1) : 0;
    
    // Calculate average time to completion
    const completionTimes = completedTasks
      .filter(t => t.completed_date && t.created_date)
      .map(t => {
        const completed = parseDatabaseDate(t.completed_date);
        const created = parseDatabaseDate(t.created_date);
        if (!completed || !created) return null;
        const daysToCompletion = (completed - created) / (1000 * 60 * 60 * 24);
        return Math.max(0, daysToCompletion);
      })
      .filter(Number.isFinite);
    
    const avgCompletionTime = completionTimes.length > 0
      ? (completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length).toFixed(1)
      : 0;
    
    // Group tasks by day of week
    const tasksByDay = {};
    completedTasks.forEach(task => {
      const completed = parseDatabaseDate(task.completed_date);
      if (completed) {
        const day = completed.toLocaleDateString('en-US', { weekday: 'long' });
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
    const completedLimit = mode === 'fast' ? 5 : 10;
    const pendingLimit = mode === 'fast' ? 5 : 10;
    const overdueLimit = mode === 'fast' ? 3 : 5;
    const outputInstructions = mode === 'fast'
      ? `Provide a concise dashboard summary in markdown with:
1. **Working Pattern**: 1-2 bullets
2. **Risks**: 1-2 bullets
3. **Next Best Actions**: 3 bullets

Keep the response under 180 words. Use high-quality reasoning, but do not expose chain-of-thought.`
      : `Provide a productivity analysis with:
1. **Working Patterns**: What patterns do you see in task completion?
2. **Focus Time**: When is productivity highest?
3. **Completion Trends**: Are tasks being completed on time?
4. **Recommendations**: 3-5 specific actionable suggestions to improve productivity
5. **Risk Alerts**: Any concerning patterns or overdue items?

Format as markdown with sections. Be specific and actionable.`;

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
${completedTasks.slice(0, completedLimit).map(t => `- ${t.description} (completed: ${formatDateForPrompt(t.completed_date)})`).join('\n')}

Recent Pending Tasks:
${pendingTasks.slice(0, pendingLimit).map(t => `- ${t.description} (deadline: ${t.deadline ? formatDateForPrompt(t.deadline) : 'none'})`).join('\n')}

${overdueTasks.length > 0 ? `Overdue Tasks:\n${overdueTasks.slice(0, overdueLimit).map(t => `- ${t.description} (deadline: ${formatDateForPrompt(t.deadline)})`).join('\n')}` : ''}

${outputInstructions}`;

    logger.info('Generating AI insights for pattern analysis');

    let insights;
    let aiInsightsAvailable = true;
    let aiInsightsError = null;

    try {
      const aiResponse = await callAI(
        [{ role: 'user', content: prompt }],
        null,
        mode === 'fast' ? 768 : 2048,
        req.profileId,
        { reasoningEffort }
      );

      insights = getAiResponseText(aiResponse);
      if (!insights) {
        throw new Error('AI provider returned an empty response');
      }
    } catch (aiError) {
      aiInsightsAvailable = false;
      aiInsightsError = aiError.message;
      logger.warn(`AI insights unavailable for pattern analysis: ${aiError.message}`);
      insights = buildFallbackPatternInsights({
        days,
        allTasks,
        completedTasks,
        pendingTasks,
        overdueTasks,
        completionRate,
        avgCompletionTime,
        mostProductiveDay,
        maxTasks,
        error: aiError
      });
    }
    
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
      ai_insights_available: aiInsightsAvailable,
      ai_insights_error: aiInsightsAvailable ? null : aiInsightsError,
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
      const responseText = getAiResponseText(aiResponse);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { 
        estimated_time: "Unable to parse",
        raw_response: responseText
      };
    } catch (parseErr) {
      result = { estimated_time: "Unable to parse", raw_response: getAiResponseText(aiResponse) };
    }
    
    return { success: true, ...result };
  } catch (error) {
    if (isKnownAiProviderFailure(error)) {
      logger.warn(`AI effort estimation unavailable: ${error.message}`);
      return {
        success: true,
        estimated_time: 'Unknown',
        complexity: 'Medium',
        reasoning: 'AI effort estimation is unavailable right now.',
        breakdown: [],
        risks: [],
        ...aiFallbackMetadata(error)
      };
    }

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
      const responseText = getAiResponseText(aiResponse);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { 
        energy_level: "Medium",
        raw_response: responseText
      };
    } catch (parseErr) {
      result = { energy_level: "Medium", raw_response: getAiResponseText(aiResponse) };
    }
    
    return { success: true, ...result };
  } catch (error) {
    if (isKnownAiProviderFailure(error)) {
      logger.warn(`AI energy classification unavailable: ${error.message}`);
      return {
        success: true,
        energy_level: 'Medium',
        reasoning: 'AI energy classification is unavailable right now.',
        best_time: 'When you have a normal focus block available',
        duration_recommendation: 'Use your regular task block.',
        ...aiFallbackMetadata(error)
      };
    }

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
      profileId
    );

    let result;
    try {
      const responseText = getAiResponseText(aiResponse);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : {
        clusters: [],
        raw_response: responseText
      };
    } catch (parseErr) {
      result = { clusters: [], raw_response: getAiResponseText(aiResponse) };
    }

    return { success: true, ...result };
  } catch (error) {
    if (isKnownAiProviderFailure(error)) {
      logger.warn(`AI task clustering unavailable: ${error.message}`);
      return {
        success: true,
        clusters: [],
        recommendations: 'AI task clustering is unavailable right now.',
        ...aiFallbackMetadata(error)
      };
    }

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
      const responseText = getAiResponseText(aiResponse);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { 
        title: text.substring(0, 80),
        description: text,
        raw_response: responseText
      };
    } catch (parseErr) {
      result = { 
        title: text.substring(0, 80),
        description: text,
        raw_response: getAiResponseText(aiResponse)
      };
    }
    
    return { success: true, ...result };
  } catch (error) {
    if (isKnownAiProviderFailure(error)) {
      logger.warn(`AI task parsing unavailable: ${error.message}`);
      return {
        success: true,
        title: text.substring(0, 80),
        description: text,
        deadline: 'none',
        priority: 'Medium',
        tags: [],
        assignee: 'unassigned',
        ...aiFallbackMetadata(error)
      };
    }

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
      const responseText = getAiResponseText(aiResponse);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { 
        dates: [],
        raw_response: responseText
      };
    } catch (parseErr) {
      result = { dates: [], raw_response: getAiResponseText(aiResponse) };
    }
    
    return { success: true, ...result };
  } catch (error) {
    if (isKnownAiProviderFailure(error)) {
      logger.warn(`AI date extraction unavailable: ${error.message}`);
      return {
        success: true,
        dates: [],
        ...aiFallbackMetadata(error)
      };
    }

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
