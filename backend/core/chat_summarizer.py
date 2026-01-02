"""
ChatSummarizer - Суммирование длинных чатов для сохранения контекста.

Решает проблему "забывания" модели при >10 сообщениях:
- Автоматическое суммирование старых сообщений
- Сохранение ключевой информации
- Иерархическое суммирование для очень длинных диалогов
- Добавление summary в system prompt

Формула: summary + последние N сообщений = полный контекст
"""

import json
import hashlib
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime

from .logger import get_logger

logger = get_logger(__name__)


@dataclass
class ChatMessage:
    """Сообщение в чате."""
    role: str  # "user", "assistant", "system"
    content: str
    timestamp: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "role": self.role,
            "content": self.content,
            "timestamp": self.timestamp,
            "metadata": self.metadata
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ChatMessage":
        return cls(
            role=data.get("role", "user"),
            content=data.get("content", ""),
            timestamp=data.get("timestamp"),
            metadata=data.get("metadata", {})
        )
    
    @property
    def token_estimate(self) -> int:
        """Примерная оценка токенов (1 токен ≈ 4 символа)."""
        return len(self.content) // 4


@dataclass
class ConversationSummary:
    """Суммарий разговора."""
    summary_text: str
    messages_summarized: int
    key_topics: List[str] = field(default_factory=list)
    key_decisions: List[str] = field(default_factory=list)
    user_requirements: List[str] = field(default_factory=list)
    generated_artifacts: List[str] = field(default_factory=list)  # Код, файлы
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "summary_text": self.summary_text,
            "messages_summarized": self.messages_summarized,
            "key_topics": self.key_topics,
            "key_decisions": self.key_decisions,
            "user_requirements": self.user_requirements,
            "generated_artifacts": self.generated_artifacts,
            "timestamp": self.timestamp
        }
    
    def to_system_prompt(self) -> str:
        """Генерирует текст для добавления в system prompt."""
        parts = [
            f"### КОНТЕКСТ ПРЕДЫДУЩЕГО РАЗГОВОРА ({self.messages_summarized} сообщений):\n",
            self.summary_text
        ]
        
        if self.key_topics:
            parts.append(f"\n\nОбсуждаемые темы: {', '.join(self.key_topics[:5])}")
        
        if self.user_requirements:
            parts.append(f"\n\nТребования пользователя:")
            for req in self.user_requirements[:5]:
                parts.append(f"- {req}")
        
        if self.key_decisions:
            parts.append(f"\n\nПринятые решения:")
            for dec in self.key_decisions[:5]:
                parts.append(f"- {dec}")
        
        if self.generated_artifacts:
            parts.append(f"\n\nСгенерированные артефакты: {', '.join(self.generated_artifacts[:5])}")
        
        parts.append("\n### КОНЕЦ КОНТЕКСТА\n")
        
        return "".join(parts)


class ChatSummarizer:
    """
    Суммирует длинные чаты для сохранения контекста.
    
    Стратегия:
    1. Когда сообщений > threshold, суммируем старые
    2. Сохраняем последние N сообщений полностью
    3. Summary добавляется в system prompt
    4. При очень длинных диалогах - иерархическое суммирование
    """
    
    # Конфигурация по умолчанию
    DEFAULT_THRESHOLD = 10  # Порог для начала суммирования
    DEFAULT_KEEP_RECENT = 5  # Сколько последних сообщений сохранять полностью
    DEFAULT_MAX_SUMMARY_TOKENS = 1000  # Максимальный размер summary
    
    def __init__(
        self,
        llm_manager=None,
        threshold: int = DEFAULT_THRESHOLD,
        keep_recent: int = DEFAULT_KEEP_RECENT,
        max_summary_tokens: int = DEFAULT_MAX_SUMMARY_TOKENS
    ):
        """
        Инициализация.
        
        Args:
            llm_manager: LLM провайдер для суммирования
            threshold: Порог сообщений для суммирования
            keep_recent: Сколько последних сообщений сохранять
            max_summary_tokens: Максимальный размер summary
        """
        self.llm_manager = llm_manager
        self.threshold = threshold
        self.keep_recent = keep_recent
        self.max_summary_tokens = max_summary_tokens
        
        # Кэш summaries по conversation_id
        self._summary_cache: Dict[str, ConversationSummary] = {}
    
    def needs_summarization(self, messages: List[ChatMessage]) -> bool:
        """Проверяет, нужно ли суммирование."""
        # Считаем только user и assistant сообщения
        relevant_messages = [
            m for m in messages 
            if m.role in ("user", "assistant")
        ]
        return len(relevant_messages) > self.threshold
    
    async def summarize_if_needed(
        self,
        messages: List[ChatMessage],
        conversation_id: Optional[str] = None,
        force: bool = False
    ) -> Tuple[List[ChatMessage], Optional[ConversationSummary]]:
        """
        Суммирует сообщения если нужно.
        
        Args:
            messages: Список сообщений
            conversation_id: ID разговора для кэширования
            force: Принудительно суммировать
            
        Returns:
            (messages_to_use, summary) - сообщения для использования и summary
        """
        if not force and not self.needs_summarization(messages):
            return messages, None
        
        # Проверяем кэш
        if conversation_id and conversation_id in self._summary_cache:
            cached_summary = self._summary_cache[conversation_id]
            # Проверяем актуальность
            if cached_summary.messages_summarized >= len(messages) - self.keep_recent:
                # Кэш актуален, возвращаем последние сообщения
                recent = messages[-self.keep_recent:]
                return recent, cached_summary
        
        # Разделяем на старые и новые сообщения
        messages_to_summarize = messages[:-self.keep_recent]
        recent_messages = messages[-self.keep_recent:]
        
        # Суммируем старые сообщения
        summary = await self._create_summary(messages_to_summarize)
        
        if summary and conversation_id:
            self._summary_cache[conversation_id] = summary
        
        return recent_messages, summary
    
    async def _create_summary(
        self,
        messages: List[ChatMessage]
    ) -> Optional[ConversationSummary]:
        """Создаёт summary для списка сообщений."""
        if not messages:
            return None
        
        if not self.llm_manager:
            # Fallback: простое извлечение ключевых моментов
            return self._create_simple_summary(messages)
        
        from ..llm.base import LLMMessage
        
        # Формируем текст диалога
        dialog_text = self._format_messages_for_summary(messages)
        
        prompt = f"""Проанализируй следующий диалог и создай краткое резюме.

ДИАЛОГ:
{dialog_text}

Создай JSON с резюме:
{{
    "summary": "Краткое описание основных моментов диалога (2-5 предложений)",
    "key_topics": ["тема1", "тема2"],
    "user_requirements": ["требование1", "требование2"],
    "key_decisions": ["решение1"],
    "generated_artifacts": ["код для X", "файл Y"]
}}

ВАЖНО:
- Summary должен содержать ВСЮ важную информацию для продолжения диалога
- Включи конкретные детали (имена файлов, функций, параметры)
- Не упускай технические решения и предпочтения пользователя
"""

        try:
            response = await self.llm_manager.generate(
                messages=[
                    LLMMessage(
                        role="system",
                        content="Ты - эксперт по анализу диалогов. Создавай точные, информативные резюме. Отвечай только в формате JSON."
                    ),
                    LLMMessage(role="user", content=prompt)
                ],
                temperature=0.2,
                max_tokens=self.max_summary_tokens
            )
            
            # Парсим JSON
            content = response.content.strip()
            # Извлекаем JSON из ответа
            json_match = None
            if "{" in content:
                start = content.find("{")
                end = content.rfind("}") + 1
                if end > start:
                    try:
                        json_match = json.loads(content[start:end])
                    except json.JSONDecodeError:
                        pass
            
            if json_match:
                return ConversationSummary(
                    summary_text=json_match.get("summary", ""),
                    messages_summarized=len(messages),
                    key_topics=json_match.get("key_topics", []),
                    key_decisions=json_match.get("key_decisions", []),
                    user_requirements=json_match.get("user_requirements", []),
                    generated_artifacts=json_match.get("generated_artifacts", [])
                )
            else:
                # Fallback: используем весь ответ как summary
                return ConversationSummary(
                    summary_text=content[:self.max_summary_tokens * 4],
                    messages_summarized=len(messages)
                )
            
        except Exception as e:
            logger.warning(f"ChatSummarizer: Failed to create summary via LLM: {e}")
            return self._create_simple_summary(messages)
    
    def _create_simple_summary(
        self,
        messages: List[ChatMessage]
    ) -> ConversationSummary:
        """Простое суммирование без LLM."""
        # Извлекаем ключевые моменты эвристически
        user_messages = [m for m in messages if m.role == "user"]
        assistant_messages = [m for m in messages if m.role == "assistant"]
        
        # Берём первые слова каждого сообщения
        topics = []
        requirements = []
        
        for m in user_messages[:5]:
            # Первые 50 символов
            snippet = m.content[:50].strip()
            if "?" in snippet:
                topics.append(snippet.split("?")[0] + "?")
            elif any(w in snippet.lower() for w in ["сделай", "создай", "напиши", "добавь"]):
                requirements.append(snippet)
        
        # Проверяем на наличие кода в ответах
        artifacts = []
        for m in assistant_messages:
            if "```" in m.content:
                artifacts.append("код")
                break
        
        summary_parts = []
        if topics:
            summary_parts.append(f"Обсуждались: {', '.join(topics[:3])}")
        if requirements:
            summary_parts.append(f"Запросы: {', '.join(requirements[:3])}")
        if artifacts:
            summary_parts.append(f"Создано: {', '.join(artifacts)}")
        
        return ConversationSummary(
            summary_text=" ".join(summary_parts) or "Диалог из нескольких сообщений.",
            messages_summarized=len(messages),
            key_topics=topics[:5],
            user_requirements=requirements[:5],
            generated_artifacts=artifacts
        )
    
    def _format_messages_for_summary(
        self,
        messages: List[ChatMessage],
        max_chars: int = 4000
    ) -> str:
        """Форматирует сообщения для суммирования."""
        formatted = []
        total_chars = 0
        
        for msg in messages:
            role_prefix = "User:" if msg.role == "user" else "Assistant:"
            content = msg.content
            
            # Ограничиваем длину одного сообщения
            if len(content) > 500:
                content = content[:500] + "..."
            
            line = f"{role_prefix} {content}"
            
            if total_chars + len(line) > max_chars:
                formatted.append("... (предыдущие сообщения опущены)")
                break
            
            formatted.append(line)
            total_chars += len(line)
        
        return "\n\n".join(formatted)
    
    def prepare_messages_with_summary(
        self,
        messages: List[ChatMessage],
        summary: Optional[ConversationSummary],
        system_prompt: str
    ) -> List[ChatMessage]:
        """
        Подготавливает сообщения с добавлением summary в system prompt.
        
        Args:
            messages: Последние сообщения (после суммирования)
            summary: Summary предыдущих сообщений
            system_prompt: Исходный system prompt
            
        Returns:
            Список сообщений с обновлённым system prompt
        """
        if summary:
            enhanced_system = system_prompt + "\n\n" + summary.to_system_prompt()
        else:
            enhanced_system = system_prompt
        
        result = [ChatMessage(role="system", content=enhanced_system)]
        result.extend(messages)
        
        return result
    
    def clear_cache(self, conversation_id: Optional[str] = None):
        """Очищает кэш summaries."""
        if conversation_id:
            self._summary_cache.pop(conversation_id, None)
        else:
            self._summary_cache.clear()
    
    def get_cached_summary(
        self,
        conversation_id: str
    ) -> Optional[ConversationSummary]:
        """Получает кэшированный summary."""
        return self._summary_cache.get(conversation_id)


# Глобальный экземпляр
_chat_summarizer: Optional[ChatSummarizer] = None


def get_chat_summarizer(llm_manager=None) -> ChatSummarizer:
    """Получить экземпляр ChatSummarizer."""
    global _chat_summarizer
    if _chat_summarizer is None:
        _chat_summarizer = ChatSummarizer(llm_manager=llm_manager)
    return _chat_summarizer

