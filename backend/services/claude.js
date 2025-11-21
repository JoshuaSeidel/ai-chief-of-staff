const Anthropic = require('@anthropic-ai/sdk');
const { getDb, getDbType } = require('../database/db');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('CLAUDE');

/**
 * Get Anthropic client with API key from database config
 */
async function getAnthropicClient() {
  logger.info('Retrieving Anthropic API key from configuration');
  const db = getDb();
  const dbType = getDbType();
  
  if (dbType === 'postgres') {
    const result = await db.query('SELECT value FROM config WHERE key = $1', ['anthropicApiKey']);
    if (result.rows.length === 0) {
      logger.error('Anthropic API key not found in configuration');
      throw new Error('Anthropic API key not configured. Please set it in the Configuration page.');
    }
    try {
      // Handle both plain strings and JSON-encoded values
      let apiKey = result.rows[0].value;
      if (apiKey.startsWith('"')) {
        apiKey = JSON.parse(apiKey);
      }
      logger.info('Anthropic client initialized successfully');
      return new Anthropic({ apiKey });
    } catch (e) {
      logger.error('Invalid API key format', e);
      throw new Error('Invalid API key format');
    }
  } else {
    const row = await db.get('SELECT value FROM config WHERE key = ?', ['anthropicApiKey']);
    if (!row) {
      logger.error('Anthropic API key not found in configuration');
      throw new Error('Anthropic API key not configured. Please set it in the Configuration page.');
    }
    try {
      // Handle both plain strings and JSON-encoded values
      let apiKey = row.value;
      if (apiKey.startsWith('"')) {
        apiKey = JSON.parse(apiKey);
      }
      logger.info('Anthropic client initialized successfully');
      return new Anthropic({ apiKey });
    } catch (e) {
      logger.error('Invalid API key format', e);
      throw new Error('Invalid API key format');
    }
  }
}

/**
 * Get Claude model from database config
 */
async function getClaudeModel() {
  const db = getDb();
  const dbType = getDbType();
  
  if (dbType === 'postgres') {
    const result = await db.query('SELECT value FROM config WHERE key = $1', ['claudeModel']);
    if (result.rows.length === 0) {
      logger.info('Claude model not configured, using default: claude-sonnet-4-5-20250929');
      return 'claude-sonnet-4-5-20250929'; // Default model
    }
    try {
      // Handle both plain strings and JSON-encoded values
      let model = result.rows[0].value;
      if (model.startsWith('"')) {
        model = JSON.parse(model);
      }
      logger.info(`Using Claude model: ${model}`);
      return model;
    } catch (e) {
      logger.warn('Error parsing model config, using default', e);
      return 'claude-sonnet-4-5-20250929';
    }
  } else {
    const row = await db.get('SELECT value FROM config WHERE key = ?', ['claudeModel']);
    if (!row) {
      logger.info('Claude model not configured, using default: claude-sonnet-4-5-20250929');
      return 'claude-sonnet-4-5-20250929'; // Default model
    }
    try {
      // Handle both plain strings and JSON-encoded values
      let model = row.value;
      if (model.startsWith('"')) {
        model = JSON.parse(model);
      }
      logger.info(`Using Claude model: ${model}`);
      return model;
    } catch (e) {
      logger.warn('Error parsing model config, using default', e);
      return 'claude-sonnet-4-5-20250929';
    }
  }
}

/**
 * Generate a daily brief from context
 */
async function generateDailyBrief(contextData) {
  logger.info('Generating daily brief', {
    contextCount: contextData.context?.length || 0,
    commitmentCount: contextData.commitments?.length || 0,
    transcriptCount: contextData.recentTranscripts?.length || 0
  });

  const prompt = `You are an AI executive assistant. Based on the following context from the last 2 weeks, generate a concise daily brief for your executive.

Context includes:
- Recent meeting transcripts
- Commitments made
- Ongoing projects and their status

Format the brief with these sections:
1. TODAY'S TOP 3 PRIORITIES (with specific actions and urgency levels)
2. DELIVERABLES THIS WEEK (with status: on track/at risk/behind, and blockers)
3. CHECK-INS NEEDED (who, why, and when)
4. COMMITMENTS I MADE (things said I'd do, with deadlines)

Context Data:
${JSON.stringify(contextData, null, 2)}

Generate a clear, actionable brief in markdown format.`;

  try {
    const anthropic = await getAnthropicClient();
    const model = await getClaudeModel();
    
    logger.info(`Calling Claude API with model: ${model}`);
    const startTime = Date.now();
    
    const message = await anthropic.messages.create({
      model: model,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const duration = Date.now() - startTime;
    logger.info(`Brief generated successfully in ${duration}ms`, {
      tokens: message.usage?.total_tokens,
      model: message.model
    });

    return message.content[0].text;
  } catch (error) {
    logger.error('Error generating brief', error);
    throw error;
  }
}

/**
 * Extract commitments and action items from transcript
 */
async function extractCommitments(transcriptText) {
  logger.info('Extracting commitments from transcript', {
    transcriptLength: transcriptText.length
  });

  const prompt = `Analyze this meeting transcript and extract:
1. Commitments made (who committed to what, by when)
2. Action items assigned
3. Follow-ups needed
4. Risks or blockers mentioned

Transcript:
${transcriptText}

Return the results as JSON with this structure:
{
  "commitments": [{"description": "...", "assignee": "...", "deadline": "..."}],
  "actionItems": [{"description": "...", "priority": "high|medium|low"}],
  "followUps": [{"description": "...", "with": "..."}],
  "risks": [{"description": "...", "impact": "..."}]
}`;

  try {
    const anthropic = await getAnthropicClient();
    const model = await getClaudeModel();
    
    logger.info(`Calling Claude API for extraction with model: ${model}`);
    const startTime = Date.now();
    
    const message = await anthropic.messages.create({
      model: model,
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const duration = Date.now() - startTime;
    const responseText = message.content[0].text;
    
    // Extract JSON from response (Claude sometimes wraps it in markdown)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    let extracted;
    
    if (jsonMatch) {
      extracted = JSON.parse(jsonMatch[0]);
    } else {
      extracted = JSON.parse(responseText);
    }
    
    logger.info(`Extraction completed in ${duration}ms`, {
      commitments: extracted.commitments?.length || 0,
      actionItems: extracted.actionItems?.length || 0,
      followUps: extracted.followUps?.length || 0,
      risks: extracted.risks?.length || 0,
      tokens: message.usage?.total_tokens
    });
    
    return extracted;
  } catch (error) {
    logger.error('Error extracting commitments', error);
    throw error;
  }
}

/**
 * Generate weekly report
 */
async function generateWeeklyReport(weekData) {
  logger.info('Generating weekly report', {
    dataKeys: Object.keys(weekData)
  });

  const prompt = `Generate a concise weekly report for my manager based on this week's activity:

${JSON.stringify(weekData, null, 2)}

Format the report with:
1. WHAT SHIPPED (completed deliverables)
2. WHAT'S AT RISK (blockers, delays)
3. NEXT WEEK'S FOCUS (priorities and goals)

Keep it executive-level: clear, concise, outcome-focused.`;

  try {
    const anthropic = await getAnthropicClient();
    const model = await getClaudeModel();
    
    logger.info(`Calling Claude API for weekly report with model: ${model}`);
    const startTime = Date.now();
    
    const message = await anthropic.messages.create({
      model: model,
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const duration = Date.now() - startTime;
    logger.info(`Weekly report generated successfully in ${duration}ms`, {
      tokens: message.usage?.total_tokens
    });

    return message.content[0].text;
  } catch (error) {
    logger.error('Error generating weekly report', error);
    throw error;
  }
}

module.exports = {
  generateDailyBrief,
  extractCommitments,
  generateWeeklyReport
};
