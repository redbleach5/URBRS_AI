"""
UnifiedModelRouter - Единая точка входа для выбора модели

Консолидирует функциональность:
- IntelligentModelRouter — динамический скоринг и capabilities
- ResourceAwareSelector — адаптивный выбор по ресурсам  
- TaskRouter — маршрутизация по типу задачи
- SmartModelSelector — выбор по уровням
- DistributedModelRouter — маршрутизация по серверам

Новое в версии 2.0:
- RoutingPolicy — контроль по трилемме cost/quality/privacy
- ProviderInfo — информация о провайдерах (локальность, стоимость)
- Privacy-aware fallback — не переходит на облако если требуется приватность

Использование:
    router = UnifiedModelRouter(config)
    
    # Стандартный выбор
    selection = await router.select_model(task, task_type="code")
    
    # С политикой приватности (только локальные модели)
    selection = await router.select_model(
        task,
        policy=RoutingPolicy.privacy_first()
    )
    
    # С ограничением бюджета
    selection = await router.select_model(
        task,
        policy=RoutingPolicy(max_cost_tier=CostTier.CHEAP)
    )
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List

from .logger import get_logger
from .types import ModelTier, CostTier, ProviderInfo, RoutingPolicy
from .task_complexity_service import get_complexity_service
from .intelligent_model_router import IntelligentModelRouter, ScoredModel, ModelCapability
from .model_performance_tracker import get_performance_tracker

logger = get_logger(__name__)


# Предопределённая информация о провайдерах
PROVIDER_INFO: Dict[str, ProviderInfo] = {
    "ollama": ProviderInfo(
        name="ollama",
        is_local=True,
        is_private=True,
        cost_tier=CostTier.FREE,
        models_cost_map={}  # Все модели бесплатные
    ),
    "openai": ProviderInfo(
        name="openai",
        is_local=False,
        is_private=False,
        cost_tier=CostTier.STANDARD,
        models_cost_map={
            "gpt-4": CostTier.PREMIUM,
            "gpt-4-turbo": CostTier.PREMIUM,
            "gpt-4-turbo-preview": CostTier.PREMIUM,
            "gpt-4o": CostTier.STANDARD,
            "gpt-4o-mini": CostTier.CHEAP,
            "gpt-3.5-turbo": CostTier.CHEAP,
        }
    ),
    "anthropic": ProviderInfo(
        name="anthropic",
        is_local=False,
        is_private=False,
        cost_tier=CostTier.STANDARD,
        models_cost_map={
            "claude-3-opus-20240229": CostTier.PREMIUM,
            "claude-3-5-sonnet-20241022": CostTier.STANDARD,
            "claude-3-sonnet-20240229": CostTier.STANDARD,
            "claude-3-haiku-20240307": CostTier.CHEAP,
        }
    ),
}


@dataclass
class UnifiedModelSelection:
    """Результат унифицированного выбора модели"""
    model: str
    server_url: str
    server_name: str
    provider: str
    tier: ModelTier
    
    # Оценки
    total_score: float
    capability_score: float
    performance_score: float
    speed_score: float
    quality_score: float
    
    # Мета-информация
    complexity_level: str
    reason: str
    fallback_models: List[str] = field(default_factory=list)
    
    # Рекомендации
    recommended_temperature: float = 0.7
    recommended_max_tokens: int = 2000
    
    # Информация о провайдере (cost/quality/privacy)
    is_local: bool = True
    is_private: bool = True
    cost_tier: CostTier = CostTier.FREE
    policy_applied: Optional[RoutingPolicy] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "model": self.model,
            "server_url": self.server_url,
            "server_name": self.server_name,
            "provider": self.provider,
            "tier": self.tier.value,
            "scores": {
                "total": self.total_score,
                "capability": self.capability_score,
                "performance": self.performance_score,
                "speed": self.speed_score,
                "quality": self.quality_score,
            },
            "complexity_level": self.complexity_level,
            "reason": self.reason,
            "fallback_models": self.fallback_models,
            "recommended_temperature": self.recommended_temperature,
            "recommended_max_tokens": self.recommended_max_tokens,
            # Новые поля
            "is_local": self.is_local,
            "is_private": self.is_private,
            "cost_tier": self.cost_tier.value,
            "policy_applied": self.policy_applied.to_dict() if self.policy_applied else None,
        }


class IModelRouter(ABC):
    """Интерфейс для роутеров моделей"""
    
    @abstractmethod
    async def select_model(
        self,
        task: str,
        task_type: Optional[str] = None,
        complexity: Optional[str] = None,
        preferred_model: Optional[str] = None,
        policy: Optional[RoutingPolicy] = None
    ) -> UnifiedModelSelection:
        """Выбирает оптимальную модель для задачи с учётом политики"""
        ...
    
    @abstractmethod
    async def discover_models(self) -> List[str]:
        """Обнаруживает доступные модели"""
        ...


class UnifiedModelRouter(IModelRouter):
    """
    Единый маршрутизатор моделей.
    
    Объединяет логику из всех существующих роутеров в один facade.
    Использует IntelligentModelRouter для скоринга и добавляет:
    - Единый анализ сложности через TaskComplexityService
    - Адаптивные рекомендации по температуре и токенам
    - Умные fallbacks
    - RoutingPolicy для контроля cost/quality/privacy
    """
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.complexity_service = get_complexity_service()
        self.performance_tracker = get_performance_tracker()
        
        # Используем IntelligentModelRouter как основной движок
        self.intelligent_router = IntelligentModelRouter(config)
        
        # Информация о провайдерах
        self._providers = PROVIDER_INFO.copy()
        self._load_provider_config()
        
        # Загружаем политику по умолчанию из конфига
        self.DEFAULT_POLICY = self._load_default_policy()
        
        # Температуры по типам задач
        self._temperature_map = {
            "code": 0.1,
            "code_generation": 0.1,
            "analysis": 0.3,
            "research": 0.5,
            "reasoning": 0.4,
            "chat": 0.7,
            "simple_chat": 0.8,
            "creative": 0.9,
            "general": 0.7,
        }
        
        # Токены по сложности
        self._tokens_map = {
            "trivial": 500,
            "simple": 1000,
            "moderate": 2000,
            "complex": 3000,
            "very_complex": 4000,
            "extreme": 6000,
        }
        
        self._initialized = False
    
    def _load_provider_config(self) -> None:
        """Загружает кастомные настройки провайдеров из конфига"""
        llm_config = self.config.get("llm", {})
        providers_config = llm_config.get("providers", {})
        
        for provider_name, provider_cfg in providers_config.items():
            if provider_name in self._providers:
                # Обновляем cost_tier если указан в конфиге
                if "cost_tier" in provider_cfg:
                    try:
                        tier = CostTier(provider_cfg["cost_tier"])
                        self._providers[provider_name].cost_tier = tier
                    except ValueError:
                        pass
    
    def _load_default_policy(self) -> RoutingPolicy:
        """Загружает политику маршрутизации по умолчанию из конфига"""
        llm_config = self.config.get("llm", {})
        policy_config = llm_config.get("routing_policy", {})
        
        if not policy_config:
            # Политика по умолчанию если не указана в конфиге
            return RoutingPolicy(prefer_local=True, prefer_quality=True)
        
        # Парсим cost_tier
        max_cost_tier = CostTier.PREMIUM
        if "max_cost_tier" in policy_config:
            try:
                max_cost_tier = CostTier(policy_config["max_cost_tier"])
            except ValueError:
                pass
        
        return RoutingPolicy(
            prefer_local=policy_config.get("prefer_local", True),
            require_private=policy_config.get("require_private", False),
            max_cost_tier=max_cost_tier,
            prefer_cheap=policy_config.get("prefer_cheap", False),
            min_quality=policy_config.get("min_quality", 0.5),
            prefer_quality=policy_config.get("prefer_quality", True),
            allowed_providers=policy_config.get("allowed_providers"),
            blocked_providers=policy_config.get("blocked_providers"),
        )
    
    def get_provider_info(self, provider_name: str) -> ProviderInfo:
        """Получить информацию о провайдере"""
        return self._providers.get(
            provider_name,
            ProviderInfo(
                name=provider_name,
                is_local=False,
                is_private=False,
                cost_tier=CostTier.STANDARD
            )
        )
    
    async def initialize(self) -> None:
        """Инициализация роутера"""
        if self._initialized:
            return
        
        await self.intelligent_router.discover_servers()
        self._initialized = True
        logger.info("UnifiedModelRouter initialized")
    
    async def select_model(
        self,
        task: str,
        task_type: Optional[str] = None,
        complexity: Optional[str] = None,
        preferred_model: Optional[str] = None,
        quality_requirement: Optional[str] = None,
        policy: Optional[RoutingPolicy] = None
    ) -> UnifiedModelSelection:
        """
        Выбирает оптимальную модель для задачи с учётом политики.
        
        Args:
            task: Текст задачи
            task_type: Тип задачи (code, chat, research, analysis, etc.)
            complexity: Сложность (trivial, simple, moderate, complex, very_complex, extreme)
            preferred_model: Предпочитаемая модель (если есть)
            quality_requirement: Требование к качеству (fast, balanced, high)
            policy: Политика маршрутизации (cost/quality/privacy)
            
        Returns:
            UnifiedModelSelection с полной информацией о выборе
        """
        if not self._initialized:
            await self.initialize()
        
        # Используем политику по умолчанию если не указана
        effective_policy = policy or self.DEFAULT_POLICY
        
        # 1. Анализируем сложность через единый сервис
        if not complexity:
            complexity_result = self.complexity_service.analyze(task, task_type=task_type)
            complexity = complexity_result.level.value
        else:
            self._tokens_map.get(complexity, 2000) / 50  # ~50 tokens/sec
        
        # 2. Определяем тип задачи если не указан
        if not task_type:
            task_type = self._infer_task_type(task)
        
        # 3. Определяем подходящего провайдера с учётом политики
        provider, provider_info = self._select_provider_by_policy(effective_policy, task_type)
        
        # 4. Получаем выбор модели
        try:
            if provider == "ollama":
                # Используем IntelligentModelRouter для локальных моделей
                scored_model = await self.intelligent_router.select_model(
                    task=task,
                    task_type=task_type,
                    complexity=complexity,
                    preferred_model=preferred_model
                )
                model_name = scored_model.profile.name
                server_url = scored_model.server_url
                server_name = scored_model.server_name
                scores = {
                    "total": scored_model.total_score,
                    "capability": scored_model.capability_score,
                    "performance": scored_model.performance_score,
                    "speed": scored_model.speed_score,
                    "quality": scored_model.quality_score,
                }
                model_size = scored_model.profile.size_b
            else:
                # Для облачных провайдеров выбираем модель по стоимости/качеству
                model_name, scores = self._select_cloud_model(
                    provider, effective_policy, task_type, complexity
                )
                server_url = self.config.get("llm", {}).get("providers", {}).get(provider, {}).get("base_url", "")
                server_name = provider
                model_size = 100.0  # Облачные модели считаем большими
        except ConnectionError as e:
            # Если локальные недоступны и политика разрешает облако — fallback
            if not effective_policy.require_private:
                logger.warning(f"Local models unavailable, falling back to cloud: {e}")
                provider, provider_info = self._get_fallback_cloud_provider(effective_policy)
                if provider:
                    model_name, scores = self._select_cloud_model(
                        provider, effective_policy, task_type, complexity
                    )
                    server_url = self.config.get("llm", {}).get("providers", {}).get(provider, {}).get("base_url", "")
                    server_name = provider
                    model_size = 100.0
                else:
                    raise
            else:
                logger.error(f"No private models available and policy requires privacy: {e}")
                raise
        
        # 5. Определяем tier на основе размера модели
        tier = self._determine_tier(model_size, complexity)
        
        # 6. Находим fallback модели с учётом политики
        fallbacks = await self._find_fallbacks_with_policy(
            model_name,
            provider,
            task_type,
            complexity,
            effective_policy
        )
        
        # 7. Определяем оптимальную температуру и токены
        temperature = self._get_optimal_temperature(task_type, complexity)
        max_tokens = self._get_optimal_max_tokens(complexity)
        
        # 8. Получаем стоимость модели
        cost_tier = provider_info.get_model_cost(model_name)
        
        # 9. Формируем результат
        selection = UnifiedModelSelection(
            model=model_name,
            server_url=server_url,
            server_name=server_name,
            provider=provider,
            tier=tier,
            total_score=scores["total"],
            capability_score=scores["capability"],
            performance_score=scores["performance"],
            speed_score=scores["speed"],
            quality_score=scores["quality"],
            complexity_level=complexity,
            reason=self._build_reason_with_policy(provider, task_type, complexity, effective_policy),
            fallback_models=fallbacks,
            recommended_temperature=temperature,
            recommended_max_tokens=max_tokens,
            # Новые поля
            is_local=provider_info.is_local,
            is_private=provider_info.is_private,
            cost_tier=cost_tier,
            policy_applied=effective_policy,
        )
        
        logger.info(
            f"UnifiedModelRouter: selected {selection.model} @ {selection.server_name} "
            f"(score: {selection.total_score:.2f}, tier: {tier.value}, "
            f"complexity: {complexity}, provider: {provider}, "
            f"is_private: {selection.is_private}, cost: {cost_tier.name})"
        )
        
        return selection
    
    def _select_provider_by_policy(
        self,
        policy: RoutingPolicy,
        task_type: str
    ) -> tuple[str, ProviderInfo]:
        """Выбирает провайдера на основе политики"""
        
        # Фильтруем провайдеров по политике
        available_providers = []
        for name, info in self._providers.items():
            if policy.allows_provider(info):
                # Проверяем что провайдер включён в конфиге
                provider_config = self.config.get("llm", {}).get("providers", {}).get(name, {})
                if provider_config.get("enabled", False):
                    available_providers.append((name, info))
        
        if not available_providers:
            # Если ничего не подходит под политику, используем Ollama как fallback
            logger.warning("No providers match policy, falling back to ollama")
            return "ollama", self._providers["ollama"]
        
        # Сортируем по приоритету
        def provider_score(item: tuple[str, ProviderInfo]) -> float:
            name, info = item
            score = 0.0
            
            # Приоритет локальным если prefer_local
            if policy.prefer_local and info.is_local:
                score += 100
            
            # Приоритет дешёвым если prefer_cheap
            if policy.prefer_cheap:
                score += (5 - info.cost_tier.value) * 20
            
            # Приоритет качеству если prefer_quality (облачные обычно качественнее)
            if policy.prefer_quality and not info.is_local:
                score += 10
            
            # Ollama всегда имеет небольшой бонус (быстрый отклик)
            if name == "ollama":
                score += 5
            
            return score
        
        available_providers.sort(key=provider_score, reverse=True)
        best_provider = available_providers[0]
        
        return best_provider[0], best_provider[1]
    
    def _select_cloud_model(
        self,
        provider: str,
        policy: RoutingPolicy,
        task_type: str,
        complexity: str
    ) -> tuple[str, Dict[str, float]]:
        """Выбирает модель облачного провайдера"""
        provider_config = self.config.get("llm", {}).get("providers", {}).get(provider, {})
        default_model = provider_config.get("default_model", "")
        
        provider_info = self._providers.get(provider)
        if not provider_info:
            return default_model, {"total": 0.7, "capability": 0.7, "performance": 0.7, "speed": 0.7, "quality": 0.7}
        
        # Выбираем модель по стоимости
        if policy.prefer_cheap:
            # Ищем самую дешёвую модель
            cheapest_model = None
            cheapest_tier = CostTier.PREMIUM
            for model, tier in provider_info.models_cost_map.items():
                if tier.value <= policy.max_cost_tier.value and tier.value < cheapest_tier.value:
                    cheapest_model = model
                    cheapest_tier = tier
            if cheapest_model:
                default_model = cheapest_model
        
        # Для сложных задач предпочитаем мощные модели
        if complexity in ["complex", "very_complex", "extreme"] and policy.prefer_quality:
            for model, tier in provider_info.models_cost_map.items():
                if tier == CostTier.PREMIUM and tier.value <= policy.max_cost_tier.value:
                    default_model = model
                    break
        
        # Базовые скоры для облачных моделей
        scores = {
            "total": 0.85,
            "capability": 0.9,
            "performance": 0.8,
            "speed": 0.7,
            "quality": 0.9,
        }
        
        return default_model, scores
    
    def _get_fallback_cloud_provider(
        self,
        policy: RoutingPolicy
    ) -> tuple[Optional[str], Optional[ProviderInfo]]:
        """Получает fallback облачного провайдера"""
        for name in ["openai", "anthropic"]:
            info = self._providers.get(name)
            if info and policy.allows_provider(info):
                provider_config = self.config.get("llm", {}).get("providers", {}).get(name, {})
                if provider_config.get("enabled", False):
                    return name, info
        return None, None
    
    async def _find_fallbacks_with_policy(
        self,
        primary_model: str,
        primary_provider: str,
        task_type: str,
        complexity: str,
        policy: RoutingPolicy
    ) -> List[str]:
        """Находит резервные модели с учётом политики"""
        fallbacks = []
        
        # Сначала ищем fallback в том же провайдере
        if primary_provider == "ollama":
            try:
                ranked = self.intelligent_router.get_all_models_ranked(task_type)
                for model_info in ranked:
                    model_name = model_info.get("model", "")
                    if model_name != primary_model:
                        fallbacks.append(f"ollama:{model_name}")
                        if len(fallbacks) >= 2:
                            break
            except Exception as e:
                logger.debug(f"Failed to find ollama fallbacks: {e}")
        
        # Добавляем облачные fallback если политика разрешает
        if not policy.require_private and len(fallbacks) < 3:
            for cloud_provider in ["openai", "anthropic"]:
                if cloud_provider == primary_provider:
                    continue
                info = self._providers.get(cloud_provider)
                if info and policy.allows_provider(info):
                    provider_config = self.config.get("llm", {}).get("providers", {}).get(cloud_provider, {})
                    if provider_config.get("enabled", False):
                        default_model = provider_config.get("default_model", "")
                        if default_model:
                            fallbacks.append(f"{cloud_provider}:{default_model}")
                            if len(fallbacks) >= 3:
                                break
        
        return fallbacks
    
    def _build_reason_with_policy(
        self,
        provider: str,
        task_type: str,
        complexity: str,
        policy: RoutingPolicy
    ) -> str:
        """Строит объяснение выбора с учётом политики"""
        parts = []
        
        provider_info = self._providers.get(provider)
        if provider_info:
            if provider_info.is_private:
                parts.append("private")
            if provider_info.is_local:
                parts.append("local")
            parts.append(f"cost:{provider_info.cost_tier.name}")
        
        if policy.require_private:
            parts.append("policy:privacy-required")
        elif policy.prefer_local:
            parts.append("policy:prefer-local")
        
        if policy.prefer_cheap:
            parts.append("policy:cost-optimized")
        
        if not parts:
            parts.append("best available")
        
        return f"Selected for {task_type}/{complexity}: {', '.join(parts)}"
    
    async def discover_models(self) -> List[str]:
        """Обнаруживает все доступные модели на всех серверах"""
        await self.intelligent_router.discover_servers()
        
        all_models = []
        for server_name, server_info in self.intelligent_router._servers.items():
            if server_info.get("is_available"):
                all_models.extend(server_info.get("models", []))
        
        return list(set(all_models))
    
    async def get_models_ranked(self, task_type: str = "chat") -> List[Dict[str, Any]]:
        """Возвращает все модели с их рейтингами для типа задачи"""
        return self.intelligent_router.get_all_models_ranked(task_type)
    
    def _infer_task_type(self, task: str) -> str:
        """Определяет тип задачи по тексту"""
        task_lower = task.lower()
        
        # Код
        if any(kw in task_lower for kw in [
            "код", "code", "функци", "класс", "python", "javascript",
            "напиши", "создай", "сгенерируй", "игра", "game", "приложение"
        ]):
            return "code"
        
        # Анализ
        if any(kw in task_lower for kw in [
            "проанализируй", "анализ", "analyze", "изучи", "сравни"
        ]):
            return "analysis"
        
        # Исследование
        if any(kw in task_lower for kw in [
            "исследуй", "research", "найди информацию", "что такое"
        ]):
            return "research"
        
        # Рассуждения
        if any(kw in task_lower for kw in [
            "объясни", "почему", "как работает", "логик"
        ]):
            return "reasoning"
        
        # Простой чат
        if any(kw in task_lower for kw in [
            "привет", "здравствуй", "hello", "hi", "как дела"
        ]):
            return "simple_chat"
        
        return "general"
    
    def _determine_tier(self, model_size_b: float, complexity: str) -> ModelTier:
        """Определяет tier модели на основе размера и сложности"""
        # По размеру модели
        if model_size_b >= 30:
            base_tier = ModelTier.POWERFUL
        elif model_size_b >= 7:
            base_tier = ModelTier.BALANCED
        else:
            base_tier = ModelTier.FAST
        
        # Корректируем по сложности
        if complexity in ["complex", "very_complex", "extreme"]:
            # Для сложных задач нужны мощные модели
            if base_tier == ModelTier.FAST:
                return ModelTier.BALANCED
        elif complexity in ["trivial", "simple"]:
            # Для простых задач можно использовать быстрые
            if base_tier == ModelTier.POWERFUL:
                return ModelTier.BALANCED
        
        return base_tier
    
    async def _find_fallbacks(
        self,
        primary_model: str,
        task_type: str,
        complexity: str
    ) -> List[str]:
        """Находит резервные модели (legacy, использует DEFAULT_POLICY)"""
        return await self._find_fallbacks_with_policy(
            primary_model, "ollama", task_type, complexity, self.DEFAULT_POLICY
        )
    
    def _get_optimal_temperature(self, task_type: str, complexity: str) -> float:
        """Определяет оптимальную температуру"""
        base_temp = self._temperature_map.get(task_type, 0.7)
        
        # Для сложных задач чуть снижаем температуру для стабильности
        if complexity in ["complex", "very_complex", "extreme"]:
            base_temp = max(0.1, base_temp - 0.1)
        
        return base_temp
    
    def _get_optimal_max_tokens(self, complexity: str) -> int:
        """Определяет оптимальное количество токенов"""
        return self._tokens_map.get(complexity, 2000)
    
    def _build_reason(
        self,
        scored_model: ScoredModel,
        task_type: str,
        complexity: str
    ) -> str:
        """Строит объяснение выбора (legacy метод)"""
        parts = ["local", "private", "cost:FREE"]
        
        if scored_model.capability_score > 0.7:
            parts.append("strong capabilities")
        if scored_model.performance_score > 0.7:
            parts.append("proven performance")
        if scored_model.speed_score > 0.7:
            parts.append("fast")
        if scored_model.quality_score > 0.8:
            parts.append("high quality")
        
        caps = scored_model.profile.capabilities
        if ModelCapability.CODE_GENERATION in caps and task_type == "code":
            parts.append("code-optimized")
        if ModelCapability.REASONING in caps and task_type == "reasoning":
            parts.append("reasoning-optimized")
        
        return f"Selected for {task_type}/{complexity}: {', '.join(parts)}"


# Singleton instance
_unified_router: Optional[UnifiedModelRouter] = None


def get_unified_router(config: Optional[Dict[str, Any]] = None) -> UnifiedModelRouter:
    """Получить singleton экземпляр UnifiedModelRouter"""
    global _unified_router
    if _unified_router is None:
        if config is None:
            raise ValueError("Config required for first initialization")
        _unified_router = UnifiedModelRouter(config)
    return _unified_router


async def initialize_unified_router(config: Dict[str, Any]) -> UnifiedModelRouter:
    """Инициализировать и вернуть UnifiedModelRouter"""
    router = get_unified_router(config)
    await router.initialize()
    return router

