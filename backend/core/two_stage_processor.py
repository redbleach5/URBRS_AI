"""
TwoStageProcessor - Двухэтапная обработка
Быстрая модель для предобработки, мощная для финальных решений
"""

from typing import Dict, Any, Optional, Callable
import asyncio
from enum import Enum
from dataclasses import dataclass
from .logger import get_logger
logger = get_logger(__name__)

from ..llm.providers import LLMProviderManager
from ..llm.base import LLMMessage


class ProcessingStage(Enum):
    """Этапы обработки"""
    FAST_PREPROCESSING = "fast_preprocessing"
    POWERFUL_PROCESSING = "powerful_processing"
    COMPLETED = "completed"
    ERROR = "error"


@dataclass
class ProcessingResult:
    """Результат обработки"""
    stage: ProcessingStage
    data: Dict[str, Any]
    metadata: Dict[str, Any] = None
    error: Optional[str] = None


class TwoStageProcessor:
    """
    Двухэтапный процессор:
    1. Быстрая модель - предобработка, классификация, фильтрация
    2. Мощная модель - финальные решения, генерация, анализ
    """
    
    # Паттерны быстрых моделей (приоритет от наименьшей к большей)
    FAST_MODEL_PATTERNS = [
        ":0.5b", ":1b", ":1.5b", ":2b", ":3b", ":4b",
        "mini", "tiny", "small", "nano", "micro"
    ]
    
    # Паттерны мощных моделей (приоритет от большей к меньшей)
    POWERFUL_MODEL_PATTERNS = [
        ":405b", ":236b", ":123b", ":70b", ":72b", ":65b",
        ":34b", ":32b", ":27b", ":22b", ":14b", ":13b", ":12b", ":11b", ":8b", ":7b"
    ]
    
    def __init__(
        self,
        llm_manager: Optional[LLMProviderManager] = None,
        fast_provider: Optional[str] = None,
        powerful_provider: Optional[str] = None,
        progress_callback: Optional[Callable[[ProcessingStage, Dict[str, Any]], None]] = None
    ):
        """
        Args:
            llm_manager: Менеджер LLM провайдеров
            fast_provider: Имя быстрого провайдера (по умолчанию определяется автоматически)
            powerful_provider: Имя мощного провайдера (по умолчанию определяется автоматически)
            progress_callback: Callback для уведомления о прогрессе
        """
        self.llm_manager = llm_manager
        self.progress_callback = progress_callback
        
        # Определяем провайдеры
        if llm_manager:
            self.fast_provider = fast_provider or self._find_fast_provider()
            self.powerful_provider = powerful_provider or self._find_powerful_provider()
        else:
            self.fast_provider = None
            self.powerful_provider = None
        
        # Кэш для моделей
        self._fast_model_cache: Optional[str] = None
        self._powerful_model_cache: Optional[str] = None
    
    def _find_fast_provider(self) -> Optional[str]:
        """Находит быстрый провайдер"""
        if not self.llm_manager:
            return None
        
        # Приоритет: ollama (локальные модели быстрее)
        if "ollama" in self.llm_manager.providers:
            return "ollama"
        elif self.llm_manager.providers:
            return list(self.llm_manager.providers.keys())[0]
        return None
    
    def _find_powerful_provider(self) -> Optional[str]:
        """Находит мощный провайдер"""
        if not self.llm_manager:
            return None
        
        # Приоритет: ollama (может использовать более мощные модели)
        if "ollama" in self.llm_manager.providers:
            return "ollama"
        elif self.llm_manager.providers:
            return list(self.llm_manager.providers.keys())[0]
        return None
    
    async def _get_fast_model(self) -> Optional[str]:
        """Находит быструю модель для первого этапа обработки"""
        if self._fast_model_cache:
            return self._fast_model_cache
        
        if not self.llm_manager or self.fast_provider != "ollama":
            return None
        
        try:
            ollama_provider = self.llm_manager.providers.get("ollama")
            if not ollama_provider:
                return None
            
            available_models = await ollama_provider.list_models()
            if not available_models:
                return None
            
            # Ищем маленькую модель по паттернам
            for pattern in self.FAST_MODEL_PATTERNS:
                for model in available_models:
                    name = model.get("name", "").lower()
                    if pattern in name:
                        self._fast_model_cache = model.get("name")
                        logger.info(f"TwoStageProcessor: found fast model: {self._fast_model_cache}")
                        return self._fast_model_cache
            
            # Ищем по размеру < 10GB
            for model in available_models:
                size = model.get("size", 0)
                if size and size < 10 * 1024 * 1024 * 1024:
                    self._fast_model_cache = model.get("name")
                    logger.info(f"TwoStageProcessor: found small model by size: {self._fast_model_cache}")
                    return self._fast_model_cache
            
            return None
        except Exception as e:
            logger.debug(f"Could not find fast model: {e}")
            return None
    
    async def _get_powerful_model(self) -> Optional[str]:
        """Находит мощную модель для второго этапа обработки"""
        if self._powerful_model_cache:
            return self._powerful_model_cache
        
        if not self.llm_manager or self.powerful_provider != "ollama":
            return None
        
        try:
            ollama_provider = self.llm_manager.providers.get("ollama")
            if not ollama_provider:
                return None
            
            available_models = await ollama_provider.list_models()
            if not available_models:
                return None
            
            # Ищем большую модель по паттернам (от самых больших)
            for pattern in self.POWERFUL_MODEL_PATTERNS:
                for model in available_models:
                    name = model.get("name", "").lower()
                    if pattern in name:
                        self._powerful_model_cache = model.get("name")
                        logger.info(f"TwoStageProcessor: found powerful model: {self._powerful_model_cache}")
                        return self._powerful_model_cache
            
            # Ищем по размеру > 15GB
            largest_model = None
            largest_size = 0
            for model in available_models:
                size = model.get("size", 0)
                if size and size > largest_size:
                    largest_size = size
                    largest_model = model.get("name")
            
            if largest_model:
                self._powerful_model_cache = largest_model
                logger.info(f"TwoStageProcessor: using largest model: {self._powerful_model_cache}")
                return self._powerful_model_cache
            
            return None
        except Exception as e:
            logger.debug(f"Could not find powerful model: {e}")
            return None
    
    async def process(
        self,
        task: str,
        fast_analysis: Optional[Callable[[str], Dict[str, Any]]] = None,
        powerful_processing: Optional[Callable[[str, Dict[str, Any]], Dict[str, Any]]] = None
    ) -> ProcessingResult:
        """
        Двухэтапная обработка задачи
        
        Args:
            task: Задача для обработки
            fast_analysis: Функция для анализа через быструю модель (опционально)
            powerful_processing: Функция для обработки через мощную модель (опционально)
        
        Returns:
            ProcessingResult с результатом обработки
        """
        if not self.llm_manager:
            return ProcessingResult(
                stage=ProcessingStage.ERROR,
                data={},
                error="LLM manager недоступен"
            )
        
        try:
            # Этап 1: Быстрая предобработка
            await self._notify_progress(ProcessingStage.FAST_PREPROCESSING, {
                "message": "Анализирую задачу...",
                "task": task[:100]
            })
            
            fast_result = await self._fast_preprocessing(
                task,
                fast_analysis
            )
            
            if fast_result.get("error"):
                return ProcessingResult(
                    stage=ProcessingStage.ERROR,
                    data=fast_result,
                    error=fast_result["error"]
                )
            
            # Этап 2: Мощная обработка
            await self._notify_progress(ProcessingStage.POWERFUL_PROCESSING, {
                "message": "Выполняю задачу...",
                "analysis": fast_result
            })
            
            powerful_result = await self._powerful_processing(
                task,
                fast_result,
                powerful_processing
            )
            
            if powerful_result.get("error"):
                return ProcessingResult(
                    stage=ProcessingStage.ERROR,
                    data=powerful_result,
                    error=powerful_result["error"]
                )
            
            # Объединяем результаты
            final_result = {
                "fast_analysis": fast_result,
                "powerful_result": powerful_result,
                "task": task
            }
            
            await self._notify_progress(ProcessingStage.COMPLETED, final_result)
            
            return ProcessingResult(
                stage=ProcessingStage.COMPLETED,
                data=final_result,
                metadata={
                    "fast_provider": self.fast_provider,
                    "powerful_provider": self.powerful_provider
                }
            )
            
        except Exception as e:
            logger.error(f"Two-stage processing error: {e}")
            return ProcessingResult(
                stage=ProcessingStage.ERROR,
                data={},
                error=str(e)
            )
    
    async def _fast_preprocessing(
        self,
        task: str,
        custom_analysis: Optional[Callable[[str], Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """Быстрая предобработка через быструю модель"""
        if custom_analysis:
            return await custom_analysis(task)
        
        if not self.fast_provider:
            return {
                "error": "Быстрый провайдер недоступен",
                "task_type": "unknown",
                "complexity": "medium"
            }
        
        # Находим быструю модель
        fast_model = await self._get_fast_model()
        
        # Стандартный анализ задачи
        prompt = f"""Проанализируй задачу и определи:
1. Тип задачи (coding, analysis, question, etc.)
2. Сложность (simple, medium, complex)
3. Ключевые требования
4. Рекомендуемый подход

Задача: {task}

Ответ в формате JSON:
{{
    "task_type": "тип",
    "complexity": "сложность",
    "requirements": ["требование1", "требование2"],
    "approach": "краткое описание подхода"
}}"""
        
        try:
            messages = [
                LLMMessage(role="system", content="Ты - эксперт по анализу задач. Отвечай только в формате JSON."),
                LLMMessage(role="user", content=prompt)
            ]
            
            # Генерируем с указанием быстрой модели (если найдена)
            generation_kwargs = {
                "messages": messages,
                "provider_name": self.fast_provider,
                "temperature": 0.2,
                "max_tokens": 300
            }
            if fast_model:
                generation_kwargs["model"] = fast_model
                logger.debug(f"Using fast model for preprocessing: {fast_model}")
            
            response = await asyncio.wait_for(
                self.llm_manager.generate(**generation_kwargs),
                timeout=5.0  # Быстрая модель должна отвечать быстро
            )
            
            if response and response.content:
                # Парсим JSON из ответа
                import json
                content = response.content.strip()
                json_start = content.find('{')
                json_end = content.rfind('}') + 1
                
                if json_start >= 0 and json_end > json_start:
                    analysis = json.loads(content[json_start:json_end])
                    return {
                        "task_type": analysis.get("task_type", "unknown"),
                        "complexity": analysis.get("complexity", "medium"),
                        "requirements": analysis.get("requirements", []),
                        "approach": analysis.get("approach", ""),
                        "provider": self.fast_provider
                    }
            
            return {
                "task_type": "unknown",
                "complexity": "medium",
                "requirements": [],
                "approach": "",
                "provider": self.fast_provider
            }
            
        except Exception as e:
            logger.warning(f"Fast preprocessing failed: {e}")
            return {
                "error": str(e),
                "task_type": "unknown",
                "complexity": "medium"
            }
    
    async def _powerful_processing(
        self,
        task: str,
        fast_analysis: Dict[str, Any],
        custom_processing: Optional[Callable[[str, Dict[str, Any]], Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """Мощная обработка через мощную модель"""
        if custom_processing:
            return await custom_processing(task, fast_analysis)
        
        if not self.powerful_provider:
            return {
                "error": "Мощный провайдер недоступен",
                "result": "Не удалось обработать задачу"
            }
        
        # Формируем промпт с учетом анализа быстрой модели
        prompt = f"""На основе анализа задачи выполни её.

Анализ задачи:
- Тип: {fast_analysis.get('task_type', 'unknown')}
- Сложность: {fast_analysis.get('complexity', 'medium')}
- Требования: {', '.join(fast_analysis.get('requirements', []))}
- Подход: {fast_analysis.get('approach', '')}

Задача: {task}

Выполни задачу и предоставь результат."""
        
        try:
            messages = [
                LLMMessage(role="system", content="Ты - опытный AI ассистент. Выполняй задачи качественно и полностью."),
                LLMMessage(role="user", content=prompt)
            ]
            
            response = await asyncio.wait_for(
                self.llm_manager.generate(
                    messages=messages,
                    provider_name=self.powerful_provider,
                    temperature=0.7,
                    max_tokens=2000
                ),
                timeout=120.0  # Мощная модель может работать дольше
            )
            
            if response and response.content:
                return {
                    "result": response.content,
                    "provider": self.powerful_provider,
                    "analysis_used": fast_analysis
                }
            
            return {
                "error": "Пустой ответ от мощной модели",
                "result": ""
            }
            
        except Exception as e:
            logger.error(f"Powerful processing failed: {e}")
            return {
                "error": str(e),
                "result": ""
            }
    
    async def _notify_progress(self, stage: ProcessingStage, data: Dict[str, Any]):
        """Уведомляет о прогрессе обработки"""
        if self.progress_callback:
            try:
                if asyncio.iscoroutinefunction(self.progress_callback):
                    await self.progress_callback(stage, data)
                else:
                    self.progress_callback(stage, data)
            except Exception as e:
                logger.warning(f"Progress callback error: {e}")

