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


class CostTier(Enum):
    """Уровни стоимости провайдеров"""
    FREE = 1        # Бесплатные (локальные Ollama)
    CHEAP = 2       # Дешёвые (GPT-3.5, Claude Haiku)
    STANDARD = 3    # Стандартные (GPT-4-turbo, Claude Sonnet)
    PREMIUM = 4     # Премиум (GPT-4, Claude Opus)


@dataclass
class ProviderInfo:
    """Информация о провайдере LLM"""
    name: str
    is_local: bool          # Локальный провайдер (Ollama)
    is_private: bool        # Данные не уходят наружу
    cost_tier: CostTier     # Уровень стоимости
    models_cost_map: Dict[str, CostTier] = field(default_factory=dict)  # Стоимость по моделям
    
    def get_model_cost(self, model: str) -> CostTier:
        """Получить стоимость конкретной модели"""
        return self.models_cost_map.get(model, self.cost_tier)


@dataclass
class RoutingPolicy:
    """
    Политика маршрутизации моделей.
    
    Позволяет контролировать выбор модели по трилемме:
    cost (стоимость) / quality (качество) / privacy (приватность)
    """
    # Приватность
    prefer_local: bool = True           # Предпочитать локальные модели
    require_private: bool = False       # Строго требовать приватность (не использовать облако)
    
    # Стоимость
    max_cost_tier: CostTier = CostTier.PREMIUM  # Максимально допустимая стоимость
    prefer_cheap: bool = False          # Предпочитать дешёвые модели
    
    # Качество
    min_quality: float = 0.5            # Минимальный порог качества (0-1)
    prefer_quality: bool = True         # Предпочитать качество скорости
    
    # Дополнительно
    allowed_providers: Optional[List[str]] = None  # Список разрешённых провайдеров
    blocked_providers: Optional[List[str]] = None  # Список заблокированных провайдеров
    
    def allows_provider(self, provider_info: "ProviderInfo") -> bool:
        """Проверяет, разрешён ли провайдер политикой"""
        # Проверка приватности
        if self.require_private and not provider_info.is_private:
            return False
        
        # Проверка стоимости
        if provider_info.cost_tier.value > self.max_cost_tier.value:
            return False
        
        # Проверка списков
        if self.allowed_providers and provider_info.name not in self.allowed_providers:
            return False
        if self.blocked_providers and provider_info.name in self.blocked_providers:
            return False
        
        return True
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "prefer_local": self.prefer_local,
            "require_private": self.require_private,
            "max_cost_tier": self.max_cost_tier.value,
            "prefer_cheap": self.prefer_cheap,
            "min_quality": self.min_quality,
            "prefer_quality": self.prefer_quality,
            "allowed_providers": self.allowed_providers,
            "blocked_providers": self.blocked_providers,
        }
    
    @classmethod
    def privacy_first(cls) -> "RoutingPolicy":
        """Политика: приватность важнее всего"""
        return cls(prefer_local=True, require_private=True)
    
    @classmethod
    def cost_first(cls) -> "RoutingPolicy":
        """Политика: экономия важнее всего"""
        return cls(prefer_local=True, prefer_cheap=True, max_cost_tier=CostTier.CHEAP)
    
    @classmethod
    def quality_first(cls) -> "RoutingPolicy":
        """Политика: качество важнее всего"""
        return cls(prefer_quality=True, min_quality=0.8, max_cost_tier=CostTier.PREMIUM)
    
    @classmethod
    def balanced(cls) -> "RoutingPolicy":
        """Политика: баланс между всеми факторами"""
        return cls(prefer_local=True, prefer_quality=True, max_cost_tier=CostTier.STANDARD)


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

