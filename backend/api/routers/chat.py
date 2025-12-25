"""
Chat router - Простой универсальный чат без агентов
Для быстрых ответов, шуток, новостей, команд Linux и т.д.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime

from backend.core.logger import get_logger
from backend.llm.base import LLMMessage

logger = get_logger(__name__)

router = APIRouter()


class ChatMessage(BaseModel):
    role: str  # "user" или "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = None
    mode: Optional[str] = "general"  # general, ide, research
    context: Optional[Dict[str, Any]] = None
    model: Optional[str] = None  # Выбранная модель (None = автовыбор)
    provider: Optional[str] = None  # Выбранный провайдер


class ChatResponse(BaseModel):
    success: bool
    message: str
    error: Optional[str] = None
    warning: Optional[str] = None  # Предупреждение о сложности
    metadata: Optional[Dict[str, Any]] = None


# Системные промпты для разных режимов
SYSTEM_PROMPTS = {
    "general": """Ты — универсальный AI-ассистент. Ты можешь:
- Отвечать на любые вопросы
- Шутить и поддерживать непринуждённую беседу
- Объяснять команды Linux, технологии, концепции
- Помогать с повседневными задачами
- Давать советы и рекомендации

ВАЖНЫЕ ПРАВИЛА:
1. Отвечай ТОЛЬКО на русском языке. Не используй слова из других языков (вьетнамского, хинди, итальянского и т.д.)
2. Если пользователь спрашивает о новостях или актуальных событиях:
   - Если тебе предоставлен веб-контекст с реальными данными — используй его
   - Если веб-контекста НЕТ — честно скажи: "У меня нет доступа к актуальным новостям. Мои знания ограничены датой обучения модели."
   - НИКОГДА не выдумывай новости, события или факты!
3. Если не знаешь ответ — так и скажи, не придумывай информацию.

Будь дружелюбным и полезным. Используй эмодзи где уместно.
Форматируй ответы с markdown для лучшей читаемости.
Текущая дата: {current_date}""",

    "ide": """Ты — опытный программист и разработчик. Ты можешь:
- Писать и анализировать код на любых языках
- Отлаживать и исправлять ошибки
- Объяснять архитектуру и паттерны проектирования
- Оптимизировать производительность кода
- Ревьюить код и предлагать улучшения
- Помогать с Git, Docker, CI/CD и DevOps

Отвечай технически грамотно, с примерами кода когда уместно.
Используй markdown с подсветкой синтаксиса для кода.
Будь конкретен и точен в технических деталях.""",

    "research": """Ты — эксперт-исследователь и аналитик. Ты можешь:
- Глубоко анализировать темы и предоставлять исследования
- Сравнивать технологии и подходы
- Искать и обобщать информацию
- Создавать структурированные отчёты
- Анализировать тренды и прогнозировать развитие

Предоставляй детальные, хорошо структурированные ответы.
Указывай источники информации где возможно.
Используй таблицы, списки и другое форматирование для наглядности."""
}


def get_system_prompt(mode: str) -> str:
    """Получает системный промпт для режима с подстановкой даты"""
    prompt = SYSTEM_PROMPTS.get(mode, SYSTEM_PROMPTS["general"])
    current_date = datetime.now().strftime("%d %B %Y, %H:%M")
    return prompt.format(current_date=current_date)


@router.post("/chat", response_model=ChatResponse)
async def chat(request: Request, chat_request: ChatRequest):
    """
    Простой чат без агентов — напрямую через LLM.
    Быстрые ответы для повседневных вопросов.
    НЕ блокирует сложные операции — только предупреждает пользователя.
    """
    logger.info(f"Chat request: mode={chat_request.mode}, message_length={len(chat_request.message)}")
    
    engine = request.app.state.engine
    
    if not engine:
        raise HTTPException(status_code=503, detail="Движок не инициализирован")
    
    llm_manager = engine.llm_manager
    
    if not llm_manager:
        raise HTTPException(status_code=503, detail="LLM провайдер не доступен")
    
    # Анализируем сложность задачи (НЕ блокирует выполнение!)
    complexity_warning = None
    complexity_info = None
    try:
        from backend.core.complexity_analyzer import get_complexity_analyzer
        analyzer = get_complexity_analyzer()
        complexity_info = analyzer.analyze(
            task=chat_request.message,
            model=chat_request.model,
            task_type=chat_request.mode
        )
        
        if complexity_info.should_warn:
            complexity_warning = complexity_info.warning_message
            logger.info(f"Chat complexity warning: {complexity_info.level.value}, ~{complexity_info.estimated_minutes:.1f} min")
    except Exception as e:
        logger.debug(f"Complexity analysis failed (non-critical): {e}")
    
    try:
        # Формируем сообщения
        messages = [
            LLMMessage(
                role="system",
                content=get_system_prompt(chat_request.mode or "general")
            )
        ]
        
        # Добавляем историю если есть
        if chat_request.history:
            for msg in chat_request.history[-10:]:  # Последние 10 сообщений
                messages.append(LLMMessage(
                    role=msg.role,
                    content=msg.content
                ))
        
        # Добавляем текущее сообщение
        messages.append(LLMMessage(
            role="user",
            content=chat_request.message
        ))
        
        # Определяем нужен ли поиск в интернете
        needs_search = any(keyword in chat_request.message.lower() for keyword in [
            "новости", "news", "последние", "актуальные", "сегодня",
            "цены", "курс", "погода", "события"
        ])
        
        web_context = ""
        if needs_search and engine.tool_registry:
            try:
                logger.info("Chat: Performing web search for context")
                search_result = await engine.tool_registry.execute_tool(
                    "web_search",
                    {"query": chat_request.message, "max_results": 5}
                )
                
                if search_result.success and search_result.result:
                    results = search_result.result.get("results", [])
                    if results:
                        web_context = "\n\n📰 **Найденная информация из интернета:**\n"
                        for i, result in enumerate(results[:3], 1):
                            title = result.get('title', '').strip()
                            snippet = result.get('snippet', '').strip()
                            url = result.get('url', '').strip()
                            web_context += f"\n{i}. **{title}**\n{snippet}\n[Источник]({url})\n"
                        
                        # Добавляем контекст к сообщению
                        messages[-1] = LLMMessage(
                            role="user",
                            content=f"{chat_request.message}\n\n{web_context}\n\nИспользуй эту информацию для ответа."
                        )
            except Exception as e:
                logger.warning(f"Chat web search failed: {e}")
        
        # Умный выбор модели на основе сложности сообщения
        model_to_use = chat_request.model
        provider_to_use = chat_request.provider
        
        # Если модель НЕ указана явно, выбираем автоматически
        if not model_to_use and complexity_info:
            ollama_provider = llm_manager.providers.get("ollama")
            if ollama_provider:
                # Для простых сообщений используем быструю модель
                if complexity_info.level.value in ["trivial", "simple"]:
                    # Ищем быструю модель из рекомендованных
                    fast_models = ollama_provider.recommended_models.get("fast", [])
                    available = getattr(ollama_provider, '_available_models', [])
                    
                    for fast_model in fast_models:
                        # Проверяем доступность модели
                        if any(fast_model in m for m in available):
                            model_to_use = next((m for m in available if fast_model in m), None)
                            if model_to_use:
                                logger.info(f"Chat: Simple message -> using fast model: {model_to_use}")
                                break
                    
                    # Fallback на gemma3:1b или qwen2.5:1.5b если не нашли
                    if not model_to_use:
                        for fallback in ["gemma3:1b", "qwen2.5:1.5b", "llama3.2:1b"]:
                            if any(fallback in m for m in available):
                                model_to_use = next((m for m in available if fallback in m), None)
                                if model_to_use:
                                    logger.info(f"Chat: Using fallback fast model: {model_to_use}")
                                    break
        
        # Если указана модель явно, используем её
        if model_to_use:
            ollama_provider = llm_manager.providers.get("ollama")
            if ollama_provider:
                # Временно меняем модель по умолчанию
                original_model = ollama_provider.default_model
                ollama_provider.default_model = model_to_use
                logger.info(f"Chat: Using model: {model_to_use}")
        
        # Генерируем ответ
        response = await llm_manager.generate(
            messages=messages,
            provider_name=provider_to_use,
            model=model_to_use,
            temperature=0.7,
            max_tokens=2000
        )
        
        # Восстанавливаем оригинальную модель если меняли
        if model_to_use:
            ollama_provider = llm_manager.providers.get("ollama")
            if ollama_provider and 'original_model' in locals():
                ollama_provider.default_model = original_model
        
        # Определяем, была ли использована быстрая модель
        used_fast_model = (
            complexity_info and 
            complexity_info.level.value in ["trivial", "simple"] and
            response.model and
            any(x in response.model.lower() for x in ["1b", "1.5b", "2b"])
        )
        
        return ChatResponse(
            success=True,
            message=response.content,
            warning=complexity_warning,  # Предупреждение о сложности (если было)
            metadata={
                "model": response.model,
                "provider": getattr(response, 'provider', 'ollama'),
                "mode": chat_request.mode,
                "has_thinking": getattr(response, 'thinking', None) is not None,
                "thinking": getattr(response, 'thinking', None),
                "web_search_used": bool(web_context),
                "complexity_level": complexity_info.level.value if complexity_info else None,
                "estimated_minutes": complexity_info.estimated_minutes if complexity_info else None,
                "smart_model_selection": True,  # Показываем что использовался умный выбор
                "used_fast_model": used_fast_model  # Была ли использована быстрая модель
            }
        )
        
    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        error_message = str(e)
        
        if "timeout" in error_message.lower():
            error_message = "Превышено время ожидания. Попробуйте ещё раз."
        elif "connection" in error_message.lower():
            error_message = "Ошибка подключения к LLM. Проверьте настройки."
        
        return ChatResponse(
            success=False,
            message="",
            error=error_message
        )

