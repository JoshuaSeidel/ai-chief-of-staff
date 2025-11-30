"""
Database Configuration Helper for Microservices
Fetches AI model configuration from shared database
"""

import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Database connection helper
def get_db_connection():
    """Get database connection based on DATABASE_URL environment variable"""
    import psycopg2
    from urllib.parse import urlparse
    
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL environment variable not set")
    
    # Parse PostgreSQL URL
    result = urlparse(database_url)
    
    try:
        conn = psycopg2.connect(
            host=result.hostname,
            port=result.port or 5432,
            user=result.username,
            password=result.password,
            database=result.path[1:],  # Remove leading slash
            connect_timeout=5
        )
        return conn
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        raise


def get_ai_model(provider: str = "anthropic") -> str:
    """
    Get configured AI model from database
    
    Args:
        provider: AI provider name ('anthropic', 'openai', 'ollama')
    
    Returns:
        Model name from database or default
    """
    # Map provider to database config key
    config_keys = {
        "anthropic": "claudeModel",
        "openai": "openaiModel",
        "ollama": "ollamaModel"
    }
    
    # Default models
    default_models = {
        "anthropic": "claude-sonnet-4-5-20250929",
        "openai": "gpt-4o",
        "ollama": "llama3.1"
    }
    
    config_key = config_keys.get(provider.lower(), "claudeModel")
    default_model = default_models.get(provider.lower(), "claude-sonnet-4-5-20250929")
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            "SELECT value FROM config WHERE key = %s",
            (config_key,)
        )
        
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if row and row[0]:
            model = row[0].strip()
            logger.info(f"Loaded {provider} model from database: {model}")
            return model
        else:
            logger.info(f"No model configured in database, using default: {default_model}")
            return default_model
            
    except Exception as e:
        logger.warning(f"Failed to fetch model from database: {e}. Using default: {default_model}")
        return default_model


def get_ai_provider() -> str:
    """
    Get configured AI provider from database
    
    Returns:
        Provider name ('anthropic', 'openai', 'ollama')
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            "SELECT value FROM config WHERE key = %s",
            ("aiProvider",)
        )
        
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if row and row[0]:
            provider = row[0].strip().lower()
            logger.info(f"Loaded AI provider from database: {provider}")
            return provider
        else:
            logger.info("No AI provider configured in database, using default: anthropic")
            return "anthropic"
            
    except Exception as e:
        logger.warning(f"Failed to fetch AI provider from database: {e}. Using default: anthropic")
        return "anthropic"


def get_max_tokens() -> int:
    """
    Get configured max tokens from database
    
    Returns:
        Max tokens (1000-8192, default 4096)
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            "SELECT value FROM config WHERE key = %s",
            ("aiMaxTokens",)
        )
        
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if row and row[0]:
            max_tokens = int(row[0])
            # Clamp between 1000 and 8192
            max_tokens = max(1000, min(8192, max_tokens))
            logger.info(f"Loaded max tokens from database: {max_tokens}")
            return max_tokens
        else:
            logger.info("No max tokens configured in database, using default: 4096")
            return 4096
            
    except Exception as e:
        logger.warning(f"Failed to fetch max tokens from database: {e}. Using default: 4096")
        return 4096
