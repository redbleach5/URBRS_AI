"""
Adaptive Temperature - автоматический выбор температуры по типу задачи.

Разные типы задач требуют разного баланса между точностью и креативностью:
- Код: низкая температура (точность важнее)
- Креатив: высокая температура (разнообразие важнее)
- Исследование: средняя температура (баланс)
"""

from typing import Optional, Dict, Any
from dataclasses import dataclass
from enum import Enum

from .logger import get_logger

logger = get_logger(__name__)


class TaskCategory(Enum):
    """Категории задач для выбора температуры."""
    CODE = "code"           # Генерация/исправление кода
    ANALYSIS = "analysis"   # Анализ, отладка
    RESEARCH = "research"   # Исследование, сравнение
    CREATIVE = "creative"   # Креативные задачи
    CHAT = "chat"           # Обычный чат
    MATH = "math"           # Математика, логика
    TRANSLATION = "translation"  # Перевод
    SUMMARIZATION = "summarization"  # Суммирование


@dataclass
class TemperatureConfig:
    """Конфигурация температуры для типа задачи."""
    base_temperature: float
    min_temperature: float = 0.0
    max_temperature: float = 1.0
    description: str = ""


# Оптимальные температуры для разных типов задач
TEMPERATURE_PROFILES: Dict[TaskCategory, TemperatureConfig] = {
    TaskCategory.CODE: TemperatureConfig(
        base_temperature=0.1,
        max_temperature=0.3,
        description="Низкая температура для точного кода"
    ),
    TaskCategory.MATH: TemperatureConfig(
        base_temperature=0.0,
        max_temperature=0.1,
        description="Минимальная температура для точных вычислений"
    ),
    TaskCategory.ANALYSIS: TemperatureConfig(
        base_temperature=0.2,
        max_temperature=0.4,
        description="Низкая температура для точного анализа"
    ),
    TaskCategory.TRANSLATION: TemperatureConfig(
        base_temperature=0.2,
        max_temperature=0.4,
        description="Низкая для точного перевода"
    ),
    TaskCategory.SUMMARIZATION: TemperatureConfig(
        base_temperature=0.3,
        max_temperature=0.5,
        description="Средне-низкая для точного суммирования"
    ),
    TaskCategory.RESEARCH: TemperatureConfig(
        base_temperature=0.5,
        max_temperature=0.7,
        description="Средняя для исследовательских задач"
    ),
    TaskCategory.CHAT: TemperatureConfig(
        base_temperature=0.7,
        max_temperature=0.9,
        description="Средне-высокая для естественного диалога"
    ),
    TaskCategory.CREATIVE: TemperatureConfig(
        base_temperature=0.8,
        max_temperature=1.0,
        description="Высокая для креативных задач"
    ),
}

# Ключевые слова для определения типа задачи
TASK_KEYWORDS: Dict[TaskCategory, list] = {
    TaskCategory.CODE: [
        "код", "code", "функция", "function", "класс", "class", "программа",
        "напиши", "создай", "реализуй", "implement", "fix", "исправь",
        "debug", "refactor", "рефакторинг", "api", "скрипт", "script",
        "python", "javascript", "typescript", "react", "vue", "игра", "game"
    ],
    TaskCategory.MATH: [
        "вычисли", "calculate", "посчитай", "формула", "уравнение",
        "математика", "math", "доказательство", "proof", "интеграл",
        "производная", "статистика", "probability", "вероятность"
    ],
    TaskCategory.ANALYSIS: [
        "анализ", "analysis", "analyze", "проанализируй", "почему",
        "причина", "объясни", "explain", "разбор", "debug", "отладка",
        "ошибка", "error", "баг", "bug", "проблема", "issue"
    ],
    TaskCategory.RESEARCH: [
        "исследуй", "research", "сравни", "compare", "обзор", "review",
        "изучи", "найди информацию", "what is", "что такое", "как работает",
        "документация", "docs", "туториал", "tutorial"
    ],
    TaskCategory.TRANSLATION: [
        "переведи", "translate", "перевод", "translation", "на английский",
        "на русский", "in english", "по-русски"
    ],
    TaskCategory.SUMMARIZATION: [
        "суммируй", "summarize", "кратко", "brief", "резюме", "summary",
        "основное", "главное", "ключевые моменты", "key points", "тезисы"
    ],
    TaskCategory.CREATIVE: [
        "придумай", "create", "сочини", "история", "story", "стих", "poem",
        "слоган", "название", "идея", "idea", "концепция", "concept",
        "дизайн", "design", "логотип", "logo", "шутка", "joke", "анекдот"
    ],
}


def detect_task_category(task: str, mode: Optional[str] = None) -> TaskCategory:
    """
    Определяет категорию задачи по тексту и режиму.
    
    Args:
        task: Текст задачи
        mode: Режим (chat, ide, research, etc.)
        
    Returns:
        Категория задачи
    """
    task_lower = task.lower()
    
    # Сначала проверяем по режиму
    if mode:
        mode_mapping = {
            "ide": TaskCategory.CODE,
            "code": TaskCategory.CODE,
            "research": TaskCategory.RESEARCH,
        }
        if mode in mode_mapping:
            return mode_mapping[mode]
    
    # Подсчитываем совпадения ключевых слов
    scores: Dict[TaskCategory, int] = {cat: 0 for cat in TaskCategory}
    
    for category, keywords in TASK_KEYWORDS.items():
        for keyword in keywords:
            if keyword in task_lower:
                scores[category] += 1
    
    # Находим категорию с максимальным счётом
    max_score = max(scores.values())
    if max_score > 0:
        for category, score in scores.items():
            if score == max_score:
                return category
    
    # По умолчанию - чат
    return TaskCategory.CHAT


def get_optimal_temperature(
    task: str,
    mode: Optional[str] = None,
    complexity: Optional[str] = None,
    user_override: Optional[float] = None
) -> float:
    """
    Определяет оптимальную температуру для задачи.
    
    Args:
        task: Текст задачи
        mode: Режим работы
        complexity: Уровень сложности (simple, medium, complex)
        user_override: Пользовательское переопределение
        
    Returns:
        Оптимальная температура (0.0 - 1.0)
    """
    # Если пользователь указал температуру явно
    if user_override is not None:
        return max(0.0, min(1.0, user_override))
    
    # Определяем категорию
    category = detect_task_category(task, mode)
    config = TEMPERATURE_PROFILES.get(category, TEMPERATURE_PROFILES[TaskCategory.CHAT])
    
    # Базовая температура
    temperature = config.base_temperature
    
    # Корректировка по сложности
    if complexity:
        if complexity in ("complex", "high", "hard"):
            # Сложные задачи - немного снижаем температуру для точности
            temperature = max(config.min_temperature, temperature - 0.1)
        elif complexity in ("trivial", "simple", "easy"):
            # Простые задачи - можно немного повысить
            temperature = min(config.max_temperature, temperature + 0.1)
    
    logger.debug(f"Adaptive temperature: {category.value} -> {temperature:.2f}")
    
    return temperature


def get_temperature_info(task: str, mode: Optional[str] = None) -> Dict[str, Any]:
    """
    Возвращает полную информацию о выборе температуры.
    
    Returns:
        Dict с temperature, category, reason
    """
    category = detect_task_category(task, mode)
    config = TEMPERATURE_PROFILES.get(category, TEMPERATURE_PROFILES[TaskCategory.CHAT])
    
    return {
        "temperature": config.base_temperature,
        "category": category.value,
        "reason": config.description,
        "min": config.min_temperature,
        "max": config.max_temperature
    }


# Глобальная функция для простого использования
def adaptive_temperature(task: str, mode: str = None) -> float:
    """Shortcut для get_optimal_temperature."""
    return get_optimal_temperature(task, mode)

