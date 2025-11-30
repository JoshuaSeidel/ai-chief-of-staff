"""
Shared utilities for AI Chief of Staff microservices
"""

from .db_config import get_ai_model, get_ai_provider, get_max_tokens

__all__ = ['get_ai_model', 'get_ai_provider', 'get_max_tokens']
