"""
ResearchAgent - Researches codebase and analyzes requirements
"""

from typing import Dict, Any
from ..core.logger import get_logger
logger = get_logger(__name__)

from .base import BaseAgent
from .multimodal_mixin import MultimodalMixin
from .fact_checker_mixin import FactCheckerMixin, FactCheckResult
from ..llm.base import LLMMessage
from ..core.exceptions import AgentException


class ResearchAgent(BaseAgent, MultimodalMixin, FactCheckerMixin):
    """Agent for researching codebase and analyzing requirements.
    
    Features:
    - Web search integration
    - Multimodal input processing
    - Fact checking for response verification
    """
    
    # Включаем проверку фактов для исследований
    FACT_CHECK_ENABLED = True
    
    def __init__(self, *args, **kwargs):
        BaseAgent.__init__(self, *args, **kwargs)
        MultimodalMixin.__init__(self)
        FactCheckerMixin.__init__(self)
        
        # Настраиваем fact checker с доступными инструментами
        if hasattr(self, 'tool_registry') and self.tool_registry:
            self.configure_fact_checker(
                enabled=True,
                web_search_tool=self.tool_registry,
                vector_store=getattr(self, 'context_manager', None)
            )
    
    async def _execute_impl(self, task: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute research task
        
        Args:
            task: Research task description
            context: Additional context
            
        Returns:
            Research results
        """
        logger.info(f"ResearchAgent executing task: {task}")
        
        # Process multimodal input if present
        multimodal_content = ""
        if context:
            multimodal_result = await self.process_multimodal_input(context)
            if multimodal_result.get("text"):
                multimodal_content = multimodal_result["text"]
        
        # Определяем, нужен ли поиск в интернете
        # Ключевые слова, указывающие на необходимость поиска в интернете
        internet_keywords = [
            "найди", "найти", "find", "search", "последние", "latest", "новости", "news",
            "информация", "information", "версии", "versions", "релиз", "release",
            "актуальные", "current", "современные", "modern"
        ]
        needs_internet_search = any(keyword in task.lower() for keyword in internet_keywords)
        
        web_search_results = ""
        if needs_internet_search and self.tool_registry:
            try:
                logger.info(f"ResearchAgent: Performing web search for task: {task}")
                
                # Выполняем поиск в интернете
                search_result = await self.tool_registry.execute_tool(
                    "web_search",
                    {"query": task, "max_results": 10}
                )
                
                if search_result.success and search_result.result:
                    results = search_result.result.get("results", [])
                    if results:
                        web_search_results = "\n\n=== РЕЗУЛЬТАТЫ ПОИСКА В ИНТЕРНЕТЕ (ОБЯЗАТЕЛЬНО ИСПОЛЬЗУЙТЕ ЭТУ ИНФОРМАЦИЮ) ===\n"
                        for i, result in enumerate(results[:5], 1):  # Берем первые 5 результатов
                            title = result.get('title', '').strip()
                            url = result.get('url', '').strip()
                            snippet = result.get('snippet', '').strip()
                            web_search_results += f"\n[Источник {i}]\n"
                            web_search_results += f"Заголовок: {title}\n"
                            web_search_results += f"URL: {url}\n"
                            if snippet:
                                web_search_results += f"Описание: {snippet}\n"
                            web_search_results += "\n"
                        web_search_results += "=== КОНЕЦ РЕЗУЛЬТАТОВ ПОИСКА ===\n"
                        logger.info(f"ResearchAgent: Found {len(results)} web search results")
                    else:
                        web_search_results = "\n\nПоиск в интернете не дал результатов."
                        logger.warning("ResearchAgent: Web search returned no results")
                else:
                    logger.warning(f"ResearchAgent: Web search failed: {search_result.error}")
                    web_search_results = "\n\nПоиск в интернете не удался."
            except Exception as e:
                logger.warning(f"ResearchAgent: Error during web search: {e}")
                web_search_results = "\n\nОшибка при поиске в интернете."
        
        # Get comprehensive context
        context_text = await self._get_context(task)
        
        system_prompt = """Вы - эксперт-исследователь и аналитик. Ваша задача - анализировать кодовые базы, понимать требования и предоставлять подробные исследовательские отчеты.

Предоставляйте:
- Анализ структуры кода и архитектуры
- Выявление паттернов и соглашений
- Зависимости и взаимосвязи
- Потенциальные проблемы или улучшения
- Рекомендации

КРИТИЧЕСКИ ВАЖНО:
1. Отвечайте ТОЛЬКО на русском языке, даже если исходные данные на другом языке
2. Если вам предоставлены результаты поиска в интернете, ОБЯЗАТЕЛЬНО используйте эту информацию в своем ответе
3. Включайте ссылки на источники из результатов поиска, если они были предоставлены
4. Не придумывайте информацию - используйте только то, что найдено в результатах поиска или в контексте кодовой базы
5. При упоминании дат, версий или событий учитывайте текущую дату и время (указаны в системном промпте) для определения актуальности информации"""
        
        user_prompt = f"""Задача исследования: {task}

"""
        
        if web_search_results:
            user_prompt += web_search_results + "\n\n"
        
        if context_text:
            user_prompt += f"Релевантный контекст кодовой базы:\n{context_text}\n\n"
        
        if multimodal_content:
            user_prompt += f"Мультимодальный ввод (изображения, аудио и т.д.):\n{multimodal_content}\n\n"
        
        if context:
            if "requirements" in context:
                user_prompt += f"Требования:\n{context['requirements']}\n\n"
            if "focus_areas" in context:
                user_prompt += f"Области фокуса: {', '.join(context['focus_areas'])}\n\n"
        
        if web_search_results:
            user_prompt += "\n\nКРИТИЧЕСКИ ВАЖНО:\n"
            user_prompt += "1. Вы ДОЛЖНЫ использовать информацию из результатов поиска в интернете, которые указаны выше\n"
            user_prompt += "2. Включите в свой ответ конкретные ссылки в формате markdown: [текст ссылки](URL)\n"
            user_prompt += "3. Используйте факты и данные из найденных источников, а не общие знания\n"
            user_prompt += "4. Укажите, откуда взята каждая важная информация (укажите номер источника или URL)\n"
            user_prompt += "5. Обязательно включите в ответ раздел 'Источники' со всеми URL из результатов поиска\n\n"
        
        user_prompt += "Пожалуйста, предоставьте подробный исследовательский отчет на русском языке."
        
        messages = [
            LLMMessage(role="system", content=system_prompt),
            LLMMessage(role="user", content=user_prompt)
        ]
        
        try:
            report = await self._get_llm_response(messages)
            
            # === FACT CHECKING ===
            # Проверяем факты в отчёте для повышения достоверности
            fact_check_result: FactCheckResult = None
            if self.FACT_CHECK_ENABLED and self._fact_check_enabled:
                try:
                    fact_check_result = await self.check_facts(
                        response=report,
                        task=task,
                        use_web=bool(web_search_results),  # Используем web если уже искали
                        use_rag=bool(context_text)  # Используем RAG если есть контекст
                    )
                    
                    # Если нашлись проблемы - добавляем предупреждение
                    if fact_check_result.needs_correction and fact_check_result.corrected_response:
                        logger.info(f"ResearchAgent: Fact check found issues, applying corrections")
                        report = fact_check_result.corrected_response
                    elif fact_check_result.claims_disputed > 0:
                        logger.warning(f"ResearchAgent: {fact_check_result.claims_disputed} disputed claims found")
                        
                except Exception as e:
                    logger.warning(f"Fact checking failed (non-critical): {e}")
            
            result = {
                "agent": self.name,
                "task": task,
                "report": report,
                "success": True
            }
            
            # Добавляем результаты проверки фактов
            if fact_check_result:
                result["fact_check"] = fact_check_result.to_dict()
            
            # Save to memory
            if self.memory:
                await self.memory.save_solution(
                    task=task,
                    solution=report,
                    agent=self.name,
                    metadata=context
                )
            
            return result
            
        except Exception as e:
            logger.error(f"ResearchAgent error: {e}")
            raise AgentException(f"Research failed: {e}") from e

