"""
AI Provider Abstraction Layer
Unified interface for multiple AI providers: Anthropic, OpenAI, Ollama, AWS Bedrock

Usage:
    from ai_providers import get_ai_client
    
    client = get_ai_client(provider="anthropic", model="claude-sonnet-4-5-20250929")
    response = client.complete("What is 2+2?")
"""

from typing import Optional, Dict, List, Any, Union
from abc import ABC, abstractmethod
import os
import logging
import json

logger = logging.getLogger(__name__)

# ============================================================================
# Abstract Base Class
# ============================================================================

class AIProvider(ABC):
    """Abstract base class for AI providers"""
    
    def __init__(self, model: str, **kwargs):
        self.model = model
        self.kwargs = kwargs
    
    @abstractmethod
    def complete(self, 
                 prompt: str, 
                 system: Optional[str] = None,
                 max_tokens: int = 1024,
                 temperature: float = 0.3,
                 **kwargs) -> Dict[str, Any]:
        """
        Generate a completion from the model
        
        Returns:
            {
                "text": str,  # The generated text
                "model": str,  # Model used
                "tokens": int,  # Tokens used
                "finish_reason": str  # Why it stopped
            }
        """
        pass
    
    @abstractmethod
    def complete_json(self,
                      prompt: str,
                      system: Optional[str] = None,
                      max_tokens: int = 1024,
                      temperature: float = 0.3,
                      **kwargs) -> Dict[str, Any]:
        """
        Generate a JSON response from the model
        
        Returns: Parsed JSON dict
        """
        pass
    
    @abstractmethod
    def transcribe_audio(self,
                         audio_file_path: str,
                         language: Optional[str] = None,
                         **kwargs) -> Dict[str, Any]:
        """
        Transcribe audio file
        
        Returns:
            {
                "text": str,
                "language": str,
                "duration": float
            }
        """
        pass
    
    def is_available(self) -> bool:
        """Check if provider is available and configured"""
        return True

# ============================================================================
# Anthropic Claude Provider
# ============================================================================

class AnthropicProvider(AIProvider):
    """Anthropic Claude provider"""
    
    def __init__(self, model: str = "claude-sonnet-4-5-20250929", **kwargs):
        super().__init__(model, **kwargs)
        try:
            from anthropic import Anthropic
            api_key = kwargs.get('api_key') or os.getenv('ANTHROPIC_API_KEY')
            if not api_key:
                raise ValueError("ANTHROPIC_API_KEY not found")
            self.client = Anthropic(api_key=api_key)
            logger.info(f"Initialized Anthropic provider with model: {model}")
        except Exception as e:
            logger.error(f"Failed to initialize Anthropic: {e}")
            self.client = None
    
    def complete(self, 
                 prompt: str, 
                 system: Optional[str] = None,
                 max_tokens: int = 1024,
                 temperature: float = 0.3,
                 **kwargs) -> Dict[str, Any]:
        """Generate completion using Claude"""
        if not self.client:
            raise RuntimeError("Anthropic client not initialized")
        
        messages = [{"role": "user", "content": prompt}]
        
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system if system else None,
                messages=messages
            )
            
            return {
                "text": response.content[0].text,
                "model": response.model,
                "tokens": response.usage.input_tokens + response.usage.output_tokens,
                "finish_reason": response.stop_reason
            }
        except Exception as e:
            logger.error(f"Anthropic API error: {e}")
            raise
    
    def complete_json(self,
                      prompt: str,
                      system: Optional[str] = None,
                      max_tokens: int = 1024,
                      temperature: float = 0.3,
                      **kwargs) -> Dict[str, Any]:
        """Generate JSON response"""
        system_prompt = f"{system or ''}\n\nRespond with valid JSON only. No markdown, no explanations."
        prompt_with_json = f"{prompt}\n\nReturn your response as valid JSON."
        
        result = self.complete(prompt_with_json, system=system_prompt, 
                               max_tokens=max_tokens, temperature=temperature)
        
        # Extract JSON from response
        text = result["text"].strip()
        
        # Remove markdown code blocks if present
        if text.startswith("```json"):
            text = text.split("```json")[1].split("```")[0].strip()
        elif text.startswith("```"):
            text = text.split("```")[1].split("```")[0].strip()
        
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON: {e}\nResponse: {text}")
            raise ValueError(f"Invalid JSON response from Claude: {text[:200]}")
    
    def transcribe_audio(self,
                         audio_file_path: str,
                         language: Optional[str] = None,
                         **kwargs) -> Dict[str, Any]:
        """Anthropic doesn't support audio transcription"""
        raise NotImplementedError("Anthropic doesn't support audio transcription. Use OpenAI or Ollama.")
    
    def is_available(self) -> bool:
        return self.client is not None

# ============================================================================
# OpenAI Provider
# ============================================================================

class OpenAIProvider(AIProvider):
    """OpenAI provider (GPT, Whisper)"""
    
    def __init__(self, model: str = "gpt-4", **kwargs):
        super().__init__(model, **kwargs)
        try:
            import openai
            api_key = kwargs.get('api_key') or os.getenv('OPENAI_API_KEY')
            if not api_key:
                raise ValueError("OPENAI_API_KEY not found")
            self.client = openai.OpenAI(api_key=api_key)
            logger.info(f"Initialized OpenAI provider with model: {model}")
        except Exception as e:
            logger.error(f"Failed to initialize OpenAI: {e}")
            self.client = None
    
    def complete(self, 
                 prompt: str, 
                 system: Optional[str] = None,
                 max_tokens: int = 1024,
                 temperature: float = 0.3,
                 **kwargs) -> Dict[str, Any]:
        """Generate completion using GPT"""
        if not self.client:
            raise RuntimeError("OpenAI client not initialized")
        
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature
            )
            
            return {
                "text": response.choices[0].message.content,
                "model": response.model,
                "tokens": response.usage.total_tokens,
                "finish_reason": response.choices[0].finish_reason
            }
        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
            raise
    
    def complete_json(self,
                      prompt: str,
                      system: Optional[str] = None,
                      max_tokens: int = 1024,
                      temperature: float = 0.3,
                      **kwargs) -> Dict[str, Any]:
        """Generate JSON response"""
        if not self.client:
            raise RuntimeError("OpenAI client not initialized")
        
        messages = []
        if system:
            messages.append({"role": "system", "content": f"{system}\nRespond with valid JSON only."})
        else:
            messages.append({"role": "system", "content": "Respond with valid JSON only."})
        messages.append({"role": "user", "content": prompt})
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                response_format={"type": "json_object"}
            )
            
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            logger.error(f"OpenAI JSON API error: {e}")
            raise
    
    def transcribe_audio(self,
                         audio_file_path: str,
                         language: Optional[str] = None,
                         **kwargs) -> Dict[str, Any]:
        """Transcribe audio using Whisper"""
        if not self.client:
            raise RuntimeError("OpenAI client not initialized")
        
        whisper_model = kwargs.get('whisper_model', 'whisper-1')
        
        try:
            with open(audio_file_path, 'rb') as audio_file:
                response = self.client.audio.transcriptions.create(
                    model=whisper_model,
                    file=audio_file,
                    language=language,
                    response_format="verbose_json"
                )
            
            return {
                "text": response.text,
                "language": getattr(response, 'language', None),
                "duration": getattr(response, 'duration', None)
            }
        except Exception as e:
            logger.error(f"OpenAI Whisper error: {e}")
            raise
    
    def is_available(self) -> bool:
        return self.client is not None

# ============================================================================
# Ollama Provider (Local AI)
# ============================================================================

class OllamaProvider(AIProvider):
    """Ollama provider for local AI models"""
    
    def __init__(self, model: str = "mistral:latest", **kwargs):
        super().__init__(model, **kwargs)
        try:
            import httpx
            self.base_url = kwargs.get('base_url') or os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
            self.client = httpx.Client(base_url=self.base_url, timeout=120.0)
            logger.info(f"Initialized Ollama provider at {self.base_url} with model: {model}")
        except Exception as e:
            logger.error(f"Failed to initialize Ollama: {e}")
            self.client = None
    
    def complete(self, 
                 prompt: str, 
                 system: Optional[str] = None,
                 max_tokens: int = 1024,
                 temperature: float = 0.3,
                 **kwargs) -> Dict[str, Any]:
        """Generate completion using Ollama"""
        if not self.client:
            raise RuntimeError("Ollama client not initialized")
        
        payload = {
            "model": self.model,
            "prompt": prompt,
            "system": system,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens
            }
        }
        
        try:
            response = self.client.post("/api/generate", json=payload)
            response.raise_for_status()
            data = response.json()
            
            return {
                "text": data.get("response", ""),
                "model": self.model,
                "tokens": data.get("eval_count", 0) + data.get("prompt_eval_count", 0),
                "finish_reason": "stop" if data.get("done") else "length"
            }
        except Exception as e:
            logger.error(f"Ollama API error: {e}")
            raise
    
    def complete_json(self,
                      prompt: str,
                      system: Optional[str] = None,
                      max_tokens: int = 1024,
                      temperature: float = 0.3,
                      **kwargs) -> Dict[str, Any]:
        """Generate JSON response"""
        system_prompt = f"{system or ''}\n\nRespond with valid JSON only. No markdown, no explanations."
        prompt_with_json = f"{prompt}\n\nReturn your response as valid JSON."
        
        result = self.complete(prompt_with_json, system=system_prompt, 
                               max_tokens=max_tokens, temperature=temperature)
        
        text = result["text"].strip()
        
        # Remove markdown code blocks
        if text.startswith("```json"):
            text = text.split("```json")[1].split("```")[0].strip()
        elif text.startswith("```"):
            text = text.split("```")[1].split("```")[0].strip()
        
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON: {e}\nResponse: {text}")
            raise ValueError(f"Invalid JSON response: {text[:200]}")
    
    def transcribe_audio(self,
                         audio_file_path: str,
                         language: Optional[str] = None,
                         **kwargs) -> Dict[str, Any]:
        """Transcribe audio using Ollama Whisper model"""
        if not self.client:
            raise RuntimeError("Ollama client not initialized")
        
        whisper_model = kwargs.get('whisper_model', 'whisper:medium')
        
        try:
            with open(audio_file_path, 'rb') as f:
                audio_data = f.read()
            
            payload = {
                "model": whisper_model,
                "prompt": "Transcribe this audio:",
                "audio": audio_data.hex()  # Convert to hex string
            }
            
            response = self.client.post("/api/generate", json=payload)
            response.raise_for_status()
            data = response.json()
            
            return {
                "text": data.get("response", ""),
                "language": language or "unknown",
                "duration": None
            }
        except Exception as e:
            logger.error(f"Ollama Whisper error: {e}")
            raise
    
    def is_available(self) -> bool:
        if not self.client:
            return False
        try:
            response = self.client.get("/api/tags")
            return response.status_code == 200
        except:
            return False

# ============================================================================
# AWS Bedrock Provider
# ============================================================================

class BedrockProvider(AIProvider):
    """AWS Bedrock provider for Claude and other models"""
    
    def __init__(self, model: str = "anthropic.claude-sonnet-4-5-20250929-v1:0", **kwargs):
        super().__init__(model, **kwargs)
        try:
            import boto3
            region = kwargs.get('region') or os.getenv('AWS_REGION', 'us-east-1')
            access_key = kwargs.get('access_key_id') or os.getenv('AWS_ACCESS_KEY_ID')
            secret_key = kwargs.get('secret_access_key') or os.getenv('AWS_SECRET_ACCESS_KEY')
            
            if access_key and secret_key:
                self.client = boto3.client(
                    'bedrock-runtime',
                    region_name=region,
                    aws_access_key_id=access_key,
                    aws_secret_access_key=secret_key
                )
            else:
                # Use default credential chain (IAM role, etc.)
                self.client = boto3.client('bedrock-runtime', region_name=region)
            
            logger.info(f"Initialized AWS Bedrock provider with model: {model}")
        except Exception as e:
            logger.error(f"Failed to initialize Bedrock: {e}")
            self.client = None
    
    def complete(self, 
                 prompt: str, 
                 system: Optional[str] = None,
                 max_tokens: int = 1024,
                 temperature: float = 0.3,
                 **kwargs) -> Dict[str, Any]:
        """Generate completion using Bedrock"""
        if not self.client:
            raise RuntimeError("Bedrock client not initialized")
        
        # Bedrock uses Claude API format
        messages = [{"role": "user", "content": prompt}]
        
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": messages
        }
        
        if system:
            body["system"] = system
        
        try:
            response = self.client.invoke_model(
                modelId=self.model,
                body=json.dumps(body)
            )
            
            response_body = json.loads(response['body'].read())
            
            return {
                "text": response_body['content'][0]['text'],
                "model": self.model,
                "tokens": response_body['usage']['input_tokens'] + response_body['usage']['output_tokens'],
                "finish_reason": response_body['stop_reason']
            }
        except Exception as e:
            logger.error(f"Bedrock API error: {e}")
            raise
    
    def complete_json(self,
                      prompt: str,
                      system: Optional[str] = None,
                      max_tokens: int = 1024,
                      temperature: float = 0.3,
                      **kwargs) -> Dict[str, Any]:
        """Generate JSON response"""
        system_prompt = f"{system or ''}\n\nRespond with valid JSON only. No markdown, no explanations."
        prompt_with_json = f"{prompt}\n\nReturn your response as valid JSON."
        
        result = self.complete(prompt_with_json, system=system_prompt, 
                               max_tokens=max_tokens, temperature=temperature)
        
        text = result["text"].strip()
        
        # Remove markdown code blocks
        if text.startswith("```json"):
            text = text.split("```json")[1].split("```")[0].strip()
        elif text.startswith("```"):
            text = text.split("```")[1].split("```")[0].strip()
        
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON: {e}\nResponse: {text}")
            raise ValueError(f"Invalid JSON response from Bedrock: {text[:200]}")
    
    def transcribe_audio(self,
                         audio_file_path: str,
                         language: Optional[str] = None,
                         **kwargs) -> Dict[str, Any]:
        """Bedrock doesn't support audio transcription directly"""
        raise NotImplementedError("AWS Bedrock doesn't support audio transcription. Use OpenAI or Ollama.")
    
    def is_available(self) -> bool:
        return self.client is not None

# ============================================================================
# Factory Function
# ============================================================================

def get_ai_client(provider: str = "anthropic", 
                  model: Optional[str] = None, 
                  **kwargs) -> AIProvider:
    """
    Get an AI provider client
    
    Args:
        provider: "anthropic", "openai", "ollama", or "bedrock"
        model: Model name (provider-specific)
        **kwargs: Additional provider-specific arguments
    
    Returns:
        AIProvider instance
    
    Example:
        client = get_ai_client(provider="anthropic", model="claude-sonnet-4-5-20250929")
        response = client.complete("What is 2+2?")
        print(response["text"])
    """
    provider = provider.lower()
    
    if provider == "anthropic":
        default_model = model or "claude-sonnet-4-5-20250929"
        return AnthropicProvider(model=default_model, **kwargs)
    
    elif provider == "openai":
        default_model = model or "gpt-4"
        return OpenAIProvider(model=default_model, **kwargs)
    
    elif provider == "ollama":
        default_model = model or "mistral:latest"
        return OllamaProvider(model=default_model, **kwargs)
    
    elif provider == "bedrock":
        default_model = model or "anthropic.claude-sonnet-4-5-20250929-v1:0"
        return BedrockProvider(model=default_model, **kwargs)
    
    else:
        raise ValueError(f"Unknown provider: {provider}. Choose from: anthropic, openai, ollama, bedrock")

# ============================================================================
# Convenience Functions
# ============================================================================

def get_best_available_provider(**kwargs) -> AIProvider:
    """
    Get the first available provider in order of preference:
    1. Anthropic (Claude) - Best quality
    2. OpenAI - Good quality, widely available
    3. Ollama - Local, privacy-focused
    4. Bedrock - Enterprise AWS
    """
    providers_to_try = [
        ("anthropic", "claude-sonnet-4-5-20250929"),
        ("openai", "gpt-4"),
        ("ollama", "mistral:latest"),
        ("bedrock", "anthropic.claude-sonnet-4-5-20250929-v1:0")
    ]
    
    for provider_name, default_model in providers_to_try:
        try:
            client = get_ai_client(provider=provider_name, model=default_model, **kwargs)
            if client.is_available():
                logger.info(f"Using provider: {provider_name}")
                return client
        except Exception as e:
            logger.debug(f"Provider {provider_name} not available: {e}")
            continue
    
    raise RuntimeError("No AI providers available. Configure at least one provider.")
