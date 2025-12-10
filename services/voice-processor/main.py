"""
Voice Processor Service
Handles audio transcription using OpenAI Whisper API or local faster-whisper
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import openai
import os
import sys
import logging
import tempfile
from typing import Optional
from datetime import datetime
import redis
import hashlib
import json
from storage_manager import get_storage_manager

# Import faster-whisper for local transcription (Ollama mode)
try:
    from faster_whisper import WhisperModel
    FASTER_WHISPER_AVAILABLE = True
except ImportError:
    FASTER_WHISPER_AVAILABLE = False
    WhisperModel = None

# Add shared modules to path
sys.path.insert(0, '/app/shared')
from db_config import get_ai_model, get_ai_provider, get_api_key

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Voice Processor Service",
    description="Audio transcription using OpenAI Whisper API",
    version="1.1.2"
)

# Request logging middleware
@app.middleware("http")
async def log_requests(request, call_next):
    start_time = datetime.now()
    logger.info(f"→ {request.method} {request.url.path}")
    
    response = await call_next(request)
    
    duration = (datetime.now() - start_time).total_seconds()
    logger.info(f"← {request.method} {request.url.path} [{response.status_code}] {duration:.3f}s")
    
    return response

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Get AI configuration from database
try:
    ai_provider = get_ai_provider()
    ai_model = get_ai_model(provider=ai_provider)
    logger.info(f"Using AI provider: {ai_provider}, model: {ai_model}")
except Exception as e:
    logger.warning(f"Failed to load AI config from database: {e}. Using defaults.")
    ai_provider = "openai"
    ai_model = "whisper-1"

# Get OpenAI API key from database (with environment variable fallback)
openai_api_key = None
if ai_provider == "openai":
    openai_api_key = get_api_key("openai")
    if not openai_api_key:
        openai_api_key = os.getenv("OPENAI_API_KEY")
        if openai_api_key:
            logger.info("Using OPENAI_API_KEY from environment (fallback)")
        else:
            logger.warning("OPENAI_API_KEY not configured in database or environment")
    
    if openai_api_key:
        openai.api_key = openai_api_key

# Initialize Redis client
redis_url = os.getenv("REDIS_URL", "redis://redis:6379")
try:
    redis_client = redis.from_url(redis_url, decode_responses=True)
    redis_client.ping()
    logger.info(f"Connected to Redis at {redis_url}")
except Exception as e:
    logger.warning(f"Could not connect to Redis: {e}")
    redis_client = None

# Initialize storage manager
try:
    storage_manager = get_storage_manager()
    logger.info(f"Storage manager initialized: {storage_manager.storage_type}")
except Exception as e:
    logger.error(f"❌ Failed to initialize storage manager: {e}", exc_info=True)
    storage_manager = None

# Initialize local Whisper model for Ollama/local transcription
local_whisper_model = None
LOCAL_WHISPER_MODEL_SIZE = os.getenv("LOCAL_WHISPER_MODEL", "base")  # tiny, base, small, medium, large-v3

def get_local_whisper_model():
    """Lazy-load the local Whisper model"""
    global local_whisper_model
    if local_whisper_model is None and FASTER_WHISPER_AVAILABLE:
        try:
            # Use GPU if available, otherwise CPU
            device = "cuda" if os.path.exists("/dev/nvidia0") else "cpu"
            compute_type = "float16" if device == "cuda" else "int8"

            logger.info(f"Loading local Whisper model: {LOCAL_WHISPER_MODEL_SIZE} on {device}")
            local_whisper_model = WhisperModel(
                LOCAL_WHISPER_MODEL_SIZE,
                device=device,
                compute_type=compute_type
            )
            logger.info(f"✅ Local Whisper model loaded successfully")
        except Exception as e:
            logger.error(f"❌ Failed to load local Whisper model: {e}")
            raise
    return local_whisper_model

def transcribe_with_local_whisper(audio_path: str, language: Optional[str] = None,
                                   temperature: float = 0.0) -> dict:
    """Transcribe audio using local faster-whisper model"""
    model = get_local_whisper_model()
    if model is None:
        raise RuntimeError("Local Whisper model not available. Install faster-whisper.")

    # Transcribe
    segments, info = model.transcribe(
        audio_path,
        language=language,
        temperature=temperature,
        beam_size=5,
        vad_filter=True,  # Filter out silence
        vad_parameters=dict(min_silence_duration_ms=500)
    )

    # Collect all segments
    text_parts = []
    for segment in segments:
        text_parts.append(segment.text)

    full_text = " ".join(text_parts).strip()

    return {
        "text": full_text,
        "language": info.language,
        "duration": info.duration,
        "language_probability": info.language_probability
    }

def transcribe_with_timestamps_local(audio_path: str, language: Optional[str] = None) -> dict:
    """Transcribe audio with word-level timestamps using local faster-whisper"""
    model = get_local_whisper_model()
    if model is None:
        raise RuntimeError("Local Whisper model not available. Install faster-whisper.")

    segments, info = model.transcribe(
        audio_path,
        language=language,
        word_timestamps=True,
        beam_size=5,
        vad_filter=True
    )

    text_parts = []
    words = []

    for segment in segments:
        text_parts.append(segment.text)
        if segment.words:
            for word in segment.words:
                words.append({
                    "word": word.word,
                    "start": word.start,
                    "end": word.end,
                    "probability": word.probability
                })

    return {
        "text": " ".join(text_parts).strip(),
        "language": info.language,
        "duration": info.duration,
        "words": words
    }

# Cache TTL (1 hour for transcriptions)
CACHE_TTL = 3600

class TranscriptionRequest(BaseModel):
    language: Optional[str] = None
    prompt: Optional[str] = None
    temperature: Optional[float] = 0.0
    
class TranscriptionResponse(BaseModel):
    text: str
    language: Optional[str] = None
    duration: Optional[float] = None
    cached: bool = False

class SpeakerDiarizationResponse(BaseModel):
    segments: list
    speakers: list
    full_text: str

def get_file_hash(file_content: bytes) -> str:
    """Generate hash of file content for caching"""
    return hashlib.md5(file_content).hexdigest()

def get_cached_transcription(cache_key: str) -> Optional[dict]:
    """Get cached transcription result"""
    if not redis_client:
        return None
    
    try:
        cached = redis_client.get(cache_key)
        if cached:
            logger.info(f"Cache hit for key: {cache_key}")
            return json.loads(cached)
    except Exception as e:
        logger.error(f"Error reading from cache: {e}")
    
    return None

def cache_transcription(cache_key: str, result: dict):
    """Cache transcription result"""
    if not redis_client:
        return
    
    try:
        redis_client.setex(
            cache_key,
            CACHE_TTL,
            json.dumps(result)
        )
        logger.info(f"Cached result for key: {cache_key}")
    except Exception as e:
        logger.error(f"Error writing to cache: {e}")

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "voice-processor",
        "version": "1.6.0",
        "status": "running",
        "provider": ai_provider,
        "local_transcription": FASTER_WHISPER_AVAILABLE
    }

@app.get("/version")
async def version():
    """Version endpoint"""
    return {
        "service": "voice-processor",
        "version": "1.6.0",
        "status": "operational",
        "features": {
            "openai_whisper": bool(openai_api_key),
            "local_whisper": FASTER_WHISPER_AVAILABLE,
            "local_model": LOCAL_WHISPER_MODEL_SIZE if FASTER_WHISPER_AVAILABLE else None
        }
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    health = {
        "status": "healthy",
        "service": "voice-processor",
        "version": "1.6.0",
        "ai_provider": ai_provider,
        "openai_configured": bool(openai_api_key),
        "local_whisper_available": FASTER_WHISPER_AVAILABLE,
        "local_whisper_model": LOCAL_WHISPER_MODEL_SIZE if FASTER_WHISPER_AVAILABLE else None,
        "redis_connected": False
    }

    # Check Redis connection
    if redis_client:
        try:
            redis_client.ping()
            health["redis_connected"] = True
        except Exception as e:
            logger.warning(f"Redis health check failed: {e}")
            health["status"] = "degraded"

    # Check if transcription is available
    if ai_provider == "ollama" and not FASTER_WHISPER_AVAILABLE:
        health["status"] = "degraded"
        health["warning"] = "Ollama selected but faster-whisper not available"
    elif ai_provider == "openai" and not openai_api_key:
        health["status"] = "degraded"
        health["warning"] = "OpenAI selected but API key not configured"

    return health

@app.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    language: Optional[str] = None,
    prompt: Optional[str] = None,
    temperature: float = 0.0
):
    """
    Transcribe audio file using OpenAI Whisper
    
    Supports: mp3, mp4, mpeg, mpga, m4a, wav, webm
    Max file size: 25MB
    """
    
    if not openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="OpenAI API key not configured"
        )
    
    # Read file content
    try:
        file_content = await file.read()
        file_size_mb = len(file_content) / (1024 * 1024)
        
        if file_size_mb > 25:
            raise HTTPException(
                status_code=413,
                detail=f"File too large: {file_size_mb:.2f}MB (max 25MB)"
            )
        
        logger.info(f"Processing audio file: {file.filename} ({file_size_mb:.2f}MB)")
        
    except Exception as e:
        logger.error(f"Error reading file: {e}")
        raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")
    
    # Check cache
    file_hash = get_file_hash(file_content)
    cache_key = f"transcription:{file_hash}:{language}:{temperature}"
    
    cached_result = get_cached_transcription(cache_key)
    if cached_result:
        return TranscriptionResponse(**cached_result, cached=True)
    
    # Save to temporary file for Whisper API
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp_file:
            tmp_file.write(file_content)
            tmp_file_path = tmp_file.name
        
        # Transcribe with configured AI model
        if ai_provider == "openai":
            # Use OpenAI Whisper API
            with open(tmp_file_path, "rb") as audio_file:
                transcript = openai.audio.transcriptions.create(
                    model=ai_model,
                    file=audio_file,
                    language=language,
                    prompt=prompt,
                    temperature=temperature,
                    response_format="verbose_json"
                )
        elif ai_provider == "ollama":
            # Use local faster-whisper for privacy-focused local transcription
            if not FASTER_WHISPER_AVAILABLE:
                raise HTTPException(
                    status_code=503,
                    detail="Local transcription not available. Install faster-whisper or switch to OpenAI provider."
                )
            logger.info(f"Using local faster-whisper model: {LOCAL_WHISPER_MODEL_SIZE}")
            local_result = transcribe_with_local_whisper(tmp_file_path, language, temperature)
            # Create a mock object with same interface as OpenAI response
            class LocalTranscript:
                def __init__(self, result):
                    self.text = result["text"]
                    self.language = result["language"]
                    self.duration = result["duration"]
            transcript = LocalTranscript(local_result)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported AI provider for transcription: {ai_provider}")
        
        # Clean up temp file
        os.unlink(tmp_file_path)
        
        # Build response
        result = {
            "text": transcript.text,
            "language": getattr(transcript, 'language', None),
            "duration": getattr(transcript, 'duration', None),
            "cached": False
        }
        
        # Save recording to storage with metadata
        if storage_manager:
            try:
                metadata = {
                    "transcription": transcript.text,
                    "language": result.get('language'),
                    "duration": result.get('duration'),
                    "filename": file.filename,
                    "size_bytes": len(file_content),
                    "timestamp": str(datetime.now())
                }
                storage_path = storage_manager.save_recording(file_content, file.filename, metadata)
                result["storage_path"] = storage_path
                logger.info(f"Recording saved to: {storage_path}")
            except Exception as e:
                logger.error(f"Failed to save recording to storage: {e}")
                # Continue without failing the transcription
        
        # Cache result
        cache_transcription(cache_key, result)
        
        logger.info(f"Transcription completed: {len(transcript.text)} characters")
        
        return TranscriptionResponse(**result)
        
    except openai.OpenAIError as e:
        logger.error(f"OpenAI API error: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"OpenAI API error: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error processing audio: {e}")
        if 'tmp_file_path' in locals():
            try:
                os.unlink(tmp_file_path)
            except OSError as cleanup_err:
                logger.debug(f"Failed to cleanup temp file: {cleanup_err}")
        raise HTTPException(
            status_code=500,
            detail=f"Error processing audio: {str(e)}"
        )

@app.post("/transcribe-with-timestamps")
async def transcribe_with_timestamps(
    file: UploadFile = File(...),
    language: Optional[str] = None
):
    """
    Transcribe audio with word-level timestamps
    Useful for syncing transcripts with video/audio playback
    """
    
    if not openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="OpenAI API key not configured"
        )
    
    try:
        file_content = await file.read()
        file_size_mb = len(file_content) / (1024 * 1024)
        
        if file_size_mb > 25:
            raise HTTPException(
                status_code=413,
                detail=f"File too large: {file_size_mb:.2f}MB (max 25MB)"
            )
        
        # Save to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp_file:
            tmp_file.write(file_content)
            tmp_file_path = tmp_file.name
        
        # Transcribe with timestamps using configured AI model
        if ai_provider == "openai":
            with open(tmp_file_path, "rb") as audio_file:
                transcript = openai.audio.transcriptions.create(
                    model=ai_model,
                    file=audio_file,
                    language=language,
                    response_format="verbose_json",
                    timestamp_granularities=["word"]
                )
            words = getattr(transcript, 'words', [])
        elif ai_provider == "ollama":
            # Use local faster-whisper with word timestamps
            if not FASTER_WHISPER_AVAILABLE:
                raise HTTPException(
                    status_code=503,
                    detail="Local transcription not available. Install faster-whisper or switch to OpenAI provider."
                )
            logger.info(f"Using local faster-whisper with timestamps: {LOCAL_WHISPER_MODEL_SIZE}")
            local_result = transcribe_with_timestamps_local(tmp_file_path, language)
            # Create mock transcript object
            class LocalTranscript:
                def __init__(self, result):
                    self.text = result["text"]
                    self.language = result["language"]
                    self.duration = result["duration"]
            transcript = LocalTranscript(local_result)
            words = local_result.get("words", [])
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported AI provider: {ai_provider}")
        
        # Clean up
        os.unlink(tmp_file_path)
        
        logger.info(f"Transcription with timestamps completed")

        return {
            "text": transcript.text,
            "language": getattr(transcript, 'language', None),
            "duration": getattr(transcript, 'duration', None),
            "words": words
        }
        
    except openai.OpenAIError as e:
        logger.error(f"OpenAI API error: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"OpenAI API error: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error processing audio: {e}")
        if 'tmp_file_path' in locals():
            try:
                os.unlink(tmp_file_path)
            except OSError as cleanup_err:
                logger.debug(f"Failed to cleanup temp file: {cleanup_err}")
        raise HTTPException(
            status_code=500,
            detail=f"Error processing audio: {str(e)}"
        )

@app.post("/translate")
async def translate_audio(
    file: UploadFile = File(...),
    prompt: Optional[str] = None
):
    """
    Translate audio to English using Whisper
    Works with any language input
    """
    
    if not openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="OpenAI API key not configured"
        )
    
    try:
        file_content = await file.read()
        
        # Save to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp_file:
            tmp_file.write(file_content)
            tmp_file_path = tmp_file.name
        
        # Translate with Whisper
        with open(tmp_file_path, "rb") as audio_file:
            translation = openai.audio.translations.create(
                model="whisper-1",
                file=audio_file,
                prompt=prompt
            )
        
        # Clean up
        os.unlink(tmp_file_path)
        
        logger.info(f"Translation completed: {len(translation.text)} characters")
        
        return {
            "text": translation.text,
            "target_language": "en"
        }
        
    except openai.OpenAIError as e:
        logger.error(f"OpenAI API error: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"OpenAI API error: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error translating audio: {e}")
        if 'tmp_file_path' in locals():
            try:
                os.unlink(tmp_file_path)
            except OSError as cleanup_err:
                logger.debug(f"Failed to cleanup temp file: {cleanup_err}")
        raise HTTPException(
            status_code=500,
            detail=f"Error translating audio: {str(e)}"
        )

@app.get("/supported-formats")
async def get_supported_formats():
    """Get list of supported audio formats and transcription providers"""
    models = ["whisper-1"]
    if FASTER_WHISPER_AVAILABLE:
        models.extend(["faster-whisper-tiny", "faster-whisper-base", "faster-whisper-small",
                       "faster-whisper-medium", "faster-whisper-large-v3"])

    return {
        "formats": ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm", "flac", "ogg"],
        "max_file_size_mb": 25,
        "providers": {
            "openai": {
                "available": bool(openai_api_key),
                "models": ["whisper-1"],
                "features": ["transcription", "translation", "timestamps"]
            },
            "local": {
                "available": FASTER_WHISPER_AVAILABLE,
                "models": ["tiny", "base", "small", "medium", "large-v3"],
                "current_model": LOCAL_WHISPER_MODEL_SIZE if FASTER_WHISPER_AVAILABLE else None,
                "features": ["transcription", "timestamps", "vad_filter"]
            }
        },
        "current_provider": ai_provider,
        "models": models,
        "languages": "all (automatic detection)",
        "features": [
            "transcription",
            "translation",
            "timestamps",
            "language_detection"
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)
