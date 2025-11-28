# Natural Language Parser Service

Parses natural language input into structured task data using Claude AI.

## Features

- **Single Task Parsing**: Convert "Write report by Friday" → structured task
- **Bulk Parsing**: Parse multiple tasks from multi-line input
- **Quick Add**: Ultra-fast parsing for minimal input like "coffee 2pm"
- **Commitment Extraction**: Pull action items from meeting notes/emails
- **Smart Date Parsing**: Handles "tomorrow", "next Tuesday", "in 3 days"
- **Priority Detection**: Auto-detects urgent, high, medium, low priorities
- **Tag Extraction**: Finds hashtags and common project tags

## API Endpoints

### `POST /parse-task`
Parse single natural language task.

**Request:**
```json
{
  "text": "Write quarterly report by Friday 5pm #reports",
  "context": "Q4 planning meeting",
  "user_timezone": "America/New_York"
}
```

**Response:**
```json
{
  "title": "Write quarterly report",
  "description": null,
  "deadline": "2024-12-01T17:00:00",
  "priority": "medium",
  "estimated_hours": null,
  "tags": ["reports"],
  "assignee": null,
  "project": null,
  "confidence": 0.9
}
```

### `POST /parse-bulk`
Parse multiple tasks from multi-line text.

**Request:**
```json
{
  "text": "- Write Q4 report by Friday\n- Call client tomorrow at 2pm\n- Review code #development",
  "context": "Weekly planning",
  "user_timezone": "UTC"
}
```

**Response:**
```json
[
  {
    "title": "Write Q4 report",
    "deadline": "2024-12-01T17:00:00",
    "priority": "medium",
    "tags": ["reports"],
    "confidence": 0.85
  },
  {
    "title": "Call client",
    "deadline": "2024-11-29T14:00:00",
    "priority": "medium",
    "tags": ["calls"],
    "confidence": 0.85
  }
]
```

### `POST /quick-add`
Quick parsing for minimal input.

**Request:**
```json
{
  "text": "coffee 2pm tomorrow",
  "user_timezone": "UTC"
}
```

**Response:**
```json
{
  "title": "coffee",
  "deadline": "2024-11-29T14:00:00",
  "priority": "medium",
  "confidence": 0.7
}
```

### `POST /extract-commitments`
Extract action items from long text.

**Request:**
```json
{
  "text": "Meeting notes: John will complete the proposal by Dec 1st. Sarah needs to review the design by next Tuesday. We all agreed to submit feedback by end of week."
}
```

**Response:**
```json
{
  "commitments": [
    {
      "action": "Complete proposal",
      "owner": "John",
      "deadline": "2024-12-01",
      "priority": "high",
      "context": "Project proposal"
    },
    {
      "action": "Review design",
      "owner": "Sarah",
      "deadline": "2024-12-03",
      "priority": "medium",
      "context": "Design review"
    }
  ],
  "count": 2
}
```

### `GET /health`
Health check endpoint.

## Supported Date Formats

- **Relative**: "today", "tomorrow", "next week", "next Tuesday"
- **In X time**: "in 3 days", "in 2 hours"
- **Specific days**: "Monday", "Friday"
- **With times**: "2pm", "14:30", "9:00am"

## Priority Detection

Automatically detects priority from keywords:

- **Urgent**: "urgent", "ASAP", "critical", "!!!"
- **High**: "high priority", "important", "high"
- **Low**: "low priority", "when possible", "low"
- **Medium**: Default

## Tag Extraction

- **Hashtags**: #reports, #meetings, #development
- **Keywords**: "meeting" → #meetings, "email" → #communication
- **Projects**: Detects project names if mentioned

## Environment Variables

- `ANTHROPIC_API_KEY` (required): Anthropic API key
- `REDIS_URL` (optional): Redis for caching (default: redis://redis:6379)

## Running Locally

```bash
# Install dependencies
pip install -r requirements.txt

# Set environment
export ANTHROPIC_API_KEY=sk-ant-your-key
export REDIS_URL=redis://localhost:6379

# Run
uvicorn main:app --reload --port 8003
```

## Docker

```bash
# Build
docker build -t nl-parser .

# Run
docker run -p 8003:8003 \
  -e ANTHROPIC_API_KEY=sk-ant-your-key \
  nl-parser
```

## Testing

```bash
# Parse single task
curl -X POST http://localhost:8003/parse-task \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Write quarterly report by Friday 5pm #reports",
    "user_timezone": "UTC"
  }'

# Parse bulk tasks
curl -X POST http://localhost:8003/parse-bulk \
  -H "Content-Type: application/json" \
  -d '{
    "text": "- Email client\n- Review PRs\n- Team meeting 2pm",
    "user_timezone": "UTC"
  }'

# Quick add
curl -X POST http://localhost:8003/quick-add \
  -H "Content-Type: application/json" \
  -d '{
    "text": "dentist 3pm tomorrow",
    "user_timezone": "UTC"
  }'

# Extract commitments
curl -X POST http://localhost:8003/extract-commitments \
  -H "Content-Type: application/json" \
  -d "Meeting notes: John will send report by Friday..."
```

## Examples

### Simple task
Input: `"Review PRs by end of day"`
Output:
```json
{
  "title": "Review PRs",
  "deadline": "2024-11-28T17:00:00",
  "priority": "medium"
}
```

### With time and priority
Input: `"URGENT: Call client tomorrow at 2pm about contract"`
Output:
```json
{
  "title": "Call client about contract",
  "deadline": "2024-11-29T14:00:00",
  "priority": "urgent",
  "tags": ["calls"]
}
```

### With duration
Input: `"Write documentation - should take 3 hours #dev"`
Output:
```json
{
  "title": "Write documentation",
  "estimated_hours": 3.0,
  "tags": ["dev", "documentation"]
}
```

## Performance

- **Response Time**: 
  - Cached: < 5ms
  - Uncached: 500-1500ms (Claude API call)
- **Memory**: ~1GB
- **CPU**: 1 core sufficient
- **Workers**: 1 (sequential processing optimal)

## Caching

Results cached in Redis for 30 minutes:
- Reduces API costs
- Faster responses for repeated queries
- Cache key based on input text hash

## Integration

Integrate with main backend:

```javascript
// backend/routes/intelligence.js
app.post('/api/tasks/parse', async (req, res) => {
  const response = await fetch('http://nl-parser:8003/parse-task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  });
  const parsed = await response.json();
  
  // Create task from parsed data
  const task = await createTask(parsed);
  res.json(task);
});
```

## Error Handling

Service provides graceful fallbacks:
- If AI parsing fails, uses regex-based extraction
- Returns partial results with lower confidence
- Never throws errors for invalid input

## Future Enhancements

- [ ] Support for recurring tasks ("every Monday")
- [ ] Multi-language support
- [ ] Custom date formats per user
- [ ] Learning from user corrections
- [ ] Voice input transcription integration
