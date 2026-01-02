"""
FactCheckerMixin - Верификация фактов в ответах агентов.

Решает проблему галлюцинаций:
- Извлечение проверяемых утверждений из ответа
- Верификация через RAG (локальные документы)
- Верификация через Web Search (для актуальной информации)
- Маркировка неподтверждённых фактов
- Добавление источников

Интегрируется в BaseAgent для автоматической проверки.
"""

import re
import json
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum

from ..core.logger import get_logger

logger = get_logger(__name__)


class FactConfidence(Enum):
    """Уровень уверенности в факте."""
    VERIFIED = "verified"      # Подтверждён источниками
    LIKELY = "likely"          # Вероятно верен
    UNCERTAIN = "uncertain"    # Не удалось проверить
    DISPUTED = "disputed"      # Противоречит источникам
    HALLUCINATION = "hallucination"  # Явная галлюцинация


@dataclass
class FactClaim:
    """Отдельное утверждение для проверки."""
    text: str
    category: str = "general"  # general, technical, date, statistic, quote
    confidence: FactConfidence = FactConfidence.UNCERTAIN
    sources: List[str] = field(default_factory=list)
    evidence: str = ""
    correction: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "text": self.text,
            "category": self.category,
            "confidence": self.confidence.value,
            "sources": self.sources,
            "evidence": self.evidence[:200] if self.evidence else "",
            "correction": self.correction
        }


@dataclass
class FactCheckResult:
    """Результат проверки фактов."""
    claims_checked: int = 0
    claims_verified: int = 0
    claims_disputed: int = 0
    claims_uncertain: int = 0
    claims: List[FactClaim] = field(default_factory=list)
    overall_reliability: float = 1.0  # 0.0 - 1.0
    corrected_response: Optional[str] = None
    sources_used: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "claims_checked": self.claims_checked,
            "claims_verified": self.claims_verified,
            "claims_disputed": self.claims_disputed,
            "claims_uncertain": self.claims_uncertain,
            "claims": [c.to_dict() for c in self.claims],
            "overall_reliability": self.overall_reliability,
            "has_corrections": self.corrected_response is not None,
            "sources_used": self.sources_used[:10]
        }
    
    @property
    def needs_correction(self) -> bool:
        """Нужно ли исправлять ответ."""
        return self.claims_disputed > 0 or self.overall_reliability < 0.7


class FactCheckerMixin:
    """
    Mixin для верификации фактов в ответах агентов.
    
    Использует:
    - VectorStore (RAG) для проверки по локальным документам
    - Web Search для проверки актуальной информации
    - LLM для извлечения утверждений и анализа
    
    Добавляет методы:
    - check_facts(response) - проверить факты в ответе
    - verify_claim(claim) - проверить отдельное утверждение
    - get_corrected_response(response, result) - исправить ответ
    """
    
    # Конфигурация
    FACT_CHECK_ENABLED = True
    MIN_CLAIMS_TO_CHECK = 1
    MAX_CLAIMS_TO_CHECK = 10
    CONFIDENCE_THRESHOLD = 0.6  # Порог для auto-correction
    
    # Категории утверждений, которые нужно проверять
    CHECKABLE_CATEGORIES = [
        "technical",    # Технические утверждения (API, библиотеки)
        "statistic",    # Статистика и числа
        "date",         # Даты и события
        "quote",        # Цитаты
        "version",      # Версии ПО
    ]
    
    def __init__(self):
        """Инициализация FactChecker."""
        self._fact_check_enabled = self.FACT_CHECK_ENABLED
        self._web_search_tool = None
        self._vector_store = None
    
    def configure_fact_checker(
        self,
        enabled: bool = True,
        web_search_tool = None,
        vector_store = None
    ):
        """
        Настраивает fact checker.
        
        Args:
            enabled: Включить проверку фактов
            web_search_tool: Инструмент для web search
            vector_store: VectorStore для RAG
        """
        self._fact_check_enabled = enabled
        self._web_search_tool = web_search_tool
        self._vector_store = vector_store
    
    async def check_facts(
        self,
        response: str,
        task: str = "",
        use_web: bool = True,
        use_rag: bool = True
    ) -> FactCheckResult:
        """
        Проверяет факты в ответе.
        
        Args:
            response: Ответ для проверки
            task: Исходная задача (для контекста)
            use_web: Использовать web search
            use_rag: Использовать RAG
            
        Returns:
            FactCheckResult с результатами проверки
        """
        result = FactCheckResult()
        
        if not self._fact_check_enabled:
            result.overall_reliability = 1.0
            return result
        
        if not response or len(response) < 50:
            # Слишком короткий ответ - нечего проверять
            return result
        
        try:
            # 1. Извлекаем проверяемые утверждения
            claims = await self._extract_claims(response, task)
            
            if not claims:
                logger.debug("FactChecker: No checkable claims found")
                return result
            
            # 2. Проверяем каждое утверждение
            for claim in claims[:self.MAX_CLAIMS_TO_CHECK]:
                verified_claim = await self._verify_claim(
                    claim, 
                    use_web=use_web,
                    use_rag=use_rag
                )
                result.claims.append(verified_claim)
                result.claims_checked += 1
                
                if verified_claim.confidence == FactConfidence.VERIFIED:
                    result.claims_verified += 1
                elif verified_claim.confidence == FactConfidence.DISPUTED:
                    result.claims_disputed += 1
                elif verified_claim.confidence in (FactConfidence.UNCERTAIN, FactConfidence.HALLUCINATION):
                    result.claims_uncertain += 1
                
                # Собираем источники
                result.sources_used.extend(verified_claim.sources)
            
            # 3. Рассчитываем общую надёжность
            if result.claims_checked > 0:
                # Формула: (verified * 1.0 + uncertain * 0.5) / total
                reliability = (
                    result.claims_verified * 1.0 +
                    (result.claims_checked - result.claims_verified - result.claims_disputed) * 0.5
                ) / result.claims_checked
                result.overall_reliability = max(0.0, min(1.0, reliability))
            
            # 4. Генерируем исправленный ответ если нужно
            if result.needs_correction:
                result.corrected_response = await self._generate_corrected_response(
                    response, result
                )
            
            logger.info(
                f"FactChecker: Checked {result.claims_checked} claims, "
                f"reliability: {result.overall_reliability:.2f}"
            )
            
            return result
            
        except Exception as e:
            logger.error(f"FactChecker error: {e}")
            return result
    
    async def _extract_claims(
        self,
        response: str,
        task: str
    ) -> List[FactClaim]:
        """Извлекает проверяемые утверждения из ответа."""
        claims = []
        
        # Используем LLM для извлечения
        if hasattr(self, 'llm_manager') and self.llm_manager:
            claims = await self._extract_claims_with_llm(response, task)
        
        # Fallback: эвристический метод
        if not claims:
            claims = self._extract_claims_heuristic(response)
        
        return claims
    
    async def _extract_claims_with_llm(
        self,
        response: str,
        task: str
    ) -> List[FactClaim]:
        """Извлекает утверждения через LLM."""
        from ..llm.base import LLMMessage
        
        prompt = f"""Проанализируй ответ и извлеки проверяемые фактические утверждения.

ОТВЕТ:
{response[:2000]}

Извлеки утверждения, которые можно проверить:
- Технические факты (версии, API, синтаксис)
- Статистика и числа
- Даты и события
- Цитаты

НЕ извлекай:
- Мнения и оценки
- Очевидные общеизвестные факты
- Гипотетические утверждения

JSON ответ:
{{
    "claims": [
        {{"text": "утверждение", "category": "technical|statistic|date|quote"}},
        ...
    ]
}}

Если проверяемых утверждений нет, верни {{"claims": []}}"""

        try:
            llm_response = await self.llm_manager.generate(
                messages=[
                    LLMMessage(
                        role="system",
                        content="Ты - эксперт по извлечению фактов. Отвечай только в формате JSON."
                    ),
                    LLMMessage(role="user", content=prompt)
                ],
                temperature=0.1,
                max_tokens=500
            )
            
            content = llm_response.content.strip()
            
            # Парсим JSON
            json_match = None
            if "{" in content:
                start = content.find("{")
                end = content.rfind("}") + 1
                if end > start:
                    try:
                        json_match = json.loads(content[start:end])
                    except json.JSONDecodeError:
                        pass
            
            if json_match and "claims" in json_match:
                return [
                    FactClaim(
                        text=c.get("text", ""),
                        category=c.get("category", "general")
                    )
                    for c in json_match["claims"]
                    if c.get("text")
                ]
            
            return []
            
        except Exception as e:
            logger.debug(f"LLM claim extraction failed: {e}")
            return []
    
    def _extract_claims_heuristic(self, response: str) -> List[FactClaim]:
        """Эвристическое извлечение утверждений."""
        claims = []
        
        # Паттерны для технических утверждений
        patterns = [
            # Версии
            (r"версия (\d+\.\d+(?:\.\d+)?)", "version"),
            (r"version (\d+\.\d+(?:\.\d+)?)", "version"),
            # API/методы
            (r"метод (\w+\.\w+\([^)]*\))", "technical"),
            (r"функция (\w+\([^)]*\))", "technical"),
            # Статистика
            (r"(\d+%|\d+ процент)", "statistic"),
            (r"около (\d+) (?:миллионов|тысяч|пользователей)", "statistic"),
            # Даты
            (r"в (\d{4}) году", "date"),
            (r"с (\d{4})", "date"),
        ]
        
        for pattern, category in patterns:
            matches = re.findall(pattern, response, re.IGNORECASE)
            for match in matches[:2]:  # Не более 2 на паттерн
                # Находим контекст
                if isinstance(match, tuple):
                    match = match[0]
                
                # Ищем предложение с этим match
                sentences = response.split(".")
                for sentence in sentences:
                    if match in sentence:
                        claims.append(FactClaim(
                            text=sentence.strip() + ".",
                            category=category
                        ))
                        break
        
        return claims
    
    async def _verify_claim(
        self,
        claim: FactClaim,
        use_web: bool = True,
        use_rag: bool = True
    ) -> FactClaim:
        """Верифицирует отдельное утверждение."""
        evidence_sources = []
        evidence_text = []
        
        # 1. Проверка через RAG
        if use_rag and self._vector_store:
            try:
                rag_results = await self._check_via_rag(claim.text)
                if rag_results:
                    evidence_sources.extend(rag_results.get("sources", []))
                    evidence_text.append(rag_results.get("evidence", ""))
            except Exception as e:
                logger.debug(f"RAG verification failed: {e}")
        
        # 2. Проверка через Web Search
        if use_web and self._web_search_tool:
            try:
                web_results = await self._check_via_web(claim.text)
                if web_results:
                    evidence_sources.extend(web_results.get("sources", []))
                    evidence_text.append(web_results.get("evidence", ""))
            except Exception as e:
                logger.debug(f"Web verification failed: {e}")
        
        # 3. Анализируем evidence и определяем confidence
        claim.sources = list(set(evidence_sources))[:5]
        claim.evidence = " | ".join(filter(None, evidence_text))[:500]
        
        if evidence_sources:
            # Есть источники - анализируем
            claim.confidence = await self._analyze_evidence(
                claim.text,
                claim.evidence
            )
        else:
            claim.confidence = FactConfidence.UNCERTAIN
        
        return claim
    
    async def _check_via_rag(self, claim_text: str) -> Optional[Dict[str, Any]]:
        """Проверяет утверждение через RAG."""
        if not self._vector_store:
            return None
        
        try:
            # Поиск в vector store
            results = await self._vector_store.search(
                query=claim_text,
                top_k=3
            )
            
            if not results:
                return None
            
            sources = []
            evidence_parts = []
            
            for r in results:
                if r.get("score", 0) > 0.5:  # Минимальный порог релевантности
                    sources.append(r.get("source", "local document"))
                    evidence_parts.append(r.get("content", "")[:200])
            
            if sources:
                return {
                    "sources": sources,
                    "evidence": " ... ".join(evidence_parts)
                }
            
            return None
            
        except Exception as e:
            logger.debug(f"RAG search error: {e}")
            return None
    
    async def _check_via_web(self, claim_text: str) -> Optional[Dict[str, Any]]:
        """Проверяет утверждение через web search."""
        if not self._web_search_tool:
            return None
        
        try:
            # Формируем поисковый запрос
            search_query = self._create_search_query(claim_text)
            
            # Выполняем поиск
            if hasattr(self._web_search_tool, 'execute'):
                result = await self._web_search_tool.execute(search_query)
            elif hasattr(self._web_search_tool, 'search'):
                result = await self._web_search_tool.search(search_query)
            else:
                return None
            
            if not result:
                return None
            
            # Парсим результаты
            sources = []
            evidence_parts = []
            
            if isinstance(result, dict):
                items = result.get("results", result.get("items", []))
                for item in items[:3]:
                    if isinstance(item, dict):
                        url = item.get("url", item.get("link", ""))
                        snippet = item.get("snippet", item.get("description", ""))
                        if url:
                            sources.append(url)
                        if snippet:
                            evidence_parts.append(snippet[:150])
            
            if sources:
                return {
                    "sources": sources,
                    "evidence": " | ".join(evidence_parts)
                }
            
            return None
            
        except Exception as e:
            logger.debug(f"Web search error: {e}")
            return None
    
    def _create_search_query(self, claim_text: str) -> str:
        """Создаёт поисковый запрос для верификации."""
        # Удаляем лишние слова
        stopwords = ["что", "это", "как", "для", "или", "не", "на", "в", "с"]
        words = claim_text.split()
        filtered = [w for w in words if w.lower() not in stopwords]
        
        query = " ".join(filtered[:10])
        
        # Добавляем ключевые слова для верификации
        if len(query) < 20:
            query += " fact check"
        
        return query
    
    async def _analyze_evidence(
        self,
        claim_text: str,
        evidence: str
    ) -> FactConfidence:
        """Анализирует evidence и определяет уровень уверенности."""
        if not evidence:
            return FactConfidence.UNCERTAIN
        
        # Используем LLM для анализа если доступен
        if hasattr(self, 'llm_manager') and self.llm_manager:
            return await self._analyze_evidence_with_llm(claim_text, evidence)
        
        # Эвристический анализ
        evidence_lower = evidence.lower()
        claim_lower = claim_text.lower()
        
        # Простая проверка на совпадение ключевых слов
        claim_words = set(claim_lower.split())
        evidence_words = set(evidence_lower.split())
        
        overlap = len(claim_words & evidence_words) / max(len(claim_words), 1)
        
        if overlap > 0.5:
            return FactConfidence.VERIFIED
        elif overlap > 0.3:
            return FactConfidence.LIKELY
        else:
            return FactConfidence.UNCERTAIN
    
    async def _analyze_evidence_with_llm(
        self,
        claim_text: str,
        evidence: str
    ) -> FactConfidence:
        """Анализирует evidence через LLM."""
        from ..llm.base import LLMMessage
        
        prompt = f"""Проанализируй, подтверждает ли evidence данное утверждение.

УТВЕРЖДЕНИЕ: {claim_text}

EVIDENCE: {evidence[:500]}

Ответь одним словом:
- VERIFIED - evidence подтверждает утверждение
- LIKELY - скорее всего верно, но не на 100%
- UNCERTAIN - нельзя определить
- DISPUTED - evidence противоречит утверждению

Ответ (одно слово):"""

        try:
            response = await self.llm_manager.generate(
                messages=[
                    LLMMessage(
                        role="system",
                        content="Ты - эксперт по верификации фактов. Отвечай одним словом."
                    ),
                    LLMMessage(role="user", content=prompt)
                ],
                temperature=0.1,
                max_tokens=20
            )
            
            answer = response.content.strip().upper()
            
            confidence_map = {
                "VERIFIED": FactConfidence.VERIFIED,
                "LIKELY": FactConfidence.LIKELY,
                "UNCERTAIN": FactConfidence.UNCERTAIN,
                "DISPUTED": FactConfidence.DISPUTED,
                "HALLUCINATION": FactConfidence.HALLUCINATION
            }
            
            return confidence_map.get(answer, FactConfidence.UNCERTAIN)
            
        except Exception as e:
            logger.debug(f"LLM evidence analysis failed: {e}")
            return FactConfidence.UNCERTAIN
    
    async def _generate_corrected_response(
        self,
        original_response: str,
        result: FactCheckResult
    ) -> Optional[str]:
        """Генерирует исправленный ответ."""
        if not hasattr(self, 'llm_manager') or not self.llm_manager:
            return None
        
        # Собираем информацию об ошибках
        issues = []
        for claim in result.claims:
            if claim.confidence == FactConfidence.DISPUTED:
                issues.append(f"ОШИБКА: \"{claim.text}\" - {claim.evidence}")
            elif claim.confidence == FactConfidence.HALLUCINATION:
                issues.append(f"ГАЛЛЮЦИНАЦИЯ: \"{claim.text}\"")
        
        if not issues:
            return None
        
        from ..llm.base import LLMMessage
        
        prompt = f"""Исправь следующий ответ, устранив обнаруженные фактические ошибки.

ОРИГИНАЛЬНЫЙ ОТВЕТ:
{original_response[:2000]}

ОБНАРУЖЕННЫЕ ПРОБЛЕМЫ:
{chr(10).join(issues)}

ИНСТРУКЦИИ:
1. Исправь только ошибочные факты
2. Сохрани стиль и структуру ответа
3. Если нет уверенности - добавь оговорку
4. Добавь источники где это уместно

Исправленный ответ:"""

        try:
            response = await self.llm_manager.generate(
                messages=[
                    LLMMessage(
                        role="system",
                        content="Ты - редактор, исправляющий фактические ошибки."
                    ),
                    LLMMessage(role="user", content=prompt)
                ],
                temperature=0.2,
                max_tokens=len(original_response) + 500
            )
            
            return response.content.strip()
            
        except Exception as e:
            logger.warning(f"Failed to generate corrected response: {e}")
            return None
    
    async def execute_with_fact_check(
        self,
        task: str,
        context: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Выполняет задачу с проверкой фактов.
        
        Интегрируется с execute() агента.
        """
        # Выполняем основную задачу
        result = await self.execute(task, context or {})
        
        if not self._fact_check_enabled:
            return result
        
        # Извлекаем ответ
        response_text = ""
        if isinstance(result, dict):
            response_text = result.get("response", result.get("content", ""))
            if isinstance(response_text, dict):
                response_text = response_text.get("content", "")
        elif isinstance(result, str):
            response_text = result
        
        if not response_text:
            return result
        
        # Проверяем факты
        fact_result = await self.check_facts(response_text, task)
        
        # Добавляем результаты проверки
        if isinstance(result, dict):
            result["fact_check"] = fact_result.to_dict()
            
            if fact_result.corrected_response:
                result["original_response"] = response_text
                result["response"] = fact_result.corrected_response
                result["content"] = fact_result.corrected_response
        
        return result

