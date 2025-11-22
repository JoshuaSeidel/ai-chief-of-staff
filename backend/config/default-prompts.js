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
- EXPLICIT commitments: "I will...", "I'll...", "We'll...", "Let me..."
- IMPLICIT tasks: Problems discussed that need solutions, decisions that need follow-up, research mentioned, etc.
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

