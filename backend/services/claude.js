const Anthropic = require('@anthropic-ai/sdk');
const { getDb, getDbType } = require('../database/db');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('CLAUDE');

/**
 * Get Anthropic client with API key from database config
 */
async function getAnthropicClient() {
  try {
    logger.info('Retrieving Anthropic API key from configuration');
    const db = getDb();
    
    if (!db) {
      logger.error('Database connection is not available');
      throw new Error('Database not initialized');
    }
    
    logger.info('Querying database for anthropicApiKey...');
    
    // Use the unified DatabaseWrapper method - it handles both SQLite and PostgreSQL
    const row = await db.get('SELECT value FROM config WHERE key = ?', ['anthropicApiKey']);
    
    logger.info(`Database query returned: ${row ? 'row found' : 'no row'}`);
    
    if (!row) {
      logger.error('Anthropic API key not found in configuration database');
      throw new Error('Anthropic API key not configured. Please set it in the Configuration page.');
    }
    
    // API key is stored as a plain string
    let apiKey = row.value;
    logger.info(`Retrieved API key from database (type: ${typeof apiKey}, length: ${apiKey ? apiKey.length : 0}, starts with: ${apiKey ? apiKey.substring(0, 10) : 'null'})`);
    
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      logger.error(`API key validation failed: empty=${!apiKey}, type=${typeof apiKey}, trimmed=${apiKey ? apiKey.trim() === '' : 'n/a'}`);
      throw new Error('Anthropic API key is empty. Please set it in the Configuration page.');
    }
    
    // Trim whitespace and use the key directly
    apiKey = apiKey.trim();
    
    logger.info(`Creating Anthropic client with API key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);
    
    const client = new Anthropic({ apiKey });
    logger.info('Anthropic client created successfully');
    return client;
  } catch (error) {
    logger.error('Fatal error in getAnthropicClient:', { 
      message: error.message, 
      stack: error.stack,
      name: error.name 
    });
    throw error;
  }
}

/**
 * Get Claude model from database config
 */
async function getClaudeModel() {
  const db = getDb();
  
  // Use the unified DatabaseWrapper method - it handles both SQLite and PostgreSQL
  const row = await db.get('SELECT value FROM config WHERE key = ?', ['claudeModel']);
  
  if (!row) {
    logger.info('Claude model not configured, using default: claude-sonnet-4-5-20250929');
    return 'claude-sonnet-4-5-20250929'; // Default model
  }
  
  // Model is stored as a plain string
  const model = row.value?.trim() || 'claude-sonnet-4-5-20250929';
  logger.info(`Using Claude model: ${model}`);
  return model;
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
    
    if (!anthropic) {
      throw new Error('Failed to initialize Anthropic client. Please check your API key configuration.');
    }
    
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

/**
 * Detect patterns across multiple transcripts
 */
async function detectPatterns(transcripts) {
  logger.info('Detecting patterns across transcripts', {
    transcriptCount: transcripts.length
  });

  const prompt = `Analyze these meeting transcripts and identify recurring patterns:

${transcripts.map((t, i) => `
Meeting ${i + 1} (${t.filename}):
${t.content.substring(0, 2000)}...
`).join('\n')}

Identify:
1. **Recurring Themes**: Topics that come up repeatedly
2. **Resource Constraints**: Mentions of limited resources (time, budget, people)
3. **Blocking Issues**: Problems that keep appearing without resolution
4. **Risk Indicators**: Red flags or concerns mentioned multiple times
5. **Progress Patterns**: Are things moving forward or stuck?

Return results as JSON:
{
  "themes": [{"theme": "...", "frequency": 3, "impact": "high|medium|low"}],
  "resourceConstraints": ["..."],
  "blockingIssues": ["..."],
  "riskIndicators": ["..."],
  "progressAssessment": "..."
}`;

  try {
    const anthropic = await getAnthropicClient();
    const model = await getClaudeModel();
    
    logger.info(`Calling Claude API for pattern detection with model: ${model}`);
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
    const responseText = message.content[0].text;
    
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    let patterns;
    
    if (jsonMatch) {
      patterns = JSON.parse(jsonMatch[0]);
    } else {
      patterns = JSON.parse(responseText);
    }
    
    logger.info(`Pattern detection completed in ${duration}ms`, {
      themes: patterns.themes?.length || 0,
      constraints: patterns.resourceConstraints?.length || 0,
      tokens: message.usage?.total_tokens
    });
    
    return patterns;
  } catch (error) {
    logger.error('Error detecting patterns', error);
    throw error;
  }
}

/**
 * Flag risks in commitments and context
 */
async function flagRisks(data) {
  logger.info('Analyzing risks', {
    commitments: data.commitments?.length || 0,
    context: data.context?.length || 0
  });

  const prompt = `Analyze this data and identify risks that need attention:

Commitments:
${JSON.stringify(data.commitments, null, 2)}

Context:
${JSON.stringify(data.context, null, 2)}

Identify:
1. **Overdue Items**: Things past their deadline
2. **At-Risk Deliverables**: Items likely to miss deadlines
3. **Unaddressed Issues**: Problems mentioned but not acted on
4. **Resource Conflicts**: Multiple commitments with same deadline
5. **Vague Commitments**: Unclear or unactionable items

Return results as JSON:
{
  "overdueItems": [{"id": ..., "description": "...", "daysOverdue": ...}],
  "atRiskItems": [{"id": ..., "description": "...", "reason": "..."}],
  "unaddressedIssues": ["..."],
  "resourceConflicts": ["..."],
  "vagueCommitments": [{"id": ..., "description": "...", "suggestion": "..."}]
}`;

  try {
    const anthropic = await getAnthropicClient();
    const model = await getClaudeModel();
    
    logger.info(`Calling Claude API for risk flagging with model: ${model}`);
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
    
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    let risks;
    
    if (jsonMatch) {
      risks = JSON.parse(jsonMatch[0]);
    } else {
      risks = JSON.parse(responseText);
    }
    
    logger.info(`Risk flagging completed in ${duration}ms`, {
      overdue: risks.overdueItems?.length || 0,
      atRisk: risks.atRiskItems?.length || 0,
      tokens: message.usage?.total_tokens
    });
    
    return risks;
  } catch (error) {
    logger.error('Error flagging risks', error);
    throw error;
  }
}

module.exports = {
  generateDailyBrief,
  extractCommitments,
  generateWeeklyReport,
  detectPatterns,
  flagRisks
};
