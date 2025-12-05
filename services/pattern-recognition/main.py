"""
Pattern Recognition Service - AI Chief of Staff
Detects behavioral patterns, productivity insights, and anomalies
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
from db_config import get_ai_model, get_ai_provider, get_api_key

import anthropic
import redis
import logging
import hashlib
import json
from collections import Counter, defaultdict
import statistics
import asyncpg

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - [%(funcName)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Pattern Recognition Service",
    description="Behavioral pattern detection and productivity insights",
    version="1.1.0"
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
redis_client = None
db_pool = None

try:
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379")
    redis_client = redis.from_url(redis_url, decode_responses=True)
    redis_client.ping()
    logger.info(f"✓ Connected to Redis at {redis_url}")
except Exception as e:
    logger.warning(f"Redis not available: {e}. Running without cache.")

# Initialize database connection pool
async def init_db():
    global db_pool
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        logger.warning("⚠️  DATABASE_URL not set - pattern analysis will fall back to backend")
        return
    
    try:
        # Parse DATABASE_URL to check host
        from urllib.parse import urlparse
        parsed = urlparse(database_url)
        logger.info(f"→ Attempting database connection to: {parsed.hostname}:{parsed.port or 5432}")
        
        db_pool = await asyncpg.create_pool(
            database_url, 
            min_size=1, 
            max_size=10,
            timeout=5.0,  # 5 second timeout
            command_timeout=10.0
        )
        logger.info(f"✓ Connected to PostgreSQL database")
    except Exception as e:
        logger.warning(f"⚠️  Database connection failed: {str(e)}")
        logger.warning("Pattern analysis will fall back to backend local implementation")
        db_pool = None

@app.on_event("startup")
async def startup():
    await init_db()

# ============================================================================
# Models
# ============================================================================

class CompletionEvent(BaseModel):
    task_id: int
    description: str
    completed_at: str
    estimated_hours: Optional[float] = None
    energy_level: Optional[str] = None

class TaskEvent(BaseModel):
    task_id: int
    description: str
    created_at: str
    deadline: Optional[str] = None
    priority: Optional[str] = None

class WorkingHoursData(BaseModel):
    events: List[CompletionEvent]
    timezone: str = "UTC"

class ProductivityPattern(BaseModel):
    pattern_type: str
    description: str
    confidence: float
    data: Dict[str, Any]
    recommendations: List[str]

class FocusTimeAnalysis(BaseModel):
    optimal_hours: List[int]  # Hours of day (0-23)
    focus_score_by_hour: Dict[int, float]
    deep_work_windows: List[Dict[str, str]]
    recommendations: List[str]

class AnomalyDetection(BaseModel):
    anomalies: List[Dict[str, Any]]
    severity: str  # low, medium, high
    recommendations: List[str]

class StreakAnalysis(BaseModel):
    current_streak: int
    longest_streak: int
    streak_type: str  # daily, weekly
    at_risk: bool
    motivation_message: str

# ============================================================================
# Helper Functions
# ============================================================================

def get_cache_key(prefix: str, data: Any) -> str:
    """Generate cache key from data"""
    data_str = json.dumps(data, sort_keys=True, default=str)
    hash_obj = hashlib.md5(data_str.encode())
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

def analyze_working_hours(events: List[CompletionEvent]) -> Dict[str, Any]:
    """Analyze working hours patterns"""
    hour_counts = Counter()
    hour_completions = defaultdict(list)
    
    for event in events:
        try:
            dt = datetime.fromisoformat(event.completed_at.replace('Z', '+00:00'))
            hour = dt.hour
            hour_counts[hour] += 1
            hour_completions[hour].append(event)
        except Exception as e:
            logger.warning(f"Failed to parse datetime: {e}")
            continue
    
    # Find peak hours
    if hour_counts:
        most_common = hour_counts.most_common(3)
        peak_hours = [h for h, _ in most_common]
        
        # Calculate productivity score by hour
        productivity_by_hour = {}
        for hour, tasks in hour_completions.items():
            # Simple score: number of tasks * avg estimated hours
            count = len(tasks)
            avg_hours = statistics.mean([t.estimated_hours for t in tasks if t.estimated_hours]) if any(t.estimated_hours for t in tasks) else 1.0
            productivity_by_hour[hour] = count * avg_hours
        
        return {
            "peak_hours": peak_hours,
            "hour_distribution": dict(hour_counts),
            "productivity_by_hour": productivity_by_hour,
            "total_events": len(events)
        }
    
    return {"peak_hours": [], "hour_distribution": {}, "productivity_by_hour": {}, "total_events": 0}

def detect_energy_patterns(events: List[CompletionEvent]) -> Dict[str, Any]:
    """Detect when user completes different energy level tasks"""
    energy_by_hour = defaultdict(lambda: defaultdict(int))
    
    for event in events:
        if not event.energy_level:
            continue
        try:
            dt = datetime.fromisoformat(event.completed_at.replace('Z', '+00:00'))
            hour = dt.hour
            energy_by_hour[hour][event.energy_level] += 1
        except Exception as e:
            continue
    
    # Find best hours for each energy type
    best_hours = {}
    for energy_type in ["deep_work", "focused", "administrative"]:
        hours_with_count = []
        for hour, energy_counts in energy_by_hour.items():
            count = energy_counts.get(energy_type, 0)
            if count > 0:
                hours_with_count.append((hour, count))
        
        if hours_with_count:
            hours_with_count.sort(key=lambda x: x[1], reverse=True)
            best_hours[energy_type] = [h for h, _ in hours_with_count[:3]]
    
    return best_hours

# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/")
async def root():
    return {
        "service": "Pattern Recognition Service",
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
        "service": "pattern-recognition",
        "version": "1.0.0",
        "redis": redis_status,
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/analyze-patterns")
async def analyze_patterns(request: dict):
    """
    Analyze task patterns from database
    Queries commitments table and generates insights using AI
    """
    try:
        time_range = request.get("time_range", "30d")
        logger.info(f"Analyzing patterns for time range: {time_range}")
        
        if not db_pool:
            raise HTTPException(status_code=503, detail="Database not available")
        
        # Parse time range
        days_match = time_range.rstrip('d')
        days = int(days_match) if days_match.isdigit() else 30
        start_date = datetime.utcnow() - timedelta(days=days)
        
        async with db_pool.acquire() as conn:
            # Get all tasks
            all_tasks = await conn.fetch(
                "SELECT * FROM commitments WHERE created_date >= $1 ORDER BY created_date DESC",
                start_date
            )
            
            # Get completed tasks - include ALL completed tasks for pattern analysis
            # Don't filter by date - we want historical completion patterns even outside time window
            completed_tasks = await conn.fetch(
                "SELECT * FROM commitments WHERE status = $1 ORDER BY completed_date DESC",
                'completed'
            )
            
            # Get pending tasks within time range
            pending_tasks = await conn.fetch(
                "SELECT * FROM commitments WHERE status = $1 AND created_date >= $2 ORDER BY created_date DESC",
                'pending', start_date
            )
            
            # Get overdue tasks
            # Note: deadline column is TEXT (ISO string), not TIMESTAMP
            now = datetime.utcnow().isoformat()
            overdue_tasks = await conn.fetch(
                "SELECT * FROM commitments WHERE status != $1 AND deadline < $2 AND deadline IS NOT NULL",
                'completed', now
            )
        
        logger.info(f"Found {len(all_tasks)} total, {len(completed_tasks)} completed, {len(pending_tasks)} pending, {len(overdue_tasks)} overdue")
        
        if len(completed_tasks) == 0:
            return {
                "error": "Pattern analysis requires task completion history",
                "note": "Complete some tasks to see pattern analysis",
                "stats": {
                    "total_tasks": len(all_tasks),
                    "completed": 0,
                    "pending": len(pending_tasks),
                    "overdue": len(overdue_tasks),
                    "completion_rate": 0
                }
            }
        
        # Calculate stats
        completion_rate = round((len(completed_tasks) / len(all_tasks) * 100), 1) if len(all_tasks) > 0 else 0
        
        # Calculate average completion time
        completion_times = []
        for task in completed_tasks:
            if task['completed_date'] and task['created_date']:
                completed = datetime.fromisoformat(str(task['completed_date']).replace('Z', '+00:00'))
                created = datetime.fromisoformat(str(task['created_date']).replace('Z', '+00:00'))
                days_to_complete = (completed - created).days
                if days_to_complete >= 0:
                    completion_times.append(days_to_complete)
        
        avg_completion_days = round(sum(completion_times) / len(completion_times), 1) if completion_times else 0
        
        # Find most productive day
        tasks_by_day = Counter()
        for task in completed_tasks:
            if task['completed_date']:
                day = datetime.fromisoformat(str(task['completed_date']).replace('Z', '+00:00')).strftime('%A')
                tasks_by_day[day] += 1
        
        most_productive_day = tasks_by_day.most_common(1)[0][0] if tasks_by_day else "N/A"
        
        # Generate AI insights
        prompt = f"""Analyze this task completion data and provide actionable productivity insights.

Task Overview:
- Tasks created in last {days} days: {len(all_tasks)}
- Total completed tasks (all time): {len(completed_tasks)}
- Pending tasks: {len(pending_tasks)}
- Overdue tasks: {len(overdue_tasks)}
- Completion rate: {completion_rate}%
- Average time to complete: {avg_completion_days} days
- Most productive day: {most_productive_day}

Recent Completed Tasks:
{chr(10).join([f"- {task['description'][:100]}" for task in list(completed_tasks)[:10]])}

Recent Pending Tasks:
{chr(10).join([f"- {task['description'][:100]} (deadline: {task['deadline'] or 'none'})" for task in list(pending_tasks)[:10]])}

{"Overdue Tasks:" + chr(10) + chr(10).join([f"- {task['description'][:100]}" for task in list(overdue_tasks)[:5]]) if overdue_tasks else ""}

Provide:
1. **Working Patterns**: What patterns emerge from completion data?
2. **Productivity Trends**: Is performance improving or declining?
3. **Time Management**: Are deadlines being met?
4. **Recommendations**: 3-5 specific actionable suggestions

Format as markdown with clear sections."""

        # Get model and API key from database configuration
        model = get_ai_model(provider="anthropic")
        api_key = get_api_key(provider="anthropic")
        
        if not api_key:
            # Fallback to environment variable
            api_key = os.getenv("ANTHROPIC_API_KEY")
            if not api_key:
                raise ValueError("No Anthropic API key available in database or environment")
        
        # Create client with database API key
        client = anthropic.Anthropic(api_key=api_key)
        
        response = client.messages.create(
            model=model,
            max_tokens=1024,  # Reduced for faster responses
            temperature=0.7,  # Slightly creative but focused
            messages=[{"role": "user", "content": prompt}]
        )
        
        insights = response.content[0].text
        
        return {
            "success": True,
            "time_range": f"{days}d",
            "stats": {
                "total_tasks": len(all_tasks),
                "completed": len(completed_tasks),
                "pending": len(pending_tasks),
                "overdue": len(overdue_tasks),
                "completion_rate": completion_rate,
                "avg_completion_days": avg_completion_days,
                "most_productive_day": most_productive_day,
                "tasks_by_day": dict(tasks_by_day)
            },
            "insights": insights,
            "analysis_date": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"❌ Pattern analysis error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/detect-patterns", response_model=List[ProductivityPattern])
async def detect_patterns(data: WorkingHoursData):
    """
    Detect productivity patterns from completion events
    
    Returns patterns like:
    - Peak working hours
    - Task completion velocity
    - Energy level preferences
    - Productivity trends
    """
    try:
        # Check cache
        cache_key = get_cache_key("patterns", data.dict())
        cached = cache_get(cache_key)
        if cached:
            return cached
        
        patterns = []
        
        # Pattern 1: Working hours analysis
        hours_analysis = analyze_working_hours(data.events)
        if hours_analysis["peak_hours"]:
            peak_hours_str = ", ".join([f"{h}:00" for h in hours_analysis["peak_hours"]])
            patterns.append({
                "pattern_type": "peak_working_hours",
                "description": f"You're most productive during {peak_hours_str}",
                "confidence": 0.85,
                "data": hours_analysis,
                "recommendations": [
                    f"Schedule deep work tasks during {hours_analysis['peak_hours'][0]}:00-{hours_analysis['peak_hours'][0]+2}:00",
                    "Block these hours for focused work",
                    "Avoid meetings during peak productivity times"
                ]
            })
        
        # Pattern 2: Energy patterns
        energy_patterns = detect_energy_patterns(data.events)
        if energy_patterns:
            for energy_type, best_hours in energy_patterns.items():
                if best_hours:
                    patterns.append({
                        "pattern_type": f"{energy_type}_pattern",
                        "description": f"You typically complete {energy_type.replace('_', ' ')} tasks around {best_hours[0]}:00",
                        "confidence": 0.75,
                        "data": {"best_hours": best_hours, "energy_type": energy_type},
                        "recommendations": [
                            f"Schedule {energy_type.replace('_', ' ')} tasks during {best_hours[0]}:00-{best_hours[0]+2}:00",
                            f"Protect this time for {energy_type.replace('_', ' ')} activities"
                        ]
                    })
        
        # Pattern 3: Use AI to detect complex patterns
        if len(data.events) >= 10:
            try:
                # Prepare event summary for AI
                event_summary = []
                for event in data.events[:50]:  # Limit to recent 50
                    dt = datetime.fromisoformat(event.completed_at.replace('Z', '+00:00'))
                    event_summary.append({
                        "description": event.description[:100],
                        "completed_at": dt.strftime("%Y-%m-%d %H:%M"),
                        "hour": dt.hour,
                        "day": dt.strftime("%A"),
                        "energy": event.energy_level
                    })
                
                prompt = f"""Analyze these task completion patterns and identify any interesting behavioral patterns:

{json.dumps(event_summary, indent=2)}

Identify:
1. Work-life balance patterns
2. Task clustering behavior (do similar tasks get done together?)
3. Procrastination patterns (tasks completed just before deadline)
4. Any other notable productivity patterns

Return as JSON array with format:
[
  {{
    "pattern_type": "pattern_name",
    "description": "Brief description",
    "evidence": "What data shows this",
    "recommendation": "Actionable advice"
  }}
]
"""
                
                # Get model and API key from database configuration
                model = get_ai_model(provider="anthropic")
                api_key = get_api_key(provider="anthropic")
                
                if not api_key:
                    # Fallback to environment variable
                    api_key = os.getenv("ANTHROPIC_API_KEY")
                    if not api_key:
                        raise ValueError("No Anthropic API key available in database or environment")
                
                # Create client with database API key
                client = anthropic.Anthropic(api_key=api_key)
                
                response = client.messages.create(
                    model=model,
                    max_tokens=800,
                    temperature=0.5,
                    messages=[{"role": "user", "content": prompt}]
                )
                
                ai_content = response.content[0].text
                # Try to parse JSON from response
                import re
                json_match = re.search(r'\[[\s\S]*\]', ai_content)
                if json_match:
                    ai_patterns = json.loads(json_match.group())
                    for ap in ai_patterns[:3]:  # Limit to top 3
                        patterns.append({
                            "pattern_type": ap.get("pattern_type", "ai_detected"),
                            "description": ap.get("description", ""),
                            "confidence": 0.70,
                            "data": {"evidence": ap.get("evidence", "")},
                            "recommendations": [ap.get("recommendation", "")]
                        })
            except Exception as e:
                logger.warning(f"AI pattern detection failed: {e}")
        
        # Cache results
        cache_set(cache_key, patterns, ttl=1800)  # 30 min
        
        return patterns
        
    except Exception as e:
        logger.error(f"❌ Pattern detection error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze-focus-time", response_model=FocusTimeAnalysis)
async def analyze_focus_time(data: WorkingHoursData):
    """
    Analyze optimal focus time windows based on deep work completions
    """
    try:
        # Check cache
        cache_key = get_cache_key("focus", data.dict())
        cached = cache_get(cache_key)
        if cached:
            return cached
        
        # Filter deep work tasks
        deep_work_events = [e for e in data.events if e.energy_level in ["deep_work", "focused"]]
        
        if len(deep_work_events) < 5:
            # Not enough data, return defaults
            result = {
                "optimal_hours": [9, 10, 14],
                "focus_score_by_hour": {},
                "deep_work_windows": [
                    {"start": "09:00", "end": "11:00", "quality": "high"}
                ],
                "recommendations": [
                    "Start tracking deep work completions to get personalized insights",
                    "Try working on focused tasks in the morning",
                    "Block 2-hour windows for deep work"
                ]
            }
            return result
        
        # Calculate focus score by hour
        hour_scores = defaultdict(lambda: {"count": 0, "total_hours": 0.0})
        
        for event in deep_work_events:
            try:
                dt = datetime.fromisoformat(event.completed_at.replace('Z', '+00:00'))
                hour = dt.hour
                estimated = event.estimated_hours or 1.0
                hour_scores[hour]["count"] += 1
                hour_scores[hour]["total_hours"] += estimated
            except:
                continue
        
        # Normalize scores
        focus_score_by_hour = {}
        for hour, data in hour_scores.items():
            # Score = count * avg task complexity
            score = data["count"] * (data["total_hours"] / data["count"])
            focus_score_by_hour[hour] = round(score, 2)
        
        # Find optimal hours (top 5)
        sorted_hours = sorted(focus_score_by_hour.items(), key=lambda x: x[1], reverse=True)
        optimal_hours = [h for h, _ in sorted_hours[:5]]
        
        # Identify continuous windows
        optimal_hours_sorted = sorted(optimal_hours)
        windows = []
        current_window = []
        
        for hour in range(24):
            if hour in optimal_hours_sorted:
                current_window.append(hour)
            else:
                if len(current_window) >= 2:
                    windows.append({
                        "start": f"{current_window[0]:02d}:00",
                        "end": f"{current_window[-1]+1:02d}:00",
                        "quality": "high" if len(current_window) >= 3 else "medium"
                    })
                current_window = []
        
        if len(current_window) >= 2:
            windows.append({
                "start": f"{current_window[0]:02d}:00",
                "end": f"{current_window[-1]+1:02d}:00",
                "quality": "high" if len(current_window) >= 3 else "medium"
            })
        
        # Generate recommendations
        recommendations = []
        if optimal_hours:
            recommendations.append(f"Your peak focus time is around {optimal_hours[0]}:00")
            recommendations.append("Block calendar during these windows for deep work")
        if windows:
            recommendations.append(f"Schedule challenging tasks during {windows[0]['start']}-{windows[0]['end']}")
        recommendations.append("Avoid meetings and interruptions during deep work windows")
        
        result = {
            "optimal_hours": optimal_hours,
            "focus_score_by_hour": focus_score_by_hour,
            "deep_work_windows": windows,
            "recommendations": recommendations
        }
        
        # Cache results
        cache_set(cache_key, result, ttl=1800)
        
        return result
        
    except Exception as e:
        logger.error(f"❌ Focus time analysis error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/detect-anomalies", response_model=AnomalyDetection)
async def detect_anomalies(events: List[TaskEvent]):
    """
    Detect anomalies in task patterns that might indicate problems
    - Unusual spike in tasks
    - Long periods without completions
    - Tasks with very short/long deadlines
    """
    try:
        anomalies = []
        severity = "low"
        
        if len(events) < 10:
            return {
                "anomalies": [],
                "severity": "low",
                "recommendations": ["Continue using the system to establish baseline patterns"]
            }
        
        # Check for task creation spikes
        dates = defaultdict(int)
        for event in events:
            try:
                dt = datetime.fromisoformat(event.created_at.replace('Z', '+00:00'))
                date_key = dt.date().isoformat()
                dates[date_key] += 1
            except:
                continue
        
        if dates:
            avg_daily = statistics.mean(dates.values())
            std_dev = statistics.stdev(dates.values()) if len(dates) > 1 else 0
            
            for date, count in dates.items():
                if count > avg_daily + (2 * std_dev):
                    anomalies.append({
                        "type": "task_spike",
                        "date": date,
                        "count": count,
                        "description": f"Unusual spike: {count} tasks created on {date} (avg: {avg_daily:.1f})"
                    })
                    severity = "medium"
        
        # Check for very short deadlines (< 1 hour)
        urgent_tasks = [e for e in events if e.deadline and e.created_at]
        for task in urgent_tasks:
            try:
                created = datetime.fromisoformat(task.created_at.replace('Z', '+00:00'))
                deadline = datetime.fromisoformat(task.deadline.replace('Z', '+00:00'))
                hours_until_deadline = (deadline - created).total_seconds() / 3600
                
                if hours_until_deadline < 1 and hours_until_deadline > 0:
                    anomalies.append({
                        "type": "urgent_deadline",
                        "task_id": task.task_id,
                        "description": f"Task created with < 1 hour deadline: {task.description[:50]}"
                    })
                    severity = "high"
            except:
                continue
        
        # Generate recommendations
        recommendations = []
        if any(a["type"] == "task_spike" for a in anomalies):
            recommendations.append("Task spikes detected - consider if you're overcommitting")
            recommendations.append("Review if all tasks are truly necessary")
        if any(a["type"] == "urgent_deadline" for a in anomalies):
            recommendations.append("Multiple urgent deadlines detected - plan ahead to avoid last-minute work")
            recommendations.append("Consider adding buffer time to deadlines")
        if not anomalies:
            recommendations.append("No significant anomalies detected - task patterns look healthy")
        
        return {
            "anomalies": anomalies,
            "severity": severity,
            "recommendations": recommendations
        }
        
    except Exception as e:
        logger.error(f"❌ Anomaly detection error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze-streak", response_model=StreakAnalysis)
async def analyze_streak(events: List[CompletionEvent]):
    """
    Analyze completion streaks and provide motivation
    """
    try:
        if not events:
            return {
                "current_streak": 0,
                "longest_streak": 0,
                "streak_type": "daily",
                "at_risk": False,
                "motivation_message": "Start your streak by completing a task today!"
            }
        
        # Sort by completion date
        sorted_events = sorted(events, key=lambda e: e.completed_at)
        
        # Calculate daily streaks
        completion_dates = set()
        for event in sorted_events:
            try:
                dt = datetime.fromisoformat(event.completed_at.replace('Z', '+00:00'))
                completion_dates.add(dt.date())
            except:
                continue
        
        if not completion_dates:
            return {
                "current_streak": 0,
                "longest_streak": 0,
                "streak_type": "daily",
                "at_risk": False,
                "motivation_message": "Start tracking completions to build your streak!"
            }
        
        # Find current streak
        today = datetime.utcnow().date()
        current_streak = 0
        check_date = today
        
        while check_date in completion_dates:
            current_streak += 1
            check_date -= timedelta(days=1)
        
        # Check if at risk (didn't complete anything today)
        at_risk = today not in completion_dates and current_streak > 0
        
        # Find longest streak
        sorted_dates = sorted(completion_dates)
        longest_streak = 1
        temp_streak = 1
        
        for i in range(1, len(sorted_dates)):
            if (sorted_dates[i] - sorted_dates[i-1]).days == 1:
                temp_streak += 1
                longest_streak = max(longest_streak, temp_streak)
            else:
                temp_streak = 1
        
        # Generate motivation message
        if current_streak == 0:
            message = "No current streak. Complete a task today to start building momentum!"
        elif current_streak >= 7:
            message = f"🔥 Amazing! {current_streak}-day streak! You're on fire!"
        elif current_streak >= 3:
            message = f"Great work! {current_streak} days in a row. Keep it going!"
        else:
            message = f"{current_streak}-day streak. Can you make it to {current_streak + 1}?"
        
        if at_risk:
            message += " ⚠️ Complete a task today to keep your streak alive!"
        
        return {
            "current_streak": current_streak,
            "longest_streak": max(longest_streak, current_streak),
            "streak_type": "daily",
            "at_risk": at_risk,
            "motivation_message": message
        }
        
    except Exception as e:
        logger.error(f"❌ Streak analysis error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# Startup
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
