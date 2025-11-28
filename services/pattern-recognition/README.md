# Pattern Recognition Service

Machine learning service for detecting behavioral patterns and productivity insights.

## Features

- **Pattern Detection**: Identifies working hours, energy levels, task clustering
- **Focus Time Analysis**: Finds optimal hours for deep work
- **Anomaly Detection**: Spots unusual task patterns (spikes, urgent deadlines)
- **Streak Analysis**: Tracks completion streaks for motivation
- **AI-Powered Insights**: Uses Claude to detect complex behavioral patterns

## API Endpoints

### `POST /detect-patterns`
Detect productivity patterns from completion history.

**Request:**
```json
{
  "events": [
    {
      "task_id": 1,
      "description": "Write quarterly report",
      "completed_at": "2024-11-28T14:30:00Z",
      "estimated_hours": 3.0,
      "energy_level": "deep_work"
    }
  ],
  "timezone": "America/New_York"
}
```

**Response:**
```json
[
  {
    "pattern_type": "peak_working_hours",
    "description": "You're most productive during 14:00, 10:00, 15:00",
    "confidence": 0.85,
    "data": {
      "peak_hours": [14, 10, 15],
      "productivity_by_hour": {"14": 12.5, "10": 9.0}
    },
    "recommendations": [
      "Schedule deep work tasks during 14:00-16:00",
      "Block these hours for focused work"
    ]
  }
]
```

### `POST /analyze-focus-time`
Analyze optimal focus time windows.

**Request:**
```json
{
  "events": [...],  // Same as detect-patterns
  "timezone": "UTC"
}
```

**Response:**
```json
{
  "optimal_hours": [9, 10, 14, 15],
  "focus_score_by_hour": {
    "9": 8.5,
    "10": 9.2,
    "14": 10.1
  },
  "deep_work_windows": [
    {
      "start": "09:00",
      "end": "11:00",
      "quality": "high"
    }
  ],
  "recommendations": [
    "Your peak focus time is around 9:00",
    "Block calendar during these windows"
  ]
}
```

### `POST /detect-anomalies`
Detect unusual task patterns.

**Request:**
```json
{
  "events": [
    {
      "task_id": 1,
      "description": "Urgent fix",
      "created_at": "2024-11-28T14:00:00Z",
      "deadline": "2024-11-28T14:30:00Z",
      "priority": "high"
    }
  ]
}
```

**Response:**
```json
{
  "anomalies": [
    {
      "type": "urgent_deadline",
      "task_id": 1,
      "description": "Task created with < 1 hour deadline: Urgent fix"
    }
  ],
  "severity": "high",
  "recommendations": [
    "Multiple urgent deadlines detected - plan ahead",
    "Consider adding buffer time"
  ]
}
```

### `POST /analyze-streak`
Analyze completion streaks.

**Request:**
```json
{
  "events": [...]  // CompletionEvent array
}
```

**Response:**
```json
{
  "current_streak": 5,
  "longest_streak": 12,
  "streak_type": "daily",
  "at_risk": false,
  "motivation_message": "Great work! 5 days in a row. Keep it going!"
}
```

### `GET /health`
Health check endpoint.

## Environment Variables

- `ANTHROPIC_API_KEY` (required): Anthropic API key for AI analysis
- `REDIS_URL` (optional): Redis URL for caching (default: redis://redis:6379)

## Running Locally

```bash
# Install dependencies
pip install -r requirements.txt

# Set environment variables
export ANTHROPIC_API_KEY=sk-ant-your-key
export REDIS_URL=redis://localhost:6379

# Run service
uvicorn main:app --reload --port 8002
```

## Docker

```bash
# Build
docker build -t pattern-recognition .

# Run
docker run -p 8002:8002 \
  -e ANTHROPIC_API_KEY=sk-ant-your-key \
  -e REDIS_URL=redis://redis:6379 \
  pattern-recognition
```

## Testing

```bash
# Test pattern detection
curl -X POST http://localhost:8002/detect-patterns \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "task_id": 1,
        "description": "Morning standup",
        "completed_at": "2024-11-28T09:00:00Z",
        "energy_level": "focused"
      },
      {
        "task_id": 2,
        "description": "Deep work session",
        "completed_at": "2024-11-28T10:30:00Z",
        "estimated_hours": 2.5,
        "energy_level": "deep_work"
      }
    ]
  }'

# Test focus time analysis
curl -X POST http://localhost:8002/analyze-focus-time \
  -H "Content-Type: application/json" \
  -d '{"events": [...]}'

# Test anomaly detection
curl -X POST http://localhost:8002/detect-anomalies \
  -H "Content-Type: application/json" \
  -d '{"events": [...]}'

# Test streak analysis
curl -X POST http://localhost:8002/analyze-streak \
  -H "Content-Type: application/json" \
  -d '{"events": [...]}'
```

## Caching

The service uses Redis for caching to reduce API calls and improve performance:

- Pattern detection: 30 minutes TTL
- Focus time analysis: 30 minutes TTL
- Cache keys are MD5 hashes of input data

## Performance

- **Workers**: 2 uvicorn workers for parallel request handling
- **Memory**: ~2GB recommended for ML operations
- **CPU**: 2 cores recommended
- **Response Time**: 
  - Cached: < 10ms
  - Uncached (no AI): 50-100ms
  - With AI analysis: 1-3 seconds

## Machine Learning Features

The service performs:
- Statistical analysis (mean, standard deviation)
- Time series pattern detection
- Anomaly detection using statistical thresholds
- AI-powered complex pattern recognition via Claude

## Integration

This service integrates with the main backend through the intelligence routes:

```javascript
// In backend/routes/intelligence.js
app.post('/api/intelligence/patterns', async (req, res) => {
  const response = await fetch('http://pattern-recognition:8002/detect-patterns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  });
  res.json(await response.json());
});
```
