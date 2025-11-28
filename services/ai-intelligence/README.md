# AI Intelligence Service

Python FastAPI microservice for task intelligence and analysis using Claude AI.

## Features

- **Effort Estimation**: Predict task duration with confidence scores
- **Energy Classification**: Categorize tasks by cognitive load
- **Task Clustering**: Group related tasks semantically
- **Redis Caching**: Fast responses with intelligent caching
- **Health Monitoring**: Built-in health checks

## API Endpoints

### POST /estimate-effort
Estimate task duration and complexity.

**Request:**
```json
{
  "description": "Write Q4 strategic plan",
  "context": "Similar reports usually take 2-3 hours"
}
```

**Response:**
```json
{
  "estimated_hours": 3.5,
  "confidence": 0.85,
  "reasoning": "Strategic planning requires research, writing, and review",
  "breakdown": ["Research: 1hr", "Writing: 2hrs", "Review: 0.5hr"]
}
```

### POST /classify-energy
Classify task by energy level.

**Request:**
```json
{
  "description": "Update team spreadsheet with Q3 numbers"
}
```

**Response:**
```json
{
  "energy_level": "administrative",
  "confidence": 0.9,
  "description": "Low cognitive load, routine work"
}
```

### POST /cluster-tasks
Group related tasks.

**Request:**
```json
{
  "tasks": [
    {"id": 1, "description": "Review Q4 budget", "deadline": "2025-12-01"},
    {"id": 2, "description": "Prepare Q4 presentation", "deadline": "2025-12-05"},
    {"id": 3, "description": "Send weekly email", "deadline": "2025-11-29"}
  ]
}
```

**Response:**
```json
{
  "clusters": [
    {
      "name": "Q4 Planning",
      "description": "Budget and presentation tasks",
      "task_indices": [1, 2],
      "keywords": ["Q4", "budget", "presentation"]
    }
  ]
}
```

## Development

```bash
# Install dependencies
pip install -r requirements.txt

# Set environment variables
export ANTHROPIC_API_KEY=your_key_here
export REDIS_URL=redis://localhost:6379

# Run development server
uvicorn main:app --reload --port 8001
```

## Docker

```bash
# Build image
docker build -t ai-intelligence:latest .

# Run container
docker run -p 8001:8001 \
  -e ANTHROPIC_API_KEY=your_key \
  -e REDIS_URL=redis://redis:6379 \
  ai-intelligence:latest
```

## Testing

```bash
# Test effort estimation
curl -X POST http://localhost:8001/estimate-effort \
  -H "Content-Type: application/json" \
  -d '{"description": "Write quarterly report"}'

# Health check
curl http://localhost:8001/health
```

## Environment Variables

- `ANTHROPIC_API_KEY` - Claude API key (required)
- `REDIS_URL` - Redis connection URL (default: redis://redis:6379)
- `LOG_LEVEL` - Logging level (default: INFO)

## Performance

- **Caching**: Responses cached for 1 hour
- **Workers**: 2 uvicorn workers for parallel processing
- **Timeout**: 30s request timeout
- **Scaling**: Can scale horizontally with load balancer
