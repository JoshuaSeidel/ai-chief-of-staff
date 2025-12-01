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


def get_storage_config() -> dict:
    """
    Get voice recording storage configuration from database
    
    Returns:
        Dict with storage_type ('local' or 's3') and related config
    """
    defaults = {
        "storage_type": "local",
        "storage_path": "/app/data/voice-recordings",
        "s3_bucket": "",
        "s3_region": "us-east-1",
        "s3_access_key_id": "",
        "s3_secret_access_key": "",
        "s3_endpoint": ""
    }
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Fetch all storage-related config keys
        keys = [
            "storageType",
            "storagePath", 
            "s3Bucket",
            "s3Region",
            "s3AccessKeyId",
            "s3SecretAccessKey",
            "s3Endpoint"
        ]
        
        cursor.execute(
            "SELECT key, value FROM config WHERE key = ANY(%s)",
            (keys,)
        )
        
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        
        # Build config dict from database values
        config = defaults.copy()
        key_mapping = {
            "storageType": "storage_type",
            "storagePath": "storage_path",
            "s3Bucket": "s3_bucket",
            "s3Region": "s3_region",
            "s3AccessKeyId": "s3_access_key_id",
            "s3SecretAccessKey": "s3_secret_access_key",
            "s3Endpoint": "s3_endpoint"
        }
        
        for key, value in rows:
            if key in key_mapping and value:
                config[key_mapping[key]] = value.strip()
        
        logger.info(f"Loaded storage config from database: type={config['storage_type']}")
        return config
        
    except Exception as e:
        logger.warning(f"Failed to fetch storage config from database: {e}. Using defaults")
        return defaults


def get_api_key(provider: str) -> Optional[str]:
    """
    Get API key for specified provider from database
    
    Args:
        provider: AI provider name ('anthropic', 'openai', 'ollama')
    
    Returns:
        API key from database or None
    """
    # Map provider to database config key
    key_mapping = {
        "anthropic": "anthropicApiKey",
        "openai": "openaiApiKey",
        "ollama": None  # Ollama doesn't need API key
    }
    
    config_key = key_mapping.get(provider.lower())
    if not config_key:
        logger.info(f"Provider '{provider}' does not require an API key")
        return None
    
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
            api_key = row[0].strip()
            # Don't log any part of API key for security (CodeQL compliance)
            logger.info(f"Loaded {provider} API key from database (length: {len(api_key)})")
            return api_key
        else:
            logger.warning(f"No API key configured in database for {provider}")
            return None
            
    except Exception as e:
        logger.warning(f"Failed to fetch API key from database for {provider}: {e}")
        return None


def get_ollama_config() -> dict:
    """
    Get Ollama configuration from database
    
    Returns:
        Dict with base_url and other Ollama settings
    """
    defaults = {
        "base_url": "http://localhost:11434",
        "timeout": 120
    }
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            "SELECT key, value FROM config WHERE key IN ('ollamaBaseUrl', 'ollamaTimeout')"
        )
        
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        
        config = defaults.copy()
        for key, value in rows:
            if key == "ollamaBaseUrl" and value:
                config["base_url"] = value.strip()
            elif key == "ollamaTimeout" and value:
                try:
                    config["timeout"] = int(value)
                except ValueError:
                    pass
        
        logger.info(f"Loaded Ollama config from database: {config['base_url']}")
        return config
        
    except Exception as e:
        logger.warning(f"Failed to fetch Ollama config from database: {e}. Using defaults")
        return defaults


def get_bedrock_config() -> dict:
    """
    Get AWS Bedrock configuration from database
    
    Returns:
        Dict with access_key_id, secret_access_key, region
    """
    defaults = {
        "access_key_id": None,
        "secret_access_key": None,
        "region": "us-east-1"
    }
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute(
            "SELECT key, value FROM config WHERE key IN ('awsAccessKeyId', 'awsSecretAccessKey', 'awsRegion')"
        )
        
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        
        config = defaults.copy()
        for key, value in rows:
            if key == "awsAccessKeyId" and value:
                config["access_key_id"] = value.strip()
            elif key == "awsSecretAccessKey" and value:
                config["secret_access_key"] = value.strip()
            elif key == "awsRegion" and value:
                config["region"] = value.strip()
        
        if config["access_key_id"]:
            masked = f"{config['access_key_id'][:4]}...{config['access_key_id'][-4:]}"
            logger.info(f"Loaded AWS Bedrock config from database: {masked}")
        else:
            logger.info("No AWS Bedrock credentials configured in database")
        
        return config
        
    except Exception as e:
        logger.warning(f"Failed to fetch AWS Bedrock config from database: {e}. Using defaults")
        return defaults
