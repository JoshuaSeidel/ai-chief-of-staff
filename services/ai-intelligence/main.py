"""
AI Intelligence Service - FastAPI Microservice
Handles task effort estimation, energy classification, and clustering
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import redis
import json
import os
import hashlib
import logging
import sys
from datetime import datetime

# Add shared directory to path
sys.path.insert(0, '/app/shared')

try:
    from ai_providers import get_ai_client, get_best_available_provider
    from db_config import get_ai_model, get_ai_provider, get_api_key, get_ollama_config, get_bedrock_config
    USE_SHARED_LIBS = True
    logger = logging.getLogger(__name__)
    logger.info("✓ Using shared AI provider abstraction")
except ImportError:
    # Fallback to direct import if shared libs not available
    import anthropic
    USE_SHARED_LIBS = False
    logger = logging.getLogger(__name__)
    logger.warning("⚠ Shared libs not available, using direct Anthropic import")

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - [%(funcName)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

app = FastAPI(
    title="AI Intelligence Service",
    description="Task effort estimation, energy classification, and clustering",
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
    if USE_SHARED_LIBS:
        logger.info("Attempting to use shared AI provider abstraction...")
        # Use config-driven AI provider selection from database
        provider = get_ai_provider()
        model = get_ai_model(provider=provider)
        
        try:
            # Get configuration from database (with environment variable fallback)
            api_key = get_api_key(provider)
            if not api_key and provider == "anthropic":
                api_key = os.getenv("ANTHROPIC_API_KEY")
                if api_key:
                    logger.info("Using ANTHROPIC_API_KEY from environment (fallback)")
            elif not api_key and provider == "openai":
                api_key = os.getenv("OPENAI_API_KEY")
                if api_key:
                    logger.info("Using OPENAI_API_KEY from environment (fallback)")
            
            # Build provider-specific kwargs
            kwargs = {"api_key": api_key} if api_key else {}
            
            # Add provider-specific configuration
            if provider == "ollama":
                ollama_config = get_ollama_config()
                kwargs["base_url"] = ollama_config["base_url"]
                logger.info(f"Using Ollama at {ollama_config['base_url']}")
            elif provider == "bedrock":
                bedrock_config = get_bedrock_config()
                if bedrock_config["access_key_id"]:
                    kwargs["access_key_id"] = bedrock_config["access_key_id"]
                    kwargs["secret_access_key"] = bedrock_config["secret_access_key"]
                    kwargs["region"] = bedrock_config["region"]
                    logger.info(f"Using AWS Bedrock in {bedrock_config['region']}")
            
            ai_client = get_ai_client(
                provider=provider,
                model=model,
                **kwargs
            )
            logger.info(f"✓ Using AI provider: {provider} with model {model}")
            logger.info(f"AI client type: {type(ai_client)}")
        except Exception as e:
            logger.warning(f"Failed to use configured provider, trying fallback: {e}")
            ai_client = get_best_available_provider()
            logger.info(f"AI client type after fallback: {type(ai_client)}")
    else:
        logger.info("Using direct Anthropic client (shared libs not available)")
        # Legacy fallback to direct Anthropic
        import anthropic
        ai_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        logger.info(f"✓ Using legacy Anthropic client - type: {type(ai_client)}")
        logger.info(f"AI client has messages: {hasattr(ai_client, 'messages')}")
    
    redis_client = redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379"))
    logger.info("✓ Initialized AI and Redis clients")
except Exception as e:
    logger.error(f"❌ Failed to initialize clients: {e}", exc_info=True)
    ai_client = None
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
    
    if not ai_client:
        raise HTTPException(status_code=503, detail="AI service unavailable")
    
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
        if USE_SHARED_LIBS:
            result = ai_client.complete_json(
                prompt=prompt,
                max_tokens=300,
                temperature=0.3
            )
        else:
            # Get model from database configuration
            model = get_ai_model(provider="anthropic")
            message = ai_client.messages.create(
                model=model,
                max_tokens=300,
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
        logger.error(f"⚠ Failed to parse AI response: {e}", exc_info=True)
        # Return safe defaults
        return {
            "estimated_hours": 0.5,
            "confidence": 0.3,
            "reasoning": "Unable to parse AI response",
            "breakdown": []
        }
    except Exception as e:
        logger.error(f"❌ Effort estimation failed: {e}", exc_info=True)
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
    
    if not ai_client:
        raise HTTPException(status_code=503, detail="AI service not available")
    
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
        if USE_SHARED_LIBS:
            result = ai_client.complete_json(
                prompt=prompt,
                max_tokens=50,
                temperature=0.2
            )
        else:
            # Get model from database configuration
            model = get_ai_model(provider="anthropic")
            message = ai_client.messages.create(
                model=model,
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
        logger.error(f"❌ Energy classification failed: {e}", exc_info=True)
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
    
    if not ai_client:
        raise HTTPException(status_code=503, detail="AI service not available")
    
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
        logger.info(f"Client type: {type(ai_client)}, USE_SHARED_LIBS: {USE_SHARED_LIBS}")
        
        if USE_SHARED_LIBS:
            # Using shared AI provider abstraction
            logger.info("Using shared AI provider for clustering")
            result = ai_client.complete_json(
                prompt=prompt,
                max_tokens=1000,
                temperature=0.4
            )
        else:
            # Using direct Anthropic client
            logger.info("Using direct Anthropic client for clustering")
            import anthropic
            
            # Get model from database configuration
            model = get_ai_model(provider="anthropic")
            
            # Use Anthropic client
            anthropic_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
            message = anthropic_client.messages.create(
                model=model,
                max_tokens=1024,
                temperature=0.4,
                messages=[{"role": "user", "content": prompt}]
            )
            
            # Extract JSON from response (Claude may wrap it in text)
            response_text = message.content[0].text.strip()
            logger.info(f"Raw response preview: {response_text[:200]}...")
            
            # Try to extract JSON from markdown code blocks or plain text
            import re
            json_match = re.search(r'```(?:json)?\s*(\{[\s\S]*?\})\s*```', response_text)
            if json_match:
                response_text = json_match.group(1)
            else:
                # Look for first { to last }
                json_match = re.search(r'\{[\s\S]*\}', response_text)
                if json_match:
                    response_text = json_match.group(0)
            
            result = json.loads(response_text)
        
        logger.info(f"✓ Created {len(result['clusters'])} clusters")
        return result
        
    except json.JSONDecodeError as e:
        logger.error(f"❌ JSON parsing failed: {e}")
        logger.error(f"Response text: {response_text[:500] if 'response_text' in locals() else 'N/A'}")
        return {"clusters": []}
    except Exception as e:
        logger.error(f"❌ Task clustering failed: {e}", exc_info=True)
        return {"clusters": []}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    status = {
        "status": "healthy",
        "service": "ai-intelligence",
        "version": "1.5.0",
        "ai_provider": ai_client is not None,
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
        "version": "1.5.0",
        "endpoints": [
            "/estimate-effort",
            "/classify-energy",
            "/cluster-tasks",
            "/health"
        ]
    }

@app.get("/version")
async def version():
    """Version endpoint"""
    return {
        "service": "ai-intelligence",
        "version": "1.5.0",
        "status": "operational"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8001,
        log_level="info"
    )
