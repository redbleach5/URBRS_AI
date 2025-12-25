"""
Ollama LLM Provider (Local models)
"""

import httpx
import json
import re
import time
from typing import List, Optional, AsyncIterator, Dict, Any
from ..core.logger import get_logger
logger = get_logger(__name__)

from .base import BaseLLMProvider, LLMMessage, LLMResponse
from ..core.exceptions import LLMException
from ..core.model_performance_tracker import get_performance_tracker


class OllamaProvider(BaseLLMProvider):
    """Ollama local models provider"""
    
    def __init__(self, config: dict):
        super().__init__(config)
        self.base_url = config.get("base_url", "http://localhost:11434")
        self.auto_detect_models = config.get("auto_detect_models", True)
        self.recommended_models = config.get("recommended_models", {})
        self.client: Optional[httpx.AsyncClient] = None
        self._available_models: List[str] = []
    
    async def initialize(self) -> None:
        """Initialize Ollama client and detect available models
        
        Оптимизировано для работы с 30+ моделями 60B+ параметров:
        - Connection pooling (50 keepalive, 100 max connections)
        - HTTP/2 для лучшей производительности
        - AdvancedCache для многоуровневого кэширования
        """
        # Инициализируем AdvancedCache
        cache_config = self.config.get("cache", {})
        from ..core.advanced_cache import AdvancedCache
        self.advanced_cache = AdvancedCache(
            memory_size=cache_config.get("memory_size", 2000),  # Больше для 30 моделей
            disk_cache_dir=cache_config.get("disk_cache_dir", "cache/ollama"),
            redis_url=cache_config.get("redis_url"),
            ttl=cache_config.get("ttl", 7200)  # 2 часа для больших моделей
        )
        
        # Try to use HTTP/2 if available, fall back to HTTP/1.1
        use_http2 = True
        try:
            # HTTP client с оптимизированным connection pooling для 30 моделей
            # Try HTTP/2 first for better performance
            self.client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout,
                limits=httpx.Limits(
                    max_keepalive_connections=50,  # Увеличено для 30 моделей
                    max_connections=100,  # Достаточно для параллельных запросов
                    keepalive_expiry=30.0  # Держим соединения открытыми
                ),
                http2=True  # HTTP/2 для лучшей производительности
            )
        except Exception as e:
            # If HTTP/2 fails (e.g., h2 package not installed), fall back to HTTP/1.1
            if "h2" in str(e).lower() or "http2" in str(e).lower():
                logger.info("HTTP/2 not available (h2 package not installed), using HTTP/1.1")
                use_http2 = False
                self.client = httpx.AsyncClient(
                    base_url=self.base_url,
                    timeout=self.timeout,
                    limits=httpx.Limits(
                        max_keepalive_connections=50,
                        max_connections=100,
                        keepalive_expiry=30.0
                    ),
                    http2=False
                )
            else:
                # Re-raise if it's a different error
                raise
        
        try:
            # Test connection
            response = await self.client.get("/api/tags")
            if response.status_code == 200:
                data = response.json()
                self._available_models = [model["name"] for model in data.get("models", [])]
                logger.info(f"Ollama provider initialized with {len(self._available_models)} models")
            else:
                logger.warning("Ollama server not responding, but provider initialized")
                self._available_models = []
            
            # Set default model if not set or not available
            if not self.default_model or (self.default_model and self.default_model not in self._available_models):
                if self._available_models:
                    # Try to find model from recommended_models (priority for chat)
                    fallback_model = None
                    
                    # First try to find model from recommended_models for chat
                    if self.recommended_models and "chat" in self.recommended_models:
                        for recommended in self.recommended_models["chat"]:
                            # Support partial matching (e.g., "gemma3" matches "gemma3:1b")
                            for available in self._available_models:
                                if recommended in available or available.startswith(recommended):
                                    fallback_model = available
                                    break
                            if fallback_model:
                                break
                    
                    # If not found in chat, try other categories
                    if not fallback_model and self.recommended_models:
                        for category, models in self.recommended_models.items():
                            if category == "chat":
                                continue  # Already checked
                            for recommended in models:
                                for available in self._available_models:
                                    if recommended in available or available.startswith(recommended):
                                        fallback_model = available
                                        break
                                if fallback_model:
                                    break
                            if fallback_model:
                                break
                    
                    # If not found in recommended, use first available
                    if not fallback_model:
                        fallback_model = self._available_models[0]
                    
                    if self.default_model:
                        logger.warning(
                            f"Default model '{self.default_model}' not available. "
                            f"Using '{fallback_model}' instead."
                        )
                    else:
                        logger.info(f"Auto-detected default model: '{fallback_model}'")
                    self.default_model = fallback_model
        except Exception as e:
            logger.warning(f"Failed to connect to Ollama: {e}")
            # Still initialize, but models won't be available
            # Use HTTP/1.1 if HTTP/2 was not available, otherwise use the same protocol
            try:
                self.client = httpx.AsyncClient(
                    base_url=self.base_url,
                    timeout=self.timeout,
                    limits=httpx.Limits(
                        max_keepalive_connections=50,
                        max_connections=100,
                        keepalive_expiry=30.0
                    ),
                    http2=use_http2
                )
            except Exception:
                # If HTTP/2 still fails, use HTTP/1.1
                self.client = httpx.AsyncClient(
                    base_url=self.base_url,
                    timeout=self.timeout,
                    limits=httpx.Limits(
                        max_keepalive_connections=50,
                        max_connections=100,
                        keepalive_expiry=30.0
                    ),
                    http2=False
                )
    
    async def shutdown(self) -> None:
        """Shutdown Ollama client"""
        if self.client:
            await self.client.aclose()
    
    def _select_best_model(self, task_type: Optional[str] = None, model: Optional[str] = None) -> str:
        """
        Умный выбор лучшей Ollama модели на основе типа задачи
        
        Args:
            task_type: Тип задачи (code, chat, analysis, reasoning)
            model: Предпочтительная модель (если указана, используется)
            
        Returns:
            Имя модели для использования
        """
        if model and model in self._available_models:
            return model
        
        if model and not self._available_models:
            # Если модели еще не загружены, возвращаем запрошенную
            return model
        
        # Если нет доступных моделей, используем default
        if not self._available_models:
            return self.default_model
        
        # Умный выбор на основе типа задачи
        if task_type and self.recommended_models:
            recommended = self.recommended_models.get(task_type, [])
            for rec_model in recommended:
                if rec_model in self._available_models:
                    logger.debug(f"Selected recommended model '{rec_model}' for task type '{task_type}'")
                    return rec_model
        
        # Fallback: используем первую доступную или default
        if self.default_model in self._available_models:
            return self.default_model
        
        return self._available_models[0]
    
    def _check_thinking_support(self, model_name: str) -> bool:
        """
        Проверяет, поддерживает ли модель нативный thinking mode
        
        Args:
            model_name: Имя модели
            
        Returns:
            True если модель поддерживает thinking mode
        """
        # Модели, которые поддерживают нативный thinking mode в Ollama
        # (обновляется по мере добавления поддержки в Ollama)
        thinking_models = [
            "llama3.3",  # Llama 3.3 и новее поддерживают thinking
            "llama3.2",  # Llama 3.2 может поддерживать
            "qwen2.5",   # Qwen 2.5 поддерживает reasoning
            "deepseek",  # DeepSeek модели поддерживают thinking
        ]
        
        # Проверяем, содержит ли имя модели ключевые слова
        model_lower = model_name.lower()
        return any(thinking_model.lower() in model_lower for thinking_model in thinking_models)
    
    def _parse_ndjson_response(self, response_text: str) -> Optional[Dict[str, Any]]:
        """
        Parse NDJSON (Newline Delimited JSON) response from Ollama.
        Ollama streaming responses contain multiple JSON objects separated by newlines.
        
        Args:
            response_text: Raw response text containing NDJSON
            
        Returns:
            Merged response dict with combined content, or None if parsing fails
        """
        content_parts = []
        final_data = None
        
        for line in response_text.strip().split('\n'):
            line = line.strip()
            if not line:
                continue
            
            try:
                obj = json.loads(line)
                if isinstance(obj, dict):
                    # Extract content from message
                    if "message" in obj and isinstance(obj["message"], dict):
                        msg_content = obj["message"].get("content", "")
                        if msg_content:
                            content_parts.append(msg_content)
                    elif "content" in obj:
                        content_parts.append(obj["content"])
                    # Keep the last object for metadata (done, model, eval_count, etc.)
                    final_data = obj
            except json.JSONDecodeError:
                continue
        
        if content_parts and final_data:
            # Combine all content parts
            combined_content = "".join(content_parts)
            if "message" in final_data and isinstance(final_data["message"], dict):
                final_data["message"]["content"] = combined_content
            else:
                final_data["message"] = {"content": combined_content}
            logger.debug(f"Parsed {len(content_parts)} NDJSON chunks")
            return final_data
        
        if final_data:
            return final_data
        
        # Fallback: try regex extraction for malformed responses
        return self._extract_content_regex(response_text)
    
    def _extract_content_regex(self, text: str) -> Optional[Dict[str, Any]]:
        """
        Fallback content extraction using regex for malformed JSON.
        
        Args:
            text: Raw response text
            
        Returns:
            Dict with extracted content or None
        """
        patterns = [
            r'"message"\s*:\s*\{[^}]*"content"\s*:\s*"((?:[^"\\]|\\.)*)"',
            r'"content"\s*:\s*"((?:[^"\\]|\\.)*)"',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.DOTALL)
            if match:
                content = match.group(1)
                # Decode escape sequences
                content = content.replace('\\n', '\n').replace('\\t', '\t')
                content = content.replace('\\"', '"').replace('\\\\', '\\')
                logger.debug("Extracted content using regex fallback")
                return {"message": {"content": content}}
        
        return None
    
    def _enhance_prompt_for_thinking(self, messages: List[LLMMessage], thinking_mode: bool, model_name: str) -> List[LLMMessage]:
        """
        Подготавливает промпты для thinking mode
        
        Если модель поддерживает нативный thinking mode, использует минимальные инструкции.
        Иначе использует расширенную эмуляцию через промпты.
        
        Args:
            messages: Исходные сообщения
            thinking_mode: Включить thinking mode
            model_name: Имя модели для проверки поддержки
            
        Returns:
            Обновленные сообщения с thinking инструкциями
        """
        if not thinking_mode:
            return messages
        
        # Проверяем поддержку нативного thinking mode
        supports_native_thinking = self._check_thinking_support(model_name)
        
        if supports_native_thinking:
            # Минимальные инструкции для моделей с нативной поддержкой
            thinking_instructions = """\n\nUse your built-in thinking capabilities to reason through this problem step by step before providing your answer."""
            logger.debug(f"Model {model_name} supports native thinking mode")
        else:
            # Расширенная эмуляция для моделей без нативной поддержки
            thinking_instructions = """\n\nIMPORTANT: Use deep reasoning and step-by-step thinking. Before responding, think through:
1. What is the core problem or question?
2. What are the key factors to consider?
3. What are the possible approaches or solutions?
4. What are the pros and cons of each approach?
5. What is the best solution and why?

Show your reasoning process clearly. Think deeply before providing your final answer."""
            logger.debug(f"Model {model_name} does not support native thinking, using emulation")
        
        enhanced_messages = []
        for msg in messages:
            if msg.role == "system":
                # Добавляем thinking инструкции к системному промпту
                enhanced_content = msg.content + thinking_instructions
                enhanced_messages.append(LLMMessage(role=msg.role, content=enhanced_content))
            else:
                enhanced_messages.append(msg)
        
        # Если нет системного сообщения, добавляем его
        if not any(msg.role == "system" for msg in messages):
            enhanced_messages.insert(0, LLMMessage(
                role="system",
                content=f"You are an AI assistant with exceptional reasoning capabilities.{thinking_instructions}"
            ))
        
        return enhanced_messages
    
    async def generate(
        self,
        messages: List[LLMMessage],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        thinking_mode: bool = False,
        **kwargs
    ) -> LLMResponse:
        """Generate response from Ollama"""
        if not self.client:
            raise LLMException("Ollama client not initialized")
        
        # Performance tracking
        tracker = get_performance_tracker()
        start_time = time.time()
        
        # Check cache
        cache_key = self._get_cache_key(messages, model, temperature, **kwargs)
        cached = await self._get_cached(cache_key)
        if cached:
            return LLMResponse(
                content=cached,
                model=model or self.default_model,
                metadata={"cached": True, "provider": "ollama"}
            )
        
        # Умный выбор модели на основе типа задачи
        task_type = kwargs.get("task_type")  # code, chat, analysis, reasoning
        model_name = self._select_best_model(task_type=task_type, model=model)
        
        # Подготавливаем промпты для thinking mode
        # Используем нативную поддержку если доступна, иначе эмуляцию
        enhanced_messages = self._enhance_prompt_for_thinking(messages, thinking_mode, model_name)
        if thinking_mode:
            supports_native = self._check_thinking_support(model_name)
            mode_type = "native" if supports_native else "emulated"
            logger.debug(f"Using {mode_type} thinking mode for Ollama model {model_name}")
        
        try:
            # Convert messages to Ollama format
            # Ollama uses a single prompt string or messages array
            ollama_messages = [
                {"role": msg.role, "content": msg.content}
                for msg in enhanced_messages
            ]
            
            request_data = {
                "model": model_name,
                "messages": ollama_messages,
                "options": {
                    "temperature": temperature,
                    **kwargs
                }
            }
            
            # Добавляем нативный thinking mode параметр, если модель поддерживает
            # Ollama API может поддерживать параметр "thinking" для моделей с нативной поддержкой
            if thinking_mode and self._check_thinking_support(model_name):
                # Пробуем добавить нативный thinking параметр
                # Формат может варьироваться в зависимости от версии Ollama API
                thinking_budget = kwargs.get("thinking_budget_tokens", 4096)
                
                # Вариант 1: Параметр на верхнем уровне (если поддерживается)
                if "thinking" not in request_data:
                    request_data["thinking"] = {
                        "enabled": True,
                        "budget_tokens": thinking_budget
                    }
                    logger.debug(f"Added native thinking parameter for {model_name}")
                
                # Вариант 2: Параметр в options (альтернативный формат)
                # Некоторые версии Ollama могут требовать thinking в options
                if "thinking" not in request_data.get("options", {}):
                    request_data.setdefault("options", {})["thinking"] = True
                    request_data["options"]["thinking_budget"] = thinking_budget
            
            if max_tokens:
                request_data["options"]["num_predict"] = max_tokens
            
            response = await self.client.post("/api/chat", json=request_data)
            response.raise_for_status()
            
            # Безопасный парсинг JSON с обработкой ошибок
            response_text = response.text
            
            # Инициализируем переменные
            data = None
            content = ""
            
            try:
                # Try standard parsing first
                data = response.json()
            except json.JSONDecodeError as json_error:
                # Ollama returns NDJSON (Newline Delimited JSON) for streaming-like responses
                # Optimized parsing using efficient NDJSON approach
                logger.debug(f"Standard JSON failed, parsing as NDJSON: {json_error}")
                
                data = self._parse_ndjson_response(response_text)
            
            # Извлекаем content с дополнительной проверкой
            if data:
                # Стандартный путь: message.content
                if isinstance(data, dict):
                    if "message" in data and isinstance(data["message"], dict):
                        content = data["message"].get("content", "")
                    elif "content" in data:
                        content = data["content"]
                    else:
                        # Ищем content в любой вложенной структуре
                        for key, value in data.items():
                            if isinstance(value, dict) and "content" in value:
                                content = value["content"]
                                break
                            elif isinstance(value, str) and len(value) > 10 and key != "model":
                                # Используем строковое значение как контент, если оно достаточно длинное
                                content = value
                                break
            
            # Если все еще нет content, используем fallback методы
            if not content or len(content) < 5:
                logger.warning("Could not extract meaningful content from Ollama response, using fallback")
                # Пробуем извлечь любой осмысленный текст из response_text
                lines = response_text.split('\n')
                for line in lines:
                    line = line.strip()
                    # Пропускаем JSON структуру и метаданные
                    if (line and not line.startswith('{') and 
                        '"model"' not in line and 
                        '"done"' not in line and
                        len(line) > 10):
                        content = line
                        break
                
                if not content:
                    # Последняя попытка - используем весь текст, очищенный от JSON
                    cleaned_text = re.sub(r'\{[^}]*\}', '', response_text)
                    cleaned_text = re.sub(r'["{}]', '', cleaned_text).strip()
                    if cleaned_text and len(cleaned_text) > 5:
                        content = cleaned_text
                    else:
                        content = "Ошибка: не удалось извлечь ответ от модели"
                        logger.error(f"Failed to extract content from Ollama response. Raw response: {response_text[:200]}")
            
            # Cache response
            self._set_cached(cache_key, content)
            
            # Формируем usage в правильном формате (словарь, а не число)
            usage_dict = None
            if data and isinstance(data, dict):
                eval_count = data.get("eval_count", 0)
                prompt_eval_count = data.get("prompt_eval_count", 0)
                if eval_count or prompt_eval_count:
                    usage_dict = {
                        "prompt_tokens": int(prompt_eval_count) if prompt_eval_count else 0,
                        "completion_tokens": int(eval_count) if eval_count else 0,
                        "total_tokens": int(prompt_eval_count + eval_count) if (prompt_eval_count or eval_count) else 0
                    }
            
            # Извлекаем thinking content из ответа
            thinking_content = None
            supports_native = self._check_thinking_support(model_name)
            
            if thinking_mode:
                # Для моделей с нативной поддержкой thinking mode
                # Ollama может возвращать thinking в отдельном поле ответа
                if data and isinstance(data, dict):
                    # Проверяем наличие thinking в ответе
                    if "thinking" in data:
                        thinking_content = data["thinking"]
                    elif "message" in data and isinstance(data["message"], dict):
                        if "thinking" in data["message"]:
                            thinking_content = data["message"]["thinking"]
                    
                    # Если thinking не найден в структурированном ответе,
                    # пытаемся извлечь из content (для эмуляции или моделей без нативной поддержки)
                    if not thinking_content and content:
                        reasoning_markers = [
                            "Let me think", "Thinking:", "Reasoning:", "Analysis:",
                            "Думаю:", "Рассуждение:", "Анализ:", "<think>", "</think>"
                        ]
                        for marker in reasoning_markers:
                            if marker.lower() in content.lower():
                                # Найдено reasoning в ответе
                                marker_pos = content.lower().find(marker.lower())
                                # Извлекаем thinking блок (до следующего маркера или до конца)
                                end_marker = content.lower().find("</think>", marker_pos)
                                if end_marker > marker_pos:
                                    thinking_content = content[marker_pos:end_marker + 8]
                                else:
                                    # Берем следующий абзац как thinking
                                    next_para = content.find("\n\n", marker_pos)
                                    if next_para > marker_pos:
                                        thinking_content = content[marker_pos:next_para]
                                    else:
                                        thinking_content = content[marker_pos:marker_pos + 500]
                                break
            
            # Record successful request metrics
            duration = time.time() - start_time
            total_tokens = usage_dict.get("total_tokens", 0) if usage_dict else 0
            tracker.record_request(
                provider="ollama",
                model=model_name,
                duration=duration,
                tokens=total_tokens,
                success=True
            )
            
            return LLMResponse(
                content=content,
                model=model_name,
                usage=usage_dict,
                finish_reason=data.get("done_reason") if data and isinstance(data, dict) else None,
                metadata={
                    "provider": "ollama",
                    "done": data.get("done", False) if data and isinstance(data, dict) else False,
                    "thinking_mode": thinking_mode,
                    "thinking_native": supports_native,  # Указываем, используется ли нативный thinking
                    "thinking_emulated": thinking_mode and not supports_native  # Эмуляция только если не нативный
                },
                thinking=thinking_content,
                has_thinking=thinking_content is not None
            )
        except httpx.HTTPError as e:
            # Record failed request
            duration = time.time() - start_time
            tracker.record_request(
                provider="ollama",
                model=model or self.default_model,
                duration=duration,
                tokens=0,
                success=False,
                error_type="HTTPError"
            )
            raise LLMException(f"Ollama API error: {e}") from e
        except Exception as e:
            # Record failed request
            duration = time.time() - start_time
            tracker.record_request(
                provider="ollama",
                model=model or self.default_model,
                duration=duration,
                tokens=0,
                success=False,
                error_type=type(e).__name__
            )
            raise LLMException(f"Ollama error: {e}") from e
    
    async def stream(
        self,
        messages: List[LLMMessage],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        thinking_mode: bool = False,
        **kwargs
    ) -> AsyncIterator[str]:
        """Stream response from Ollama"""
        if not self.client:
            raise LLMException("Ollama client not initialized")
        
        model_name = model or self.default_model
        
        try:
            ollama_messages = [
                {"role": msg.role, "content": msg.content}
                for msg in messages
            ]
            
            request_data = {
                "model": model_name,
                "messages": ollama_messages,
                "stream": True,
                "options": {
                    "temperature": temperature,
                    **kwargs
                }
            }
            
            if max_tokens:
                request_data["options"]["num_predict"] = max_tokens
            
            async with self.client.stream("POST", "/api/chat", json=request_data) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line:
                        try:
                            # Пробуем парсить как JSON
                            data = json.loads(line)
                            if "message" in data and "content" in data["message"]:
                                yield data["message"]["content"]
                        except json.JSONDecodeError:
                            # Если не JSON, пробуем извлечь текст
                            json_match = re.search(r'\{.*"content".*\}', line, re.DOTALL)
                            if json_match:
                                try:
                                    data = json.loads(json_match.group())
                                    if "message" in data and "content" in data["message"]:
                                        yield data["message"]["content"]
                                except:
                                    # Если не получилось, пропускаем строку
                                    continue
                            else:
                                # Если похоже на текст, возвращаем как есть
                                if line.strip() and not line.startswith('{'):
                                    yield line
                                continue
        except httpx.HTTPError as e:
            raise LLMException(f"Ollama streaming error: {e}") from e
        except Exception as e:
            raise LLMException(f"Ollama streaming error: {e}") from e
    
    async def list_models(self) -> List[str]:
        """List available Ollama models"""
        if not self.client:
            return []
        
        if self._available_models:
            return self._available_models
        
        try:
            response = await self.client.get("/api/tags")
            if response.status_code == 200:
                data = response.json()
                self._available_models = [model["name"] for model in data.get("models", [])]
                return self._available_models
        except Exception as e:
            logger.warning(f"Failed to list Ollama models: {e}")
        
        # Return recommended models as fallback
        all_recommended = []
        if self.recommended_models:
            for category, models in self.recommended_models.items():
                all_recommended.extend(models)
        return list(set(all_recommended)) if all_recommended else ["llama2"]

