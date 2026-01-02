"""
Tests for ChatSummarizer - chat history summarization.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
import json

from backend.core.chat_summarizer import (
    ChatSummarizer,
    ChatMessage,
    ConversationSummary,
    get_chat_summarizer
)


class TestChatMessage:
    """Tests for ChatMessage dataclass."""
    
    def test_creation(self):
        """Test message creation."""
        msg = ChatMessage(role="user", content="Hello!")
        assert msg.role == "user"
        assert msg.content == "Hello!"
    
    def test_to_dict(self):
        """Test serialization."""
        msg = ChatMessage(
            role="assistant",
            content="Hi there!",
            timestamp="2024-01-01T12:00:00",
            metadata={"model": "gpt-4"}
        )
        data = msg.to_dict()
        assert data["role"] == "assistant"
        assert data["content"] == "Hi there!"
        assert data["metadata"]["model"] == "gpt-4"
    
    def test_from_dict(self):
        """Test deserialization."""
        data = {
            "role": "user",
            "content": "Test message",
            "timestamp": "2024-01-01"
        }
        msg = ChatMessage.from_dict(data)
        assert msg.role == "user"
        assert msg.content == "Test message"
    
    def test_token_estimate(self):
        """Test token estimation."""
        msg = ChatMessage(role="user", content="a" * 100)
        assert msg.token_estimate == 25  # 100 / 4


class TestConversationSummary:
    """Tests for ConversationSummary dataclass."""
    
    def test_to_dict(self):
        """Test serialization."""
        summary = ConversationSummary(
            summary_text="Discussion about Python",
            messages_summarized=10,
            key_topics=["Python", "FastAPI"],
            user_requirements=["Build API"]
        )
        data = summary.to_dict()
        assert data["messages_summarized"] == 10
        assert "Python" in data["key_topics"]
    
    def test_to_system_prompt(self):
        """Test system prompt generation."""
        summary = ConversationSummary(
            summary_text="User wants to build an API",
            messages_summarized=5,
            key_topics=["API", "REST"],
            user_requirements=["FastAPI endpoint"],
            key_decisions=["Use PostgreSQL"]
        )
        
        prompt = summary.to_system_prompt()
        
        assert "КОНТЕКСТ ПРЕДЫДУЩЕГО РАЗГОВОРА" in prompt
        assert "5 сообщений" in prompt
        assert "User wants to build an API" in prompt
        assert "API" in prompt
        assert "FastAPI endpoint" in prompt
        assert "PostgreSQL" in prompt


class TestChatSummarizer:
    """Tests for ChatSummarizer class."""
    
    @pytest.fixture
    def summarizer(self):
        """Create summarizer without LLM."""
        return ChatSummarizer(llm_manager=None, threshold=5, keep_recent=3)
    
    @pytest.fixture
    def summarizer_with_llm(self):
        """Create summarizer with mock LLM."""
        mock_llm = MagicMock()
        mock_llm.generate = AsyncMock(return_value=MagicMock(
            content=json.dumps({
                "summary": "Discussion about Python programming",
                "key_topics": ["Python", "Testing"],
                "user_requirements": ["Write tests"],
                "key_decisions": ["Use pytest"],
                "generated_artifacts": ["test_file.py"]
            })
        ))
        return ChatSummarizer(llm_manager=mock_llm, threshold=5, keep_recent=3)
    
    def test_needs_summarization_false(self, summarizer):
        """Test that short history doesn't need summarization."""
        messages = [
            ChatMessage(role="user", content="Hi"),
            ChatMessage(role="assistant", content="Hello"),
        ]
        assert summarizer.needs_summarization(messages) is False
    
    def test_needs_summarization_true(self, summarizer):
        """Test that long history needs summarization."""
        messages = [
            ChatMessage(role="user", content=f"Message {i}")
            for i in range(10)
        ]
        assert summarizer.needs_summarization(messages) is True
    
    @pytest.mark.asyncio
    async def test_summarize_short_history(self, summarizer):
        """Test that short history is not summarized."""
        messages = [
            ChatMessage(role="user", content="Hi"),
            ChatMessage(role="assistant", content="Hello"),
        ]
        
        result_msgs, summary = await summarizer.summarize_if_needed(messages)
        
        assert len(result_msgs) == 2
        assert summary is None
    
    @pytest.mark.asyncio
    async def test_summarize_long_history(self, summarizer):
        """Test summarization of long history."""
        messages = [
            ChatMessage(role="user", content=f"User message {i}")
            for i in range(10)
        ]
        
        result_msgs, summary = await summarizer.summarize_if_needed(messages)
        
        # Should keep only last 3 messages
        assert len(result_msgs) == 3
        # Should have a summary
        assert summary is not None
        assert summary.messages_summarized == 7  # 10 - 3
    
    @pytest.mark.asyncio
    async def test_summarize_with_llm(self, summarizer_with_llm):
        """Test summarization using LLM."""
        messages = [
            ChatMessage(role="user", content=f"User message {i}")
            for i in range(10)
        ]
        
        result_msgs, summary = await summarizer_with_llm.summarize_if_needed(messages)
        
        assert summary is not None
        assert "Python" in summary.key_topics
        assert summary.summary_text == "Discussion about Python programming"
    
    @pytest.mark.asyncio
    async def test_caching(self, summarizer):
        """Test that summaries are cached."""
        messages = [
            ChatMessage(role="user", content=f"Message {i}")
            for i in range(10)
        ]
        
        # First call
        _, summary1 = await summarizer.summarize_if_needed(
            messages, 
            conversation_id="test-conv-1"
        )
        
        # Second call with same ID
        _, summary2 = await summarizer.summarize_if_needed(
            messages,
            conversation_id="test-conv-1"
        )
        
        # Should use cached summary
        assert summarizer.get_cached_summary("test-conv-1") is not None
    
    def test_clear_cache(self, summarizer):
        """Test cache clearing."""
        summarizer._summary_cache["test"] = ConversationSummary(
            summary_text="Test",
            messages_summarized=1
        )
        
        summarizer.clear_cache("test")
        assert "test" not in summarizer._summary_cache
    
    def test_prepare_messages_with_summary(self, summarizer):
        """Test preparing messages with summary."""
        messages = [
            ChatMessage(role="user", content="Hello"),
            ChatMessage(role="assistant", content="Hi")
        ]
        summary = ConversationSummary(
            summary_text="Previous discussion about greetings",
            messages_summarized=5
        )
        
        result = summarizer.prepare_messages_with_summary(
            messages=messages,
            summary=summary,
            system_prompt="You are a helpful assistant."
        )
        
        # First message should be enhanced system prompt
        assert result[0].role == "system"
        assert "КОНТЕКСТ ПРЕДЫДУЩЕГО РАЗГОВОРА" in result[0].content
        assert "You are a helpful assistant" in result[0].content
        
        # Other messages should follow
        assert len(result) == 3
    
    def test_simple_summary_extraction(self, summarizer):
        """Test heuristic summary without LLM."""
        messages = [
            ChatMessage(role="user", content="Как создать API?"),
            ChatMessage(role="assistant", content="```python\ncode\n```"),
            ChatMessage(role="user", content="Сделай тесты"),
        ]
        
        summary = summarizer._create_simple_summary(messages)
        
        assert summary.messages_summarized == 3
        # Should detect question topics
        assert len(summary.key_topics) > 0 or len(summary.user_requirements) > 0
        # Should detect code artifacts
        assert "код" in summary.generated_artifacts


class TestGetChatSummarizer:
    """Tests for singleton getter."""
    
    def test_singleton(self):
        """Test singleton pattern."""
        import backend.core.chat_summarizer as module
        module._chat_summarizer = None
        
        s1 = get_chat_summarizer()
        s2 = get_chat_summarizer()
        
        assert s1 is s2

