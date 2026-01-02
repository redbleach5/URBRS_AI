"""
Tests for CodeTester - code testing and validation.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import asyncio

from backend.core.code_tester import (
    CodeTester,
    TestResult,
    TestStatus,
    TestCase,
    get_code_tester
)


class TestCodeTester:
    """Tests for CodeTester class."""
    
    @pytest.fixture
    def tester(self):
        """Create a CodeTester instance without LLM."""
        return CodeTester(llm_manager=None, auto_generate_tests=False)
    
    @pytest.fixture
    def tester_with_llm(self):
        """Create a CodeTester instance with mock LLM."""
        mock_llm = MagicMock()
        mock_llm.generate = AsyncMock(return_value=MagicMock(
            content="""import pytest

def test_add():
    assert add(1, 2) == 3

def test_add_negative():
    assert add(-1, 1) == 0
"""
        ))
        return CodeTester(llm_manager=mock_llm, auto_generate_tests=True)
    
    @pytest.mark.asyncio
    async def test_empty_code(self, tester):
        """Test that empty code returns error."""
        result = await tester.test_code(code="", language="python")
        assert result.success is False
        assert "No code" in result.execution_error
    
    @pytest.mark.asyncio
    async def test_simple_valid_code(self, tester):
        """Test simple valid Python code."""
        code = """
def add(a, b):
    return a + b

result = add(1, 2)
print(result)
"""
        result = await tester.test_code(code=code, language="python")
        assert result.code_ran_successfully is True
        assert "3" in result.execution_output
    
    @pytest.mark.asyncio
    async def test_syntax_error_code(self, tester):
        """Test code with syntax error."""
        code = """
def broken_function(
    print("missing close paren"
"""
        result = await tester.test_code(code=code, language="python")
        assert result.success is False
        assert result.code_ran_successfully is False
        assert result.execution_error != ""
    
    @pytest.mark.asyncio
    async def test_runtime_error_code(self, tester):
        """Test code with runtime error."""
        code = """
x = 1 / 0  # ZeroDivisionError
"""
        result = await tester.test_code(code=code, language="python")
        assert result.code_ran_successfully is False
        assert "ZeroDivisionError" in result.execution_error or "division" in result.execution_error.lower()
    
    @pytest.mark.asyncio
    async def test_expected_output_match(self, tester):
        """Test expected output verification."""
        code = """
print("Hello, World!")
"""
        result = await tester.test_code(
            code=code,
            language="python",
            expected_output="Hello, World!"
        )
        assert result.success is True
        assert result.tests_passed >= 1
    
    @pytest.mark.asyncio
    async def test_expected_output_mismatch(self, tester):
        """Test expected output mismatch."""
        code = """
print("Hello")
"""
        result = await tester.test_code(
            code=code,
            language="python",
            expected_output="Goodbye"
        )
        # Should still run but test should fail
        assert result.code_ran_successfully is True
        assert result.tests_failed >= 1
    
    @pytest.mark.asyncio
    async def test_dangerous_code_blocked(self, tester):
        """Test that dangerous code is blocked in sandbox mode."""
        dangerous_codes = [
            "import os; os.system('rm -rf /')",
            "import subprocess; subprocess.run(['ls'])",
            "eval('print(1)')",
            "exec('print(1)')",
        ]
        
        for code in dangerous_codes:
            result = await tester.test_code(code=code, language="python")
            assert result.success is False
            assert "sandbox" in result.execution_error.lower() or "rejected" in result.execution_error.lower()
    
    @pytest.mark.asyncio
    async def test_non_python_language(self, tester):
        """Test that non-Python languages return gracefully."""
        code = """
console.log("Hello");
"""
        result = await tester.test_code(code=code, language="javascript")
        assert result.success is True  # Not tested but not failed
        assert "not yet supported" in result.execution_output.lower()
    
    def test_check_output_exact_match(self, tester):
        """Test output checking - exact match."""
        assert tester._check_output("hello", "hello") is True
        assert tester._check_output("  hello  ", "hello") is True
    
    def test_check_output_contains(self, tester):
        """Test output checking - contains."""
        assert tester._check_output("hello world", "world") is True
        assert tester._check_output("result is 42", "42") is True
    
    def test_check_output_numeric(self, tester):
        """Test output checking - numeric comparison."""
        assert tester._check_output("result: 3.14159", "3.14159") is True
        assert tester._check_output("x=3.14, y=2.71", "3.14, 2.71") is True


class TestTestResult:
    """Tests for TestResult dataclass."""
    
    def test_pass_rate_no_tests(self):
        """Test pass rate with no tests."""
        result = TestResult(success=True, code_ran_successfully=True)
        assert result.pass_rate == 1.0
        
        result_failed = TestResult(success=False, code_ran_successfully=False)
        assert result_failed.pass_rate == 0.0
    
    def test_pass_rate_with_tests(self):
        """Test pass rate calculation."""
        result = TestResult(
            success=True,
            tests_run=4,
            tests_passed=3,
            tests_failed=1
        )
        assert result.pass_rate == 0.75
    
    def test_to_dict(self):
        """Test serialization to dict."""
        result = TestResult(
            success=True,
            tests_run=2,
            tests_passed=2,
            test_cases=[
                TestCase(name="test_1", status=TestStatus.PASSED),
                TestCase(name="test_2", status=TestStatus.PASSED)
            ]
        )
        
        data = result.to_dict()
        assert data["success"] is True
        assert data["tests_run"] == 2
        assert len(data["test_cases"]) == 2


class TestTestCase:
    """Tests for TestCase dataclass."""
    
    def test_to_dict(self):
        """Test serialization."""
        tc = TestCase(
            name="test_example",
            status=TestStatus.FAILED,
            duration=0.5,
            error="AssertionError",
            expected="42",
            actual="41"
        )
        
        data = tc.to_dict()
        assert data["name"] == "test_example"
        assert data["status"] == "failed"
        assert data["error"] == "AssertionError"


class TestGetCodeTester:
    """Tests for singleton getter."""
    
    def test_singleton(self):
        """Test that get_code_tester returns singleton."""
        # Reset global
        import backend.core.code_tester as module
        module._code_tester = None
        
        tester1 = get_code_tester()
        tester2 = get_code_tester()
        
        assert tester1 is tester2

