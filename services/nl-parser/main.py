"""
Natural Language Parser Service - AI Chief of Staff
Parses natural language input into structured task data
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
from datetime import datetime, timedelta
import sys
import os

# Add shared modules to path
sys.path.insert(0, '/app/shared')
from db_config import get_ai_model, get_ai_provider

import anthropic
import redis
import logging
import hashlib
import json
import re

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - [%(funcName)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Natural Language Parser Service",
    description="Parses natural language into structured task data",
    version="1.0.0"
)

# Middleware for request logging
@app.middleware("http")
async def log_requests(request, call_next):
    start_time = datetime.now()
    logger.info(f"→ {request.method} {request.url.path}")
    
    response = await call_next(request)
    
    duration = (datetime.now() - start_time).total_seconds()
    logger.info(f"← {request.method} {request.url.path} [{response.status_code}] {duration:.3f}s")
    
    return response

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize clients
anthropic_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
redis_client = None

try:
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379")
    redis_client = redis.from_url(redis_url, decode_responses=True)
    redis_client.ping()
    logger.info(f"✓ Connected to Redis at {redis_url}")
except Exception as e:
    logger.warning(f"Redis not available: {e}. Running without cache.")

# ============================================================================
# Models
# ============================================================================

class NLParseRequest(BaseModel):
    text: str
    context: Optional[str] = None
    user_timezone: str = "UTC"

class ParsedTask(BaseModel):
    title: str
    description: Optional[str] = None
    deadline: Optional[str] = None  # ISO format
    priority: Optional[str] = None  # low, medium, high, urgent
    estimated_hours: Optional[float] = None
    tags: List[str] = []
    assignee: Optional[str] = None
    project: Optional[str] = None
    confidence: float = 1.0

class BulkTaskRequest(BaseModel):
    text: str  # Multi-line text with multiple tasks
    context: Optional[str] = None
    user_timezone: str = "UTC"

class QuickAddRequest(BaseModel):
    text: str  # Short format like "coffee meeting 2pm tomorrow"
    user_timezone: str = "UTC"

# ============================================================================
# Helper Functions
# ============================================================================

def get_cache_key(prefix: str, text: str) -> str:
    """Generate cache key from text"""
    hash_obj = hashlib.md5(text.encode())
    return f"{prefix}:{hash_obj.hexdigest()}"

def cache_get(key: str) -> Optional[Dict]:
    """Get from cache"""
    if not redis_client:
        return None
    try:
        cached = redis_client.get(key)
        if cached:
            logger.info(f"Cache hit: {key}")
            return json.loads(cached)
    except Exception as e:
        logger.warning(f"Cache get error: {e}")
    return None

def cache_set(key: str, value: Dict, ttl: int = 3600) -> None:
    """Set cache with TTL"""
    if not redis_client:
        return
    try:
        redis_client.setex(key, ttl, json.dumps(value, default=str))
    except Exception as e:
        logger.warning(f"Cache set error: {e}")

def parse_relative_date(text: str, timezone: str = "UTC") -> Optional[str]:
    """Parse relative dates like 'tomorrow', 'next week', 'in 3 days'"""
    text_lower = text.lower()
    now = datetime.utcnow()
    
    # Today
    if "today" in text_lower:
        # Check for time
        time_match = re.search(r'(\d{1,2}):?(\d{2})?\s*(am|pm)?', text_lower)
        if time_match:
            hour = int(time_match.group(1))
            minute = int(time_match.group(2) or 0)
            period = time_match.group(3)
            if period == 'pm' and hour < 12:
                hour += 12
            return now.replace(hour=hour, minute=minute, second=0, microsecond=0).isoformat()
        return now.replace(hour=17, minute=0, second=0, microsecond=0).isoformat()  # Default 5pm
    
    # Tomorrow
    if "tomorrow" in text_lower:
        time_match = re.search(r'(\d{1,2}):?(\d{2})?\s*(am|pm)?', text_lower)
        tomorrow = now + timedelta(days=1)
        if time_match:
            hour = int(time_match.group(1))
            minute = int(time_match.group(2) or 0)
            period = time_match.group(3)
            if period == 'pm' and hour < 12:
                hour += 12
            return tomorrow.replace(hour=hour, minute=minute, second=0, microsecond=0).isoformat()
        return tomorrow.replace(hour=17, minute=0, second=0, microsecond=0).isoformat()
    
    # Next week
    if "next week" in text_lower:
        next_week = now + timedelta(days=7)
        return next_week.replace(hour=17, minute=0, second=0, microsecond=0).isoformat()
    
    # In X days/hours
    days_match = re.search(r'in (\d+) days?', text_lower)
    if days_match:
        days = int(days_match.group(1))
        target = now + timedelta(days=days)
        return target.replace(hour=17, minute=0, second=0, microsecond=0).isoformat()
    
    hours_match = re.search(r'in (\d+) hours?', text_lower)
    if hours_match:
        hours = int(hours_match.group(1))
        target = now + timedelta(hours=hours)
        return target.isoformat()
    
    # Day of week (assuming next occurrence)
    weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    for i, day in enumerate(weekdays):
        if day in text_lower:
            current_weekday = now.weekday()
            days_ahead = (i - current_weekday) % 7
            if days_ahead == 0:
                days_ahead = 7  # Next week if same day
            target = now + timedelta(days=days_ahead)
            return target.replace(hour=17, minute=0, second=0, microsecond=0).isoformat()
    
    return None

def extract_priority(text: str) -> str:
    """Extract priority from text"""
    text_lower = text.lower()
    if any(word in text_lower for word in ['urgent', 'asap', 'critical', '!!!']):
        return 'urgent'
    if any(word in text_lower for word in ['high priority', 'important', 'high']):
        return 'high'
    if any(word in text_lower for word in ['low priority', 'low', 'when possible']):
        return 'low'
    return 'medium'

def extract_tags(text: str) -> List[str]:
    """Extract hashtags and common tags"""
    # Find hashtags
    hashtags = re.findall(r'#(\w+)', text)
    
    # Common project tags
    project_keywords = {
        'meeting': 'meetings',
        'email': 'communication',
        'report': 'reports',
        'review': 'reviews',
        'plan': 'planning',
        'call': 'calls',
        'presentation': 'presentations'
    }
    
    text_lower = text.lower()
    tags = set(hashtags)
    for keyword, tag in project_keywords.items():
        if keyword in text_lower:
            tags.add(tag)
    
    return list(tags)

# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/")
async def root():
    return {
        "service": "Natural Language Parser Service",
        "version": "1.0.0",
        "status": "healthy"
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    redis_status = "connected" if redis_client else "disconnected"
    try:
        if redis_client:
            redis_client.ping()
    except:
        redis_status = "error"
    
    return {
        "status": "healthy",
        "service": "nl-parser",
        "version": "1.0.0",
        "redis": redis_status,
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/parse-task", response_model=ParsedTask)
async def parse_task(request: NLParseRequest):
    """
    Parse natural language into structured task
    
    Examples:
    - "Write quarterly report by Friday 5pm #reports"
    - "Call John tomorrow at 2pm about project review"
    - "Review PRs - should take 2 hours, high priority"
    """
    try:
        # Check cache
        cache_key = get_cache_key("parse", request.text)
        cached = cache_get(cache_key)
        if cached:
            return cached
        
        # Quick extraction for simple cases
        deadline = parse_relative_date(request.text, request.user_timezone)
        priority = extract_priority(request.text)
        tags = extract_tags(request.text)
        
        # Extract estimated hours
        estimated_hours = None
        # Limit input to prevent ReDoS and use bounded quantifiers
        text_for_regex = request.text[:500]
        hours_match = re.search(r'(\d{1,4}(?:\.\d{1,2})?)\s*(?:hours?|hrs?)', text_for_regex, re.IGNORECASE)
        if hours_match:
            estimated_hours = float(hours_match.group(1))
        
        # Use AI for complex parsing
        prompt = f"""Parse this task description into structured data:

"{request.text}"

Context: {request.context or 'None'}
User timezone: {request.user_timezone}

Extract:
1. Title (concise task name, 3-7 words)
2. Description (detailed info if present, or None)
3. Deadline (ISO format datetime, or None if not specified)
4. Priority (low/medium/high/urgent)
5. Estimated hours (float, or None)
6. Tags (relevant categories)
7. Assignee (if mentioned, or None)
8. Project (if mentioned, or None)

Return as JSON:
{{
  "title": "...",
  "description": "..." or null,
  "deadline": "2024-11-28T17:00:00" or null,
  "priority": "medium",
  "estimated_hours": 2.0 or null,
  "tags": ["tag1", "tag2"],
  "assignee": null,
  "project": null
}}

Be concise. Only include non-null values.
"""
        
        # Get model from database configuration
        model = get_ai_model(provider="anthropic")
        
        # Use Claude for quick parsing
        response = anthropic_client.messages.create(
            model=model,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}]
        )
        
        content = response.content[0].text
        
        # Extract JSON from response
        json_match = re.search(r'\{[\s\S]*\}', content)
        if json_match:
            parsed = json.loads(json_match.group())
            
            # Merge AI results with quick extraction
            result = ParsedTask(
                title=parsed.get("title", request.text[:50]),
                description=parsed.get("description"),
                deadline=parsed.get("deadline") or deadline,
                priority=parsed.get("priority") or priority,
                estimated_hours=parsed.get("estimated_hours") or estimated_hours,
                tags=list(set(parsed.get("tags", []) + tags)),
                assignee=parsed.get("assignee"),
                project=parsed.get("project"),
                confidence=0.9
            )
        else:
            # Fallback to quick extraction
            result = ParsedTask(
                title=request.text[:50],
                description=request.text if len(request.text) > 50 else None,
                deadline=deadline,
                priority=priority,
                estimated_hours=estimated_hours,
                tags=tags,
                confidence=0.6
            )
        
        # Cache result
        cache_set(cache_key, result.dict(), ttl=1800)
        
        return result
        
    except Exception as e:
        logger.error(f"❌ Parse task error: {e}", exc_info=True)
        # Return fallback result
        return ParsedTask(
            title=request.text[:50],
            priority="medium",
            confidence=0.3
        )

@app.post("/parse-bulk", response_model=List[ParsedTask])
async def parse_bulk(request: BulkTaskRequest):
    """
    Parse multiple tasks from multi-line text
    
    Example:
    ```
    - Write Q4 report by Friday
    - Call client tomorrow at 2pm
    - Review code #development
    ```
    """
    try:
        # Split by newlines and common separators
        lines = re.split(r'\n|;|\|', request.text)
        
        # Filter out empty lines and clean up
        tasks_text = []
        for line in lines:
            line = line.strip()
            # Remove common list markers
            line = re.sub(r'^[-*•]\s*', '', line)
            line = re.sub(r'^\d+[\.)]\s*', '', line)
            if line and len(line) > 3:
                tasks_text.append(line)
        
        if not tasks_text:
            return []
        
        # Use AI to parse all tasks at once (more efficient)
        prompt = f"""Parse these tasks into structured data:

{chr(10).join(f'{i+1}. {task}' for i, task in enumerate(tasks_text))}

Context: {request.context or 'None'}
User timezone: {request.user_timezone}

For each task, extract:
- title (concise, 3-7 words)
- deadline (ISO format if mentioned)
- priority (low/medium/high/urgent)
- estimated_hours (if mentioned)
- tags (relevant categories)

Return as JSON array:
[
  {{
    "title": "...",
    "deadline": "2024-11-28T17:00:00" or null,
    "priority": "medium",
    "estimated_hours": 2.0 or null,
    "tags": ["tag1"]
  }}
]
"""
        
        model = get_ai_model(provider='anthropic')
        response = anthropic_client.messages.create(
            model=model,
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}]
        )
        
        content = response.content[0].text
        
        # Extract JSON array
        json_match = re.search(r'\[[\s\S]*\]', content)
        if json_match:
            parsed_list = json.loads(json_match.group())
            results = []
            for i, parsed in enumerate(parsed_list[:len(tasks_text)]):
                results.append(ParsedTask(
                    title=parsed.get("title", tasks_text[i][:50]),
                    description=parsed.get("description"),
                    deadline=parsed.get("deadline"),
                    priority=parsed.get("priority", "medium"),
                    estimated_hours=parsed.get("estimated_hours"),
                    tags=parsed.get("tags", []),
                    assignee=parsed.get("assignee"),
                    project=parsed.get("project"),
                    confidence=0.85
                ))
            return results
        else:
            # Fallback: parse each individually
            results = []
            for task_text in tasks_text[:10]:  # Limit to 10 tasks
                result = await parse_task(NLParseRequest(
                    text=task_text,
                    context=request.context,
                    user_timezone=request.user_timezone
                ))
                results.append(result)
            return results
        
    except Exception as e:
        logger.error(f"❌ Bulk parse error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/quick-add", response_model=ParsedTask)
async def quick_add(request: QuickAddRequest):
    """
    Quick-add format parser for very short inputs
    
    Examples:
    - "coffee 2pm"
    - "standup 9am tomorrow"
    - "dentist next tuesday 3pm"
    """
    try:
        # Very aggressive parsing for minimal input
        text = request.text.strip()
        
        # Extract time and deadline
        deadline = parse_relative_date(text, request.user_timezone)
        
        # Title is everything else
        title = text
        # Remove time patterns from title
        title = re.sub(r'\d{1,2}:?\d{0,2}\s*(am|pm)?', '', title, flags=re.IGNORECASE)
        title = re.sub(r'\b(today|tomorrow|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b', '', title, flags=re.IGNORECASE)
        title = re.sub(r'in \d+ (days?|hours?)', '', title, flags=re.IGNORECASE)
        title = title.strip()
        
        if not title:
            title = text[:30]
        
        return ParsedTask(
            title=title,
            deadline=deadline,
            priority="medium",
            confidence=0.7
        )
        
    except Exception as e:
        logger.error(f"❌ Quick add error: {e}", exc_info=True)
        return ParsedTask(
            title=request.text[:30],
            priority="medium",
            confidence=0.5
        )

@app.post("/extract-commitments")
async def extract_commitments(text: str):
    """
    Extract commitments and action items from meeting notes or emails
    
    Returns structured commitments with owners and deadlines
    """
    try:
        prompt = f"""Extract all commitments, action items, and tasks from this text:

{text}

For each commitment, identify:
1. What needs to be done (action)
2. Who is responsible (owner)
3. When it's due (deadline)
4. Priority level

Return as JSON array:
[
  {{
    "action": "Complete project proposal",
    "owner": "John" or null,
    "deadline": "2024-12-01" or null,
    "priority": "high",
    "context": "Brief additional context"
  }}
]

Only extract clear, actionable commitments. Skip vague statements.
"""
        
        response = anthropic_client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}]
        )
        
        content = response.content[0].text
        
        # Extract JSON
        json_match = re.search(r'\[[\s\S]*\]', content)
        if json_match:
            commitments = json.loads(json_match.group())
            return {"commitments": commitments, "count": len(commitments)}
        
        return {"commitments": [], "count": 0}
        
    except Exception as e:
        logger.error(f"❌ Extract commitments error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# Startup
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
