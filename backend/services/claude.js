const { callAI, generateResponse, getModel, getMaxTokens } = require('./ai-service');
const { getDb } = require('../database/db');
const { createModuleLogger } = require('../utils/logger');

const logger = createModuleLogger('CLAUDE');

// Legacy functions for backwards compatibility - now use unified AI service
async function getAnthropicClient() {
  const { getAnthropicClient: getClient } = require('./ai-service');
  return await getClient();
}

async function getClaudeModel() {
  const { getAIProvider, getModel, PROVIDERS } = require('./ai-service');
  const provider = await getAIProvider();
  if (provider === PROVIDERS.ANTHROPIC) {
    return await getModel(provider);
  }
  // Fallback for legacy code
  return 'claude-sonnet-4-5-20250929';
}

/**
 * Generate a daily brief from context
 * @param {object} contextData - Context data for brief generation
 * @param {number} profileId - Profile ID for AI preferences
 */
async function generateDailyBrief(contextData, profileId = 2) {
  logger.info('Generating daily brief', {
    contextCount: contextData.context?.length || 0,
    commitmentCount: contextData.commitments?.length || 0,
    transcriptCount: contextData.recentTranscripts?.length || 0,
    profileId
  });

  const prompt = `You are an AI executive assistant. Based on the following context from the last 2 weeks, generate a concise daily brief for your executive.

Context includes:
- Recent meeting transcripts
- Commitments made
- Ongoing projects and their status

Format the brief with these sections:

## 1. TODAY'S TOP 3 PRIORITIES
List the top 3 priorities with specific actions and urgency levels.

## 2. DELIVERABLES THIS WEEK
CRITICAL: You MUST create a properly formatted markdown table. Use this EXACT format:

| Deliverable | Owner | Status | Deadline | Blockers/Notes |
|-------------|-------|--------|----------|----------------|
| OKR bullet points & 2-month action plan | Josh | ⚠️ AT RISK | Nov 26 | Need to prioritize which OKRs to tackle first |
| FedRAMP compliance documentation review | Morelli | 🟢 ON TRACK | Nov 27 | Document generated; needs validation |

REQUIREMENTS:
- Every row MUST start and end with a pipe character (|)
- Every cell MUST be separated by a pipe (|)
- The header separator row MUST use dashes: |-------------|-------|--------|----------|----------------|
- Each row MUST be on its own separate line (no line breaks within a row)
- Status column MUST use: 🟢 ON TRACK, ⚠️ AT RISK, or 🔴 BEHIND
- Keep deliverable descriptions to 10 words or less
- Put detailed information in the Blockers/Notes column

Status indicators:
- 🟢 ON TRACK - No blockers, on schedule
- ⚠️ AT RISK - Has blockers or tight deadline  
- 🔴 BEHIND - Overdue or significant risk

## 3. CHECK-INS NEEDED
List who, why, and when for each check-in.

## 4. COMMITMENTS I MADE
List things said I'd do with deadlines.

Context Data:
${JSON.stringify(contextData, null, 2)}

IMPORTANT: 
- Use proper markdown table syntax with pipes (|) separating columns
- Each table row MUST be on a separate line
- Include the header separator line (|---|---|---|)
- Keep deliverable descriptions concise (max 10 words)
- Put longer notes in Blockers/Notes column`;

  try {
    const maxTokens = await getMaxTokens();
    
    logger.info(`Calling AI service for daily brief`);
    const startTime = Date.now();
    
    const result = await callAI(
      [{ role: 'user', content: prompt }],
      null,
      Math.min(maxTokens, 4096),
      profileId
    );

    const duration = Date.now() - startTime;
    logger.info(`Brief generated successfully in ${duration}ms`, {
      tokens: result.usage?.total_tokens,
      model: result.model
    });

    return result.text;
  } catch (error) {
    logger.error('Error generating brief', error);
    throw error;
  }
}

/**
 * Extract commitments and action items from transcript
 * @param {string} transcriptText - The meeting transcript
 * @param {string} meetingDate - Optional meeting date (ISO format)
 * @param {number} profileId - Profile ID for AI preferences
 */
async function extractCommitments(transcriptText, meetingDate = null, profileId = 2) {
  logger.info('Extracting commitments from transcript', {
    transcriptLength: transcriptText.length,
    meetingDate
  });

  const today = new Date().toISOString().split('T')[0];
  const dateContext = meetingDate ? `This meeting occurred on: ${meetingDate}` : `Today's date: ${today}`;

  // Get user names from config
  const db = getDb();
  let userNames = [];
  try {
    const userNamesConfig = await db.get('SELECT value FROM config WHERE key = ?', ['userNames']);
    if (userNamesConfig && userNamesConfig.value) {
      // Parse comma-separated names
      userNames = userNamesConfig.value.split(',').map(name => name.trim()).filter(Boolean);
      logger.info(`User names configured: ${userNames.join(', ')}`);
    }
  } catch (err) {
    logger.warn('Could not retrieve user names from config:', err.message);
  }

  const userNamesContext = userNames.length > 0 
    ? `\n\nIMPORTANT - USER FILTERING:\nThe user's name(s) are: ${userNames.join(', ')}\n- Only extract tasks where the assignee clearly matches one of these names\n- If assignee is unclear, ambiguous, or doesn't match, set assignee to "TBD" or "Unknown"\n- If assignee is clearly someone else (not in the list), set assignee to that person's name (don't filter it out, but mark it)\n- Tasks assigned to the user (${userNames.join(' or ')}) should have the exact name match\n`
    : '';

  const prompt = `Analyze this meeting transcript and extract actionable items - both explicitly stated AND implied by the discussion.

${dateContext}${userNamesContext}

Look for:
- EXPLICIT commitments: "I will...", "I'll...", "We'll...", "Let me..."
- IMPLICIT tasks: Problems discussed that need solutions, decisions that need follow-up, research mentioned, etc.
- Assign realistic deadlines within 2 WEEKS unless a specific date/timeline is mentioned:
  * If specific date mentioned: use that date
  * If "urgent" or "ASAP": meeting date + 3 days
  * If "this week": meeting date + 5 days  
  * If no timeline: meeting date + 7-14 days (default to 1 week for most tasks)
  * Research/investigation: meeting date + 10 days
- ALL items should have deadlines - never use null for deadline
- For assignee field: Use exact name if clear, "TBD" if ambiguous, or the actual person's name if clearly someone else

Transcript:
${transcriptText}

Return ONLY valid JSON (no markdown, no explanations):
{
  "commitments": [
    {
      "description": "What needs to be done",
      "assignee": "Name or TBD",
      "deadline": "YYYY-MM-DD (required - use meeting date + 7-14 days if not specified)",
      "urgency": "high|medium|low",
      "suggested_approach": "Brief suggestion on how to accomplish this"
    }
  ],
  "actionItems": [
    {
      "description": "Action needed", 
      "priority": "high|medium|low",
      "assignee": "Name or TBD",
      "deadline": "YYYY-MM-DD (required - use meeting date + 3-7 days)",
      "suggested_approach": "How to complete this action"
    }
  ],
  "followUps": [
    {
      "description": "Follow-up item", 
      "with": "person/team",
      "deadline": "YYYY-MM-DD (required - use meeting date + 5-10 days)",
      "priority": "high|medium|low"
    }
  ],
  "risks": [
    {
      "description": "Risk or blocker", 
      "impact": "high|medium|low",
      "deadline": "YYYY-MM-DD (when this needs to be addressed)",
      "mitigation": "Suggested mitigation strategy"
    }
  ]
}`;

  try {
    const maxTokens = await getMaxTokens();
    
    logger.info(`Calling AI service for extraction with max_tokens: ${maxTokens}`);
    const startTime = Date.now();
    
    const result = await callAI(
      [{ role: 'user', content: prompt }],
      null,
      maxTokens,
      profileId
    );

    const duration = Date.now() - startTime;
    const responseText = result.text;
    
    logger.info(`Raw AI response length: ${responseText.length} characters`);
    
    // Extract JSON from response (Claude sometimes wraps it in markdown)
    let extracted;
    try {
      // Remove markdown code blocks if present
      let cleanText = responseText.trim();
      if (cleanText.startsWith('```')) {
        // Extract content between ``` markers
        const match = cleanText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match) {
          cleanText = match[1].trim();
          logger.info('Removed markdown code block wrapper');
        }
      }
      
      // Find the outermost JSON object by counting braces
      const firstBrace = cleanText.indexOf('{');
      if (firstBrace === -1) {
        logger.error('No opening brace found in response', { responseSample: cleanText.substring(0, 200) });
        throw new Error('AI response did not contain valid JSON');
      }
      
      // Count braces to find matching closing brace
      let braceCount = 0;
      let lastBrace = -1;
      for (let i = firstBrace; i < cleanText.length; i++) {
        if (cleanText[i] === '{') braceCount++;
        if (cleanText[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            lastBrace = i;
            break;
          }
        }
      }
      
      if (lastBrace === -1) {
        logger.error('No matching closing brace found', { 
          responseSample: cleanText.substring(0, 500),
          responseEnd: cleanText.substring(cleanText.length - 200)
        });
        throw new Error('AI response JSON is incomplete');
      }
      
      const jsonString = cleanText.substring(firstBrace, lastBrace + 1);
      logger.info(`Extracted JSON string (length: ${jsonString.length}, start: ${jsonString.substring(0, 50)}, end: ${jsonString.substring(jsonString.length - 50)})`);
      
      extracted = JSON.parse(jsonString);
    } catch (parseError) {
      logger.error('JSON parsing failed', { 
        error: parseError.message,
        responseSample: responseText.substring(0, 500)
      });
      throw new Error(`Failed to parse AI response: ${parseError.message}`);
    }
    
    logger.info(`Extraction completed in ${duration}ms`, {
      commitments: extracted.commitments?.length || 0,
      actionItems: extracted.actionItems?.length || 0,
      followUps: extracted.followUps?.length || 0,
      risks: extracted.risks?.length || 0,
      tokens: result.usage?.total_tokens
    });
    
    return extracted;
  } catch (error) {
    logger.error('Error extracting commitments', error);
    throw error;
  }
}

/**
 * Generate weekly report
 * @param {object} weekData - Week data for report generation
 * @param {number} profileId - Profile ID for AI preferences
 */
async function generateWeeklyReport(weekData, profileId = 2) {
  logger.info('Generating weekly report', {
    dataKeys: Object.keys(weekData)
  });

  const prompt = `Generate a concise weekly report for my manager based on this week's activity:

${JSON.stringify(weekData, null, 2)}

The data includes all task types:
- Commitments: formal promises/deliverables
- Action Items: specific actions needed
- Follow-ups: items needing additional discussion
- Risks: potential blockers/issues

Format the report with:
1. WHAT SHIPPED (completed tasks across all types)
2. WHAT'S AT RISK (blockers, delays, and identified risks)
3. NEXT WEEK'S FOCUS (priorities across commitments, actions, follow-ups)

Include task counts by type in your summary.
Keep it executive-level: clear, concise, outcome-focused.`;

  try {
    logger.info(`Calling AI service for weekly report`);
    const startTime = Date.now();
    
    const result = await callAI(
      [{ role: 'user', content: prompt }],
      null,
      1500,
      profileId
    );

    const duration = Date.now() - startTime;
    logger.info(`Weekly report generated successfully in ${duration}ms`, {
      tokens: result.usage?.total_tokens
    });

    return result.text;
  } catch (error) {
    logger.error('Error generating weekly report', error);
    throw error;
  }
}

/**
 * Detect patterns across multiple transcripts
 * @param {Array} transcripts - Array of transcript objects
 * @param {number} profileId - Profile ID for AI preferences
 */
async function detectPatterns(transcripts, profileId = 2) {
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
    logger.info(`Calling AI service for pattern detection`);
    const startTime = Date.now();
    
    const result = await callAI(
      [{ role: 'user', content: prompt }],
      null,
      4096,
      profileId
    );

    const duration = Date.now() - startTime;
    const responseText = result.text;
    
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
      tokens: result.usage?.total_tokens
    });
    
    return patterns;
  } catch (error) {
    logger.error('Error detecting patterns', error);
    throw error;
  }
}

/**
 * Flag risks in commitments and context
 * @param {object} data - Commitments and context data
 * @param {number} profileId - Profile ID for AI preferences
 */
async function flagRisks(data, profileId = 2) {
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
    logger.info(`Calling AI service for risk flagging`);
    const startTime = Date.now();
    
    const result = await callAI(
      [{ role: 'user', content: prompt }],
      null,
      1500,
      profileId
    );

    const duration = Date.now() - startTime;
    const responseText = result.text;
    
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
      tokens: result.usage?.total_tokens
    });
    
    return risks;
  } catch (error) {
    logger.error('Error flagging risks', error);
    throw error;
  }
}

/**
 * Generate detailed calendar event description for a task
 * @param {object} task - Task object
 * @param {string} transcriptContext - Optional transcript context
 * @param {number} profileId - Profile ID for AI preferences
 */
async function generateEventDescription(task, transcriptContext = '', profileId = 2) {
  const prompt = `Generate a detailed, actionable calendar event description for this task:

Task Type: ${task.type || task.task_type || 'Task'}
Title: ${task.description}
Assignee: ${task.assignee || 'Not assigned'}
Priority/Urgency: ${task.priority || task.urgency || 'medium'}
${task.suggested_approach ? `Suggested Approach: ${task.suggested_approach}` : ''}
${task.mitigation ? `Mitigation Strategy: ${task.mitigation}` : ''}
${transcriptContext ? `\nContext from meeting:\n${transcriptContext.substring(0, 500)}` : ''}

Generate a calendar event description (3-5 paragraphs) that includes:
1. **What needs to be done** - Clear summary of the task
2. **Why it matters** - Context and importance
3. **How to approach it** - Concrete steps or suggestions
4. **Success criteria** - What "done" looks like
5. **Resources/considerations** - Any relevant notes

Make it actionable and specific. Use markdown formatting.`;

  try {
    const maxTokens = await getMaxTokens();
    
    const result = await callAI(
      [{ role: 'user', content: prompt }],
      null,
      Math.min(maxTokens, 1500),
      profileId
    );

    return result.text;
  } catch (error) {
    logger.error('Error generating event description', error);
    // Fallback to basic description
    return `${task.description}\n\n${task.suggested_approach || task.mitigation || 'No additional details available.'}`;
  }
}

module.exports = {
  generateDailyBrief,
  extractCommitments,
  generateWeeklyReport,
  detectPatterns,
  flagRisks,
  generateEventDescription
};
