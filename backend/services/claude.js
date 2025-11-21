const Anthropic = require('@anthropic-ai/sdk');
const { getDb, getDbType } = require('../database/db');

/**
 * Get Anthropic client with API key from database config
 */
async function getAnthropicClient() {
  const db = getDb();
  const dbType = getDbType();
  
  if (dbType === 'postgres') {
    const result = await db.query('SELECT value FROM config WHERE key = $1', ['anthropicApiKey']);
    if (result.rows.length === 0) {
      throw new Error('Anthropic API key not configured. Please set it in the Configuration page.');
    }
    try {
      // Handle both plain strings and JSON-encoded values
      let apiKey = result.rows[0].value;
      if (apiKey.startsWith('"')) {
        apiKey = JSON.parse(apiKey);
      }
      return new Anthropic({ apiKey });
    } catch (e) {
      throw new Error('Invalid API key format');
    }
  } else {
    return new Promise((resolve, reject) => {
      db.get('SELECT value FROM config WHERE key = ?', ['anthropicApiKey'], (err, row) => {
        if (err) {
          reject(err);
        } else if (!row) {
          reject(new Error('Anthropic API key not configured. Please set it in the Configuration page.'));
        } else {
          try {
            // Handle both plain strings and JSON-encoded values
            let apiKey = row.value;
            if (apiKey.startsWith('"')) {
              apiKey = JSON.parse(apiKey);
            }
            const anthropic = new Anthropic({ apiKey });
            resolve(anthropic);
          } catch (e) {
            reject(new Error('Invalid API key format'));
          }
        }
      });
    });
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
      return 'claude-sonnet-4-5-20250929'; // Default model
    }
    try {
      // Handle both plain strings and JSON-encoded values
      let model = result.rows[0].value;
      if (model.startsWith('"')) {
        model = JSON.parse(model);
      }
      return model;
    } catch (e) {
      return 'claude-sonnet-4-5-20250929';
    }
  } else {
    return new Promise((resolve) => {
      db.get('SELECT value FROM config WHERE key = ?', ['claudeModel'], (err, row) => {
        if (err || !row) {
          resolve('claude-sonnet-4-5-20250929'); // Default model
        } else {
          try {
            // Handle both plain strings and JSON-encoded values
            let model = row.value;
            if (model.startsWith('"')) {
              model = JSON.parse(model);
            }
            resolve(model);
          } catch (e) {
            resolve('claude-sonnet-4-5-20250929');
          }
        }
      });
    });
  }
}

/**
 * Generate a daily brief from context
 */
async function generateDailyBrief(contextData) {
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

    return message.content[0].text;
  } catch (error) {
    console.error('Error generating brief:', error);
    throw error;
  }
}

/**
 * Extract commitments and action items from transcript
 */
async function extractCommitments(transcriptText) {
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

    const responseText = message.content[0].text;
    // Extract JSON from response (Claude sometimes wraps it in markdown)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(responseText);
  } catch (error) {
    console.error('Error extracting commitments:', error);
    throw error;
  }
}

/**
 * Generate weekly report
 */
async function generateWeeklyReport(weekData) {
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

    return message.content[0].text;
  } catch (error) {
    console.error('Error generating weekly report:', error);
    throw error;
  }
}

module.exports = {
  generateDailyBrief,
  extractCommitments,
  generateWeeklyReport
};
