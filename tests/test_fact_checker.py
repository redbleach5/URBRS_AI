"""
Tests for FactCheckerMixin - fact verification in agent responses.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import json

from backend.agents.fact_checker_mixin import (
    FactCheckerMixin,
    FactCheckResult,
    FactClaim,
    FactConfidence
)


class MockAgent(FactCheckerMixin):
    """Mock agent for testing the mixin."""
    
    def __init__(self, llm_manager=None):
        FactCheckerMixin.__init__(self)
        self.llm_manager = llm_manager
    
    async def execute(self, task: str, context: dict = None):
        """Mock execute method."""
        return {"response": "Test response", "success": True}


class TestFactConfidence:
    """Tests for FactConfidence enum."""
    
    def test_values(self):
        """Test enum values."""
        assert FactConfidence.VERIFIED.value == "verified"
        assert FactConfidence.HALLUCINATION.value == "hallucination"


class TestFactClaim:
    """Tests for FactClaim dataclass."""
    
    def test_creation(self):
        """Test claim creation."""
        claim = FactClaim(
            text="Python 3.12 was released in 2023",
            category="date"
        )
        assert claim.text == "Python 3.12 was released in 2023"
        assert claim.category == "date"
        assert claim.confidence == FactConfidence.UNCERTAIN
    
    def test_to_dict(self):
        """Test serialization."""
        claim = FactClaim(
            text="Test claim",
            category="technical",
            confidence=FactConfidence.VERIFIED,
            sources=["https://example.com"],
            evidence="Found in documentation"
        )
        
        data = claim.to_dict()
        assert data["confidence"] == "verified"
        assert len(data["sources"]) == 1


class TestFactCheckResult:
    """Tests for FactCheckResult dataclass."""
    
    def test_needs_correction_false(self):
        """Test when no correction needed."""
        result = FactCheckResult(
            claims_checked=3,
            claims_verified=3,
            overall_reliability=1.0
        )
        assert result.needs_correction is False
    
    def test_needs_correction_disputed(self):
        """Test when disputed claims exist."""
        result = FactCheckResult(
            claims_checked=3,
            claims_verified=2,
            claims_disputed=1,
            overall_reliability=0.8
        )
        assert result.needs_correction is True
    
    def test_needs_correction_low_reliability(self):
        """Test when reliability is low."""
        result = FactCheckResult(
            claims_checked=3,
            claims_verified=1,
            overall_reliability=0.5
        )
        assert result.needs_correction is True
    
    def test_to_dict(self):
        """Test serialization."""
        result = FactCheckResult(
            claims_checked=2,
            claims_verified=1,
            claims_disputed=1,
            overall_reliability=0.7,
            sources_used=["source1", "source2"]
        )
        
        data = result.to_dict()
        assert data["claims_checked"] == 2
        assert len(data["sources_used"]) == 2


class TestFactCheckerMixin:
    """Tests for FactCheckerMixin."""
    
    @pytest.fixture
    def agent(self):
        """Create mock agent without LLM."""
        return MockAgent(llm_manager=None)
    
    @pytest.fixture
    def agent_with_llm(self):
        """Create mock agent with LLM."""
        mock_llm = MagicMock()
        mock_llm.generate = AsyncMock(return_value=MagicMock(
            content=json.dumps({
                "claims": [
                    {"text": "Python 3.12 was released in 2023", "category": "date"},
                    {"text": "FastAPI uses Starlette", "category": "technical"}
                ]
            })
        ))
        return MockAgent(llm_manager=mock_llm)
    
    def test_configure(self, agent):
        """Test configuration."""
        mock_web = MagicMock()
        mock_rag = MagicMock()
        
        agent.configure_fact_checker(
            enabled=True,
            web_search_tool=mock_web,
            vector_store=mock_rag
        )
        
        assert agent._fact_check_enabled is True
        assert agent._web_search_tool is mock_web
        assert agent._vector_store is mock_rag
    
    @pytest.mark.asyncio
    async def test_check_facts_disabled(self, agent):
        """Test when fact checking is disabled."""
        agent._fact_check_enabled = False
        
        result = await agent.check_facts("Any response")
        
        assert result.overall_reliability == 1.0
        assert result.claims_checked == 0
    
    @pytest.mark.asyncio
    async def test_check_facts_short_response(self, agent):
        """Test with too short response."""
        result = await agent.check_facts("Hi")
        
        assert result.claims_checked == 0
    
    @pytest.mark.asyncio
    async def test_extract_claims_heuristic(self, agent):
        """Test heuristic claim extraction."""
        response = """
        Python версия 3.12 была выпущена в 2023 году.
        Метод response.json() возвращает данные.
        Около 50% разработчиков используют Python.
        """
        
        claims = agent._extract_claims_heuristic(response)
        
        assert len(claims) > 0
        # Should detect version, method, and statistic
        categories = [c.category for c in claims]
        assert "version" in categories or "date" in categories
    
    @pytest.mark.asyncio
    async def test_extract_claims_with_llm(self, agent_with_llm):
        """Test LLM-based claim extraction."""
        response = "Python 3.12 was released in 2023. FastAPI uses Starlette."
        
        claims = await agent_with_llm._extract_claims_with_llm(response, "test task")
        
        assert len(claims) == 2
        assert claims[0].category == "date"
        assert claims[1].category == "technical"
    
    def test_create_search_query(self, agent):
        """Test search query creation."""
        claim = "Python версия 3.12 была выпущена в октябре 2023"
        
        query = agent._create_search_query(claim)
        
        # Should remove stopwords
        assert "в" not in query.split()
        # Should have enough content
        assert len(query) > 10
    
    @pytest.mark.asyncio
    async def test_analyze_evidence_heuristic(self, agent):
        """Test heuristic evidence analysis."""
        claim = "Python is a programming language"
        evidence = "Python is a popular programming language used for web development"
        
        confidence = await agent._analyze_evidence(claim, evidence)
        
        # Should find overlap
        assert confidence in (FactConfidence.VERIFIED, FactConfidence.LIKELY)
    
    @pytest.mark.asyncio
    async def test_analyze_evidence_no_evidence(self, agent):
        """Test when no evidence provided."""
        confidence = await agent._analyze_evidence("Any claim", "")
        assert confidence == FactConfidence.UNCERTAIN
    
    @pytest.mark.asyncio
    async def test_check_via_rag(self, agent):
        """Test RAG verification."""
        mock_vector_store = MagicMock()
        mock_vector_store.search = AsyncMock(return_value=[
            {"content": "Python 3.12 was released in October 2023", "score": 0.8, "source": "docs"}
        ])
        
        agent._vector_store = mock_vector_store
        
        result = await agent._check_via_rag("Python 3.12 release date")
        
        assert result is not None
        assert len(result["sources"]) > 0
        assert "2023" in result["evidence"]
    
    @pytest.mark.asyncio
    async def test_check_via_rag_low_score(self, agent):
        """Test RAG with low relevance score."""
        mock_vector_store = MagicMock()
        mock_vector_store.search = AsyncMock(return_value=[
            {"content": "Unrelated content", "score": 0.3, "source": "docs"}
        ])
        
        agent._vector_store = mock_vector_store
        
        result = await agent._check_via_rag("Very specific query")
        
        # Low score should be filtered out
        assert result is None or len(result.get("sources", [])) == 0


class TestFactCheckIntegration:
    """Integration tests for fact checking."""
    
    @pytest.mark.asyncio
    async def test_full_check_flow(self):
        """Test complete fact checking flow."""
        # Create agent with mocked LLM
        mock_llm = MagicMock()
        
        # Mock claim extraction - must return claims in proper format
        mock_llm.generate = AsyncMock(side_effect=[
            # First call - extract claims
            MagicMock(content=json.dumps({
                "claims": [{"text": "Test claim about Python 3.12", "category": "technical"}]
            })),
            # Second call - analyze evidence  
            MagicMock(content="VERIFIED"),
        ])
        
        agent = MockAgent(llm_manager=mock_llm)
        agent._fact_check_enabled = True
        
        # Mock RAG
        mock_rag = MagicMock()
        mock_rag.search = AsyncMock(return_value=[
            {"content": "Test claim is correct", "score": 0.9, "source": "docs"}
        ])
        agent._vector_store = mock_rag
        
        # Longer response to pass the 50-char check
        response = "This is a longer test response that contains information. Test claim about Python 3.12 is quite important for this context."
        
        result = await agent.check_facts(response, use_web=False)
        
        # Since we mocked the LLM to return claims, we should have checked at least 1
        assert result.claims_checked >= 1

