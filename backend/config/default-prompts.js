/**
 * Default AI prompts for the system
 * These can be customized via the configuration UI
 */

const DEFAULT_PROMPTS = {
  extractCommitments: {
    name: 'Task Extraction Prompt',
    description: 'Used to extract commitments, actions, follow-ups, and risks from meeting transcripts',
    prompt: `Analyze this meeting transcript and extract all commitments, action items, follow-ups, and risks.

{{dateContext}}

Look for:
- EXPLICIT commitments only when the configured user personally said or wrote "I will...", "I'll...", "Let me...", clearly accepted ownership, or was directly assigned by name
- User-owned action items that are clearly assigned to the configured user as the action taker
- Follow-ups only when the configured user should perform the check-in, not merely because the user was copied or informed
- Risks only when the configured user likely needs awareness or follow-up because of their role
- Do not extract general team work, someone else's assignment, passive status updates, FYIs, or ambiguous "we should" work as commitments/actions
- Do not treat first-person statements as the configured user's commitments unless the speaker/writer is clearly the configured user
- Do not create tasks for other people. If it belongs to someone else, omit it unless it should be a follow-up owned by the configured user.
- For emails, being in To/Cc is not enough. Extract an action only when the email asks or assigns the configured user to act.
- Skip newsletter, digest, no-reply, marketing, spam-like, and automated notification risks unless there is a clear user-owned operational consequence.
- Assign realistic deadlines within 2 WEEKS unless a specific date/timeline is mentioned:
  * If specific date mentioned: use that date
  * If "urgent" or "ASAP": meeting date + 3 days
  * If "this week": meeting date + 5 days  
  * If no timeline: meeting date + 7-14 days (default to 1 week for most tasks)
  * Research/investigation: meeting date + 10 days
- ALL items should have deadlines - never use null for deadline

Transcript:
{{transcriptText}}

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
}`
  },
  
  generateEventDescription: {
    name: 'Calendar Event Description Prompt',
    description: 'Used to generate detailed descriptions for calendar events',
    prompt: `Generate a detailed, actionable calendar event description for this task:

Task Type: {{taskType}}
Title: {{description}}
Assignee: {{assignee}}
Priority/Urgency: {{priority}}
{{suggestedApproach}}
{{mitigation}}
{{transcriptContext}}

Generate a calendar event description (3-5 paragraphs) that includes:
1. **What needs to be done** - Clear summary of the task
2. **Why it matters** - Context and importance
3. **How to approach it** - Concrete steps or suggestions
4. **Success criteria** - What "done" looks like
5. **Resources/considerations** - Any relevant notes

Make it actionable and specific. Use markdown formatting.`
  },
  
  generateDailyBrief: {
    name: 'Daily Brief Prompt',
    description: 'Used to generate the executive daily brief',
    prompt: `You are an AI executive assistant. Based on the following context from the last 2 weeks, generate a concise daily brief for your executive.

Context includes:
- Recent meeting transcripts
- Commitments made
- Ongoing projects and their status

Format the brief with these sections:

## 1. TODAY'S TOP 3 PRIORITIES
List the top 3 priorities with specific actions and urgency levels.

## 2. DELIVERABLES THIS WEEK
Create a markdown table with proper pipe separators on SEPARATE LINES. Each row must be on its own line:

| Deliverable | Owner | Status | Deadline | Blockers/Notes |
|-------------|-------|--------|----------|----------------|
| Example task 1 | Owner | ⚠️ AT RISK | Nov 26 | Blocker description |
| Example task 2 | Owner | 🟢 ON TRACK | Nov 27 | Notes here |

Status indicators:
- 🟢 ON TRACK - No blockers, on schedule
- ⚠️ AT RISK - Has blockers or tight deadline
- 🔴 BEHIND - Overdue or significant risk

## 3. CHECK-INS NEEDED
List who, why, and when for each check-in.

## 4. COMMITMENTS I MADE
List things said I'd do with deadlines.

Context Data:
{{contextData}}

IMPORTANT: 
- Use proper markdown table syntax with pipes (|) separating columns
- Each table row MUST be on a separate line
- Include the header separator line (|---|---|---|)
- Keep deliverable descriptions concise (max 10 words)
- Put longer notes in Blockers/Notes column`
  },
  
  generateWeeklyReport: {
    name: 'Weekly Report Prompt',
    description: 'Used to generate executive weekly reports',
    prompt: `Generate a concise weekly report for my manager based on this week's activity:

{{weekData}}

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
Keep it executive-level: clear, concise, outcome-focused.`
  }
};

module.exports = { DEFAULT_PROMPTS };
