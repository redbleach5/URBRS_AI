"""
LLM Provider Manager - Manages multiple LLM providers
"""

import asyncio
from typing import Dict, Optional, List, Tuple
from ..core.logger import get_logger
logger = get_logger(__name__)

from ..config import LLMConfig
from .base import BaseLLMProvider, LLMMessage, LLMResponse
from .openai_provider import OpenAIProvider
from .anthropic_provider import AnthropicProvider
from .ollama_provider import OllamaProvider
from ..core.exceptions import LLMException
from ..core.pydantic_utils import pydantic_to_dict


class LLMProviderManager:
    """
    Manages multiple LLM providers with automatic selection and fallback
    """
    
    def __init__(self, config: LLMConfig):
        """
        Initialize provider manager
        
        Args:
            config: LLM configuration
        """
        self.config = config
        self.providers: Dict[str, BaseLLMProvider] = {}
        self.default_provider_name = config.default_provider
        self._initialized = False
    
    async def initialize(self) -> None:
        """Initialize all enabled providers"""
        if self._initialized:
            return
        
        logger.info("Initializing LLM providers...")
        
        # Initialize Ollama FIRST (prioritize for local use)
        # Ollama is the primary provider for local development
        if "ollama" in self.config.providers:
            ollama_config = self.config.providers["ollama"]
            if ollama_config.enabled:
                try:
                    provider = OllamaProvider(pydantic_to_dict(ollama_config))
                    await provider.initialize()
                    self.providers["ollama"] = provider
                    logger.info("Ollama provider initialized (PRIORITY)")
                except Exception as e:
                    logger.warning(f"Failed to initialize Ollama provider: {e}")
        
        # Initialize OpenAI (fallback)
        if "openai" in self.config.providers:
            openai_config = self.config.providers["openai"]
            if openai_config.enabled:
                try:
                    provider = OpenAIProvider(pydantic_to_dict(openai_config))
                    await provider.initialize()
                    self.providers["openai"] = provider
                    logger.info("OpenAI provider initialized")
                except Exception as e:
                    logger.warning(f"Failed to initialize OpenAI provider: {e}")
        
        # Initialize Anthropic (fallback)
        if "anthropic" in self.config.providers:
            anthropic_config = self.config.providers["anthropic"]
            if anthropic_config.enabled:
                try:
                    provider = AnthropicProvider(pydantic_to_dict(anthropic_config))
                    await provider.initialize()
                    self.providers["anthropic"] = provider
                    logger.info("Anthropic provider initialized")
                except Exception as e:
                    logger.warning(f"Failed to initialize Anthropic provider: {e}")
        
        # Verify default provider is available
        if self.default_provider_name not in self.providers:
            if self.providers:
                # PRIORITY: Если Ollama доступен, используем его как default
                if "ollama" in self.providers:
                    self.default_provider_name = "ollama"
                    logger.info(
                        f"Default provider '{self.config.default_provider}' not available. "
                        f"Using Ollama (priority provider) instead."
                    )
                else:
                    # Use first available provider
                    self.default_provider_name = list(self.providers.keys())[0]
                    logger.warning(
                        f"Default provider '{self.config.default_provider}' not available. "
                        f"Using '{self.default_provider_name}' instead."
                    )
            else:
                raise LLMException("No LLM providers available")
        
        self._initialized = True
        logger.info(f"LLM Provider Manager initialized with {len(self.providers)} providers")
    
    async def shutdown(self) -> None:
        """Shutdown all providers"""
        for provider in self.providers.values():
            try:
                await provider.shutdown()
            except Exception as e:
                logger.error(f"Error shutting down provider: {e}")
        self.providers.clear()
        self._initialized = False
    
    def get_provider(self, provider_name: Optional[str] = None) -> BaseLLMProvider:
        """
        Get provider by name
        
        Args:
            provider_name: Name of provider. If None, returns default provider.
            
        Returns:
            LLM provider instance
            
        Raises:
            LLMException: If provider not found
        """
        if not self._initialized:
            raise LLMException("Provider manager not initialized")
        
        name = provider_name or self.default_provider_name
        
        if name not in self.providers:
            raise LLMException(f"Provider '{name}' not available")
        
        return self.providers[name]
    
    async def generate(
        self,
        messages: List[LLMMessage],
        provider_name: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        fallback: bool = True,
        thinking_mode: bool = False,
        **kwargs
    ) -> LLMResponse:
        """
        Generate response with automatic fallback
        
        Args:
            messages: List of messages
            provider_name: Provider to use. If None, uses default.
            model: Model name
            temperature: Sampling temperature
            max_tokens: Maximum tokens
            fallback: Whether to try fallback providers on error
            **kwargs: Additional parameters
            
        Returns:
            LLMResponse
            
        Raises:
            LLMException: If all providers fail
        """
        providers_to_try = []
        
        if provider_name:
            providers_to_try.append(provider_name)
        
        # PRIORITY: Always try Ollama first if available (local models are preferred)
        if "ollama" in self.providers and "ollama" not in providers_to_try:
            providers_to_try.insert(0, "ollama")  # Insert at the beginning
        
        # Add default provider if not already in list
        if self.default_provider_name not in providers_to_try:
            # If default is not Ollama, add it after Ollama
            if self.default_provider_name == "ollama":
                # Already added above
                pass
            else:
                # Insert after Ollama if Ollama is first, otherwise append
                if providers_to_try and providers_to_try[0] == "ollama":
                    providers_to_try.insert(1, self.default_provider_name)
                else:
                    providers_to_try.append(self.default_provider_name)
        
        # Add other providers as fallback (Ollama excluded as it's already first)
        if fallback:
            for name in self.providers.keys():
                if name not in providers_to_try:
                    providers_to_try.append(name)
        
        last_error = None
        
        for provider_name in providers_to_try:
            try:
                provider = self.get_provider(provider_name)
                response = await provider.generate(
                    messages=messages,
                    model=model,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    thinking_mode=thinking_mode,
                    **kwargs
                )
                return response
            except Exception as e:
                last_error = e
                logger.warning(f"Provider '{provider_name}' failed: {e}")
                continue
        
        raise LLMException(f"All providers failed. Last error: {last_error}") from last_error
    
    async def list_available_models(self, provider_name: Optional[str] = None) -> Dict[str, List[str]]:
        """
        List available models from all or specific provider
        
        Args:
            provider_name: Provider name. If None, lists from all providers.
            
        Returns:
            Dictionary mapping provider names to lists of models
        """
        if provider_name:
            provider = self.get_provider(provider_name)
            models = await provider.list_models()
            return {provider_name: models}
        
        result = {}
        for name, provider in self.providers.items():
            try:
                models = await provider.list_models()
                result[name] = models
            except Exception as e:
                logger.warning(f"Failed to list models from {name}: {e}")
        
        return result
    
    def is_provider_available(self, provider_name: str) -> bool:
        """Check if provider is available"""
        return provider_name in self.providers
    
    def get_active_model_info(self, complexity: str = "medium", code_files: int = 0, total_lines: int = 0) -> Dict[str, any]:
        """
        Get information about the currently active model and provider.
        Selects optimal model based on task complexity.
        
        Args:
            complexity: "simple", "medium", "complex"
            code_files: number of code files
            total_lines: total lines of code
        
        Returns:
            Dict with provider, model name, and metadata
        """
        # Determine active provider (Ollama is priority)
        active_provider = None
        if "ollama" in self.providers:
            active_provider = "ollama"
        elif self.default_provider_name in self.providers:
            active_provider = self.default_provider_name
        elif self.providers:
            active_provider = list(self.providers.keys())[0]
        
        if not active_provider:
            return {
                "provider": None,
                "model": None,
                "reason": "Нет доступных провайдеров"
            }
        
        provider = self.providers[active_provider]
        
        # Smart model selection based on complexity
        model_name = None
        if active_provider == "ollama" and hasattr(provider, 'select_model_for_complexity'):
            model_name = provider.select_model_for_complexity(complexity, code_files, total_lines)
        elif hasattr(provider, 'default_model'):
            model_name = provider.default_model
        elif hasattr(provider, 'model'):
            model_name = provider.model
        
        return {
            "provider": active_provider,
            "model": model_name,
            "is_local": active_provider == "ollama",
            "available_models": provider.get_available_models() if hasattr(provider, 'get_available_models') else [],
            "reason": self._get_model_selection_reason(active_provider, model_name)
        }
    
    def _get_model_selection_reason(self, provider: str, model: str) -> str:
        """Generate human-readable reason for model selection."""
        if provider == "ollama":
            return f"Локальная модель {model or 'Ollama'} — приоритет для приватности и скорости"
        elif provider == "openai":
            return f"OpenAI {model or 'GPT'} — облачная модель для сложных задач"
        elif provider == "anthropic":
            return f"Anthropic {model or 'Claude'} — облачная модель с расширенными возможностями"
        else:
            return f"Модель {model or provider}"
    
    async def generate_batch(
        self,
        requests: List[Tuple[List[LLMMessage], Optional[Dict]]],
        max_concurrent: int = 5,
        provider_name: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.7,
        **kwargs
    ) -> List[LLMResponse]:
        """
        Execute multiple LLM requests in parallel with concurrency limit.
        
        More efficient than sequential calls for multiple independent requests.
        
        Args:
            requests: List of (messages, extra_kwargs) tuples
            max_concurrent: Maximum concurrent requests (default 5)
            provider_name: Provider to use
            model: Model name
            temperature: Temperature setting
            **kwargs: Additional parameters for all requests
            
        Returns:
            List of LLMResponses in the same order as requests
        """
        if not requests:
            return []
        
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def process_request(idx: int, messages: List[LLMMessage], extra_kwargs: Optional[Dict]) -> Tuple[int, LLMResponse]:
            async with semaphore:
                merged_kwargs = {**kwargs}
                if extra_kwargs:
                    merged_kwargs.update(extra_kwargs)
                
                try:
                    response = await self.generate(
                        messages=messages,
                        provider_name=provider_name,
                        model=model,
                        temperature=temperature,
                        **merged_kwargs
                    )
                    return (idx, response)
                except Exception as e:
                    logger.warning(f"Batch request {idx} failed: {e}")
                    # Return error response
                    return (idx, LLMResponse(
                        content=f"Error: {str(e)}",
                        model=model or "unknown",
                        provider=provider_name or self.default_provider_name,
                        usage={}
                    ))
        
        # Create tasks preserving order
        tasks = [
            process_request(idx, msgs, extra)
            for idx, (msgs, extra) in enumerate(requests)
        ]
        
        # Execute concurrently
        results = await asyncio.gather(*tasks)
        
        # Sort by index and return responses
        results.sort(key=lambda x: x[0])
        return [r[1] for r in results]

