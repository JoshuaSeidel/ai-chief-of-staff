"""
AI Intelligence Service - FastAPI Microservice
Handles task effort estimation, energy classification, and clustering
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import anthropic
import redis
import json
import os
import hashlib
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="AI Intelligence Service",
    version="1.0.0",
    description="Task analysis and intelligence using Claude AI"
)

# CORS for internal Docker network
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize clients
try:
    anthropic_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    redis_client = redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379"))
    logger.info("✓ Initialized Anthropic and Redis clients")
except Exception as e:
    logger.error(f"Failed to initialize clients: {e}")
    anthropic_client = None
    redis_client = None

# Pydantic Models
class EffortEstimationRequest(BaseModel):
    description: str
    context: Optional[str] = ""

class EffortEstimationResponse(BaseModel):
    estimated_hours: float
    confidence: float
    reasoning: str
    breakdown: List[str]

class EnergyClassificationRequest(BaseModel):
    description: str

class EnergyClassificationResponse(BaseModel):
    energy_level: str
    confidence: float
    description: str

class Task(BaseModel):
    id: int
    description: str
    deadline: Optional[str] = None

class TaskClusteringRequest(BaseModel):
    tasks: List[Task]

class Cluster(BaseModel):
    name: str
    description: str
    task_indices: List[int]
    keywords: List[str]

class TaskClusteringResponse(BaseModel):
    clusters: List[Cluster]

# Helper Functions
def get_cache_key(prefix: str, data: str) -> str:
    """Generate cache key from data hash"""
    return f"{prefix}:{hashlib.md5(data.encode()).hexdigest()}"

def cache_get(key: str) -> Optional[dict]:
    """Get from cache if available"""
    if not redis_client:
        return None
    try:
        cached = redis_client.get(key)
        if cached:
            logger.info(f"Cache hit: {key}")
            return json.loads(cached)
    except Exception as e:
        logger.warning(f"Cache get failed: {e}")
    return None

def cache_set(key: str, value: dict, ttl: int = 3600):
    """Set cache with TTL"""
    if not redis_client:
        return
    try:
        redis_client.setex(key, ttl, json.dumps(value))
        logger.info(f"Cached: {key} for {ttl}s")
    except Exception as e:
        logger.warning(f"Cache set failed: {e}")

# API Endpoints
@app.post("/estimate-effort", response_model=EffortEstimationResponse)
async def estimate_effort(request: EffortEstimationRequest):
    """
    Estimate task effort using Claude API
    Returns estimated hours, confidence, reasoning, and breakdown
    """
    logger.info(f"Estimating effort for: {request.description[:50]}...")
    
    # Check cache
    cache_key = get_cache_key("effort", request.description + request.context)
    cached = cache_get(cache_key)
    if cached:
        return cached
    
    if not anthropic_client:
        raise HTTPException(status_code=503, detail="Anthropic API not available")
    
    # Build prompt
    prompt = f"""You are a productivity expert helping estimate task duration.

Task: {request.description}
{f"Context: {request.context}" if request.context else ""}

Please analyze this task and provide:
1. Estimated hours to complete (be realistic)
2. Confidence level (0-1 scale)
3. Brief reasoning
4. Optional breakdown into subtasks

Consider:
- Task complexity
- Typical time for similar work
- Dependencies or research needed
- Review/iteration time

Respond in JSON format:
{{
  "estimated_hours": 2.5,
  "confidence": 0.85,
  "reasoning": "Brief explanation",
  "breakdown": ["Subtask 1: 1hr", "Subtask 2: 1hr", "Review: 0.5hr"]
}}"""

    try:
        message = anthropic_client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=500,
            temperature=0.3,
            messages=[{"role": "user", "content": prompt}]
        )
        
        result = json.loads(message.content[0].text)
        
        # Validate result
        if not all(k in result for k in ["estimated_hours", "confidence", "reasoning", "breakdown"]):
            raise ValueError("Invalid response format")
        
        # Cache result
        cache_set(cache_key, result)
        
        logger.info(f"✓ Estimated {result['estimated_hours']}hrs with {result['confidence']} confidence")
        return result
        
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI response: {e}")
        # Return safe defaults
        return {
            "estimated_hours": 0.5,
            "confidence": 0.3,
            "reasoning": "Unable to parse AI response",
            "breakdown": []
        }
    except Exception as e:
        logger.error(f"Effort estimation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/classify-energy", response_model=EnergyClassificationResponse)
async def classify_energy(request: EnergyClassificationRequest):
    """
    Classify task by required energy level
    Returns: deep_work, focused, administrative, collaborative, or creative
    """
    logger.info(f"Classifying energy for: {request.description[:50]}...")
    
    # Check cache
    cache_key = get_cache_key("energy", request.description)
    cached = cache_get(cache_key)
    if cached:
        return cached
    
    if not anthropic_client:
        raise HTTPException(status_code=503, detail="Anthropic API not available")
    
    prompt = f"""Classify this task by the energy level it requires:

Task: {request.description}

Energy Levels:
- deep_work: High cognitive load, requires focus and minimal interruptions (strategic planning, complex problem-solving, writing important documents)
- focused: Medium concentration required (code review, analysis, research)
- administrative: Low cognitive load, routine work (email, scheduling, data entry, simple updates)
- collaborative: Social energy, meetings, discussions (requires presence but not deep thinking)
- creative: Creative/divergent thinking (brainstorming, design, ideation)

Respond in JSON format:
{{"energy_level": "deep_work", "confidence": 0.9}}"""

    try:
        message = anthropic_client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=50,
            temperature=0.2,
            messages=[{"role": "user", "content": prompt}]
        )
        
        result = json.loads(message.content[0].text)
        
        # Add description
        descriptions = {
            "deep_work": "High cognitive load, requires focus",
            "focused": "Medium concentration required",
            "administrative": "Low cognitive load, routine work",
            "collaborative": "Social energy, meetings",
            "creative": "Creative/divergent thinking"
        }
        
        result["description"] = descriptions.get(result["energy_level"], "Unknown")
        
        # Cache result
        cache_set(cache_key, result)
        
        logger.info(f"✓ Classified as {result['energy_level']}")
        return result
        
    except Exception as e:
        logger.error(f"Energy classification failed: {e}")
        # Return safe default
        return {
            "energy_level": "administrative",
            "confidence": 0.3,
            "description": "Low cognitive load, routine work"
        }

@app.post("/cluster-tasks", response_model=TaskClusteringResponse)
async def cluster_tasks(request: TaskClusteringRequest):
    """
    Group related tasks into semantic clusters
    Returns clusters with names, descriptions, and task indices
    """
    logger.info(f"Clustering {len(request.tasks)} tasks...")
    
    if not request.tasks:
        return {"clusters": []}
    
    if not anthropic_client:
        raise HTTPException(status_code=503, detail="Anthropic API not available")
    
    task_list = "\n".join([
        f"{i+1}. {task.description} (deadline: {task.deadline or 'none'})"
        for i, task in enumerate(request.tasks)
    ])
    
    prompt = f"""Analyze these tasks and group related ones into clusters/themes:

{task_list}

Identify common themes, projects, or related work. Create meaningful clusters.

Respond in JSON format:
{{
  "clusters": [
    {{
      "name": "Cluster Name",
      "description": "Brief description",
      "task_indices": [1, 3, 5],
      "keywords": ["keyword1", "keyword2"]
    }}
  ]
}}"""

    try:
        message = anthropic_client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1000,
            temperature=0.4,
            messages=[{"role": "user", "content": prompt}]
        )
        
        result = json.loads(message.content[0].text)
        
        logger.info(f"✓ Created {len(result['clusters'])} clusters")
        return result
        
    except Exception as e:
        logger.error(f"Task clustering failed: {e}")
        return {"clusters": []}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    status = {
        "status": "healthy",
        "service": "ai-intelligence",
        "anthropic": anthropic_client is not None,
        "redis": redis_client is not None
    }
    
    # Test Redis
    if redis_client:
        try:
            redis_client.ping()
            status["redis_connected"] = True
        except:
            status["redis_connected"] = False
    
    return status

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "AI Intelligence Service",
        "version": "1.0.0",
        "endpoints": [
            "/estimate-effort",
            "/classify-energy",
            "/cluster-tasks",
            "/health"
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8001,
        log_level="info"
    )
