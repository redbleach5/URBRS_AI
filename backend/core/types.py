"""
Общие типы для backend системы

Консолидирует дублирующиеся enum'ы и dataclass'ы,
используемые в нескольких модулях.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Any, Optional, List


class ComplexityLevel(Enum):
    """Уровни сложности задачи"""
    TRIVIAL = "trivial"          # Приветствия, простые вопросы (< 10 сек)
    SIMPLE = "simple"            # Простые задачи (10-30 сек)
    MODERATE = "moderate"        # Умеренная сложность (30 сек - 2 мин)
    COMPLEX = "complex"          # Сложные задачи (2-10 мин)
    VERY_COMPLEX = "very_complex"  # Очень сложные (10-30 мин)
    EXTREME = "extreme"          # Экстремально сложные (30+ мин)


class ModelTier(Enum):
    """Уровни моделей по производительности"""
    FAST = "fast"        # Быстрые модели для простых задач
    BALANCED = "balanced"  # Сбалансированные модели
    POWERFUL = "powerful"  # Мощные модели для сложных задач


@dataclass
class ComplexityResult:
    """Результат анализа сложности"""
    level: ComplexityLevel
    score: float  # 0-10
    estimated_minutes: float
    recommended_tier: ModelTier
    recommended_temperature: float
    recommended_max_tokens: int
    factors: Dict[str, Any] = field(default_factory=dict)
    warning_message: Optional[str] = None
    should_warn: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "level": self.level.value,
            "score": self.score,
            "estimated_minutes": self.estimated_minutes,
            "recommended_tier": self.recommended_tier.value,
            "recommended_temperature": self.recommended_temperature,
            "recommended_max_tokens": self.recommended_max_tokens,
            "factors": self.factors,
            "warning_message": self.warning_message,
            "should_warn": self.should_warn,
        }


@dataclass
class ModelSelection:
    """Результат выбора модели"""
    model: str
    provider: str
    tier: ModelTier
    server_url: Optional[str] = None
    score: float = 0.0
    reason: str = ""
    fallbacks: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "model": self.model,
            "provider": self.provider,
            "tier": self.tier.value,
            "server_url": self.server_url,
            "score": self.score,
            "reason": self.reason,
            "fallbacks": self.fallbacks,
        }

