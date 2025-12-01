"""
Configuration Manager
Handles reading/writing configuration from PostgreSQL database
with environment variable fallback support
"""

import os
import json
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)

class ConfigManager:
    """Configuration manager with database and env var fallback"""
    
    def __init__(self, database_url: Optional[str] = None):
        """
        Initialize configuration manager
        
        Args:
            database_url: PostgreSQL connection string
        """
        self.database_url = database_url or os.getenv('DATABASE_URL')
        self._conn = None
        self._cache = {}
        self._cache_time = None
        self._cache_ttl = 60  # Cache for 60 seconds
        
        if self.database_url:
            try:
                self._connect()
                logger.info("✓ Connected to configuration database")
            except Exception as e:
                logger.warning(f"Could not connect to config database: {e}. Using env vars only.")
    
    def _connect(self):
        """Establish database connection"""
        if not self._conn or self._conn.closed:
            self._conn = psycopg2.connect(self.database_url)
    
    def _execute_query(self, query: str, params: tuple = None, fetch=True):
        """Execute a database query"""
        try:
            self._connect()
            with self._conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(query, params or ())
                if fetch:
                    return cursor.fetchall()
                self._conn.commit()
        except Exception as e:
            logger.error(f"Database query error: {e}")
            if self._conn:
                self._conn.rollback()
            raise
    
    def get(self, key: str, default: Any = None, force_db: bool = False) -> Any:
        """
        Get configuration value
        
        Priority:
        1. Environment variable (if allow_env_override is true)
        2. Database value
        3. Default value
        
        Args:
            key: Configuration key (e.g., 'anthropic.api_key')
            default: Default value if not found
            force_db: Skip env var check, force database lookup
        
        Returns:
            Configuration value
        """
        # Check if env override is allowed (unless force_db)
        if not force_db:
            allow_override = self.get('system.allow_env_override', default='true', force_db=True)
            if str(allow_override).lower() == 'true':
                # Check environment variable (convert dots to underscores, uppercase)
                env_key = key.replace('.', '_').upper()
                env_value = os.getenv(env_key)
                if env_value is not None:
                    logger.debug(f"Using env var for {key}: {env_key}")
                    return self._cast_value(env_value, default)
        
        # Check cache
        if key in self._cache and self._cache_time:
            age = (datetime.now() - self._cache_time).total_seconds()
            if age < self._cache_ttl:
                return self._cache[key]
        
        # Query database
        if self._conn:
            try:
                query = "SELECT value FROM config WHERE key = %s"
                result = self._execute_query(query, (key,))
                
                if result and len(result) > 0:
                    row = result[0]
                    # Handle both tuple and dict result types
                    value = row[0] if isinstance(row, tuple) else row.get('value', row.get('config_value'))
                    config_type = None  # Type casting handled below
                    
                    # Cast to appropriate type
                    typed_value = self._cast_type(value, config_type)
                    self._cache[key] = typed_value
                    self._cache_time = datetime.now()
                    return typed_value
            except Exception as e:
                logger.warning(f"Failed to get config from database: {e}")
        
        return default
    
    def set(self, key: str, value: Any, updated_by: str = 'system'):
        """
        Set configuration value in database
        
        Args:
            key: Configuration key
            value: Value to set
            updated_by: Who made the change
        """
        if not self._conn:
            raise RuntimeError("Database not available for configuration updates")
        
        # Convert value to string for storage
        if isinstance(value, (dict, list)):
            value_str = json.dumps(value)
            config_type = 'json'
        elif isinstance(value, bool):
            value_str = str(value).lower()
            config_type = 'boolean'
        elif isinstance(value, int):
            value_str = str(value)
            config_type = 'integer'
        else:
            value_str = str(value)
            config_type = 'string'
        
        try:
            query = """
                UPDATE config 
                SET config_value = %s, updated_by = %s, updated_at = CURRENT_TIMESTAMP
                WHERE config_key = %s
            """
            self._execute_query(query, (value_str, updated_by, key), fetch=False)
            
            # Invalidate cache
            if key in self._cache:
                del self._cache[key]
            
            logger.info(f"Updated config: {key} = {value_str[:50]}...")
        except Exception as e:
            logger.error(f"Failed to set config: {e}")
            raise
    
    def get_category(self, category: str) -> Dict[str, Any]:
        """
        Get all configuration values for a category
        
        Args:
            category: Category name (e.g., 'ai_providers', 'storage')
        
        Returns:
            Dict of config_key: config_value
        """
        if not self._conn:
            return {}
        
        try:
            query = """
                SELECT config_key, config_value, config_type, is_sensitive 
                FROM config 
                WHERE category = %s
                ORDER BY config_key
            """
            results = self._execute_query(query, (category,))
            
            configs = {}
            for row in results:
                key = row['config_key']
                value = row['config_value']
                config_type = row['config_type']
                is_sensitive = row['is_sensitive']
                
                # Mask sensitive values
                if is_sensitive and value:
                    configs[key] = "***REDACTED***"
                else:
                    configs[key] = self._cast_type(value, config_type)
            
            return configs
        except Exception as e:
            logger.error(f"Failed to get category configs: {e}")
            return {}
    
    def get_ai_provider_config(self, service_name: str) -> Dict[str, Any]:
        """
        Get AI provider configuration for a specific service
        
        Args:
            service_name: Service name (e.g., 'ai_intelligence', 'voice_processor')
        
        Returns:
            {
                'provider': 'anthropic',
                'model': 'claude-sonnet-4-5-20250929',
                'api_key': '...',
                'enabled': True,
                ...
            }
        """
        provider = self.get(f'{service_name}.provider', default='anthropic')
        model = self.get(f'{service_name}.model')
        
        # Get provider-specific config
        config = {
            'provider': provider,
            'model': model,
            'enabled': True
        }
        
        if provider == 'anthropic':
            config['api_key'] = self.get('anthropic.api_key') or os.getenv('ANTHROPIC_API_KEY')
            config['max_tokens'] = int(self.get('anthropic.max_tokens', default=4096))
            config['temperature'] = float(self.get('anthropic.temperature', default=0.3))
        
        elif provider == 'openai':
            config['api_key'] = self.get('openai.api_key') or os.getenv('OPENAI_API_KEY')
        
        elif provider == 'ollama':
            config['base_url'] = self.get('ollama.base_url', default='http://ollama:11434')
            config['enabled'] = self.get('ollama.enabled', default='false') == 'true'
        
        elif provider == 'bedrock':
            config['region'] = self.get('bedrock.region', default='us-east-1')
            config['access_key_id'] = self.get('bedrock.access_key_id') or os.getenv('AWS_ACCESS_KEY_ID')
            config['secret_access_key'] = self.get('bedrock.secret_access_key') or os.getenv('AWS_SECRET_ACCESS_KEY')
            config['enabled'] = self.get('bedrock.enabled', default='false') == 'true'
        
        return config
    
    def _cast_type(self, value: str, config_type: str) -> Any:
        """Cast string value to appropriate Python type"""
        if value is None:
            return None
        
        if config_type == 'boolean':
            return value.lower() in ('true', '1', 'yes')
        elif config_type == 'integer':
            return int(value)
        elif config_type == 'json':
            return json.loads(value)
        else:
            return value
    
    def _cast_value(self, value: str, reference: Any) -> Any:
        """Cast value to same type as reference"""
        if reference is None:
            return value
        
        if isinstance(reference, bool):
            return value.lower() in ('true', '1', 'yes')
        elif isinstance(reference, int):
            return int(value)
        elif isinstance(reference, float):
            return float(value)
        else:
            return value
    
    def clear_cache(self):
        """Clear configuration cache"""
        self._cache = {}
        self._cache_time = None
    
    def close(self):
        """Close database connection"""
        if self._conn and not self._conn.closed:
            self._conn.close()

# Global singleton instance
_config_manager = None

def get_config_manager() -> ConfigManager:
    """Get global configuration manager instance"""
    global _config_manager
    if _config_manager is None:
        _config_manager = ConfigManager()
    return _config_manager
