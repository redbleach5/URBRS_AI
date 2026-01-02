"""
Code Testing Router - API для тестирования и валидации кода.

Endpoints:
- POST /code/test - Запустить тесты для кода
- POST /code/validate - Валидировать синтаксис
- POST /code/test-and-fix - Тест с автоисправлением
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, Dict, Any, List

from backend.core.logger import get_logger
from backend.core.code_tester import CodeTester, get_code_tester, TestResult
from backend.core.code_validator import CodeValidator, get_code_validator, ValidationResult

logger = get_logger(__name__)

router = APIRouter(prefix="/code", tags=["code"])


class TestCodeRequest(BaseModel):
    """Запрос на тестирование кода."""
    code: str
    language: str = "python"
    task_description: Optional[str] = None
    expected_output: Optional[str] = None
    custom_tests: Optional[str] = None
    run_generated_tests: bool = True


class TestCodeResponse(BaseModel):
    """Результат тестирования кода."""
    success: bool
    tests_run: int
    tests_passed: int
    tests_failed: int
    pass_rate: float
    code_ran_successfully: bool
    execution_output: str
    execution_error: str
    test_cases: List[Dict[str, Any]]
    generated_tests: Optional[str] = None
    error: Optional[str] = None


class ValidateCodeRequest(BaseModel):
    """Запрос на валидацию кода."""
    code: str
    language: Optional[str] = None
    fix_errors: bool = True


class ValidateCodeResponse(BaseModel):
    """Результат валидации кода."""
    is_valid: bool
    language: str
    errors_count: int
    warnings_count: int
    issues: List[Dict[str, Any]]
    fixed_code: Optional[str] = None


class TestAndFixRequest(BaseModel):
    """Запрос на тестирование с автоисправлением."""
    code: str
    task_description: str
    max_fix_attempts: int = 2


class TestAndFixResponse(BaseModel):
    """Результат тестирования с автоисправлением."""
    success: bool
    original_code: str
    final_code: str
    was_fixed: bool
    test_result: Dict[str, Any]
    error: Optional[str] = None


@router.post("/test", response_model=TestCodeResponse)
async def test_code(request: Request, test_request: TestCodeRequest):
    """
    Запускает тесты для предоставленного кода.
    
    - Проверяет что код выполняется
    - Генерирует unit-тесты через LLM
    - Запускает pytest
    - Возвращает детальные результаты
    """
    logger.info(f"Testing code: {len(test_request.code)} chars, lang={test_request.language}")
    
    engine = request.app.state.engine
    llm_manager = engine.llm_manager if engine else None
    
    try:
        tester = get_code_tester(llm_manager)
        
        result: TestResult = await tester.test_code(
            code=test_request.code,
            language=test_request.language,
            task_description=test_request.task_description,
            expected_output=test_request.expected_output,
            custom_tests=test_request.custom_tests,
            run_generated_tests=test_request.run_generated_tests
        )
        
        return TestCodeResponse(
            success=result.success,
            tests_run=result.tests_run,
            tests_passed=result.tests_passed,
            tests_failed=result.tests_failed,
            pass_rate=result.pass_rate,
            code_ran_successfully=result.code_ran_successfully,
            execution_output=result.execution_output[:2000],
            execution_error=result.execution_error[:2000],
            test_cases=[tc.to_dict() for tc in result.test_cases],
            generated_tests=result.generated_tests
        )
        
    except Exception as e:
        logger.error(f"Code testing error: {e}")
        return TestCodeResponse(
            success=False,
            tests_run=0,
            tests_passed=0,
            tests_failed=0,
            pass_rate=0.0,
            code_ran_successfully=False,
            execution_output="",
            execution_error=str(e),
            test_cases=[],
            error=str(e)
        )


@router.post("/validate", response_model=ValidateCodeResponse)
async def validate_code(request: Request, validate_request: ValidateCodeRequest):
    """
    Валидирует синтаксис кода.
    
    - Проверяет AST (Python) или скобки (JS)
    - Запускает ruff для Python (если доступен)
    - Может автоматически исправить ошибки через LLM
    """
    logger.info(f"Validating code: {len(validate_request.code)} chars")
    
    engine = request.app.state.engine
    llm_manager = engine.llm_manager if engine else None
    
    try:
        validator = get_code_validator(llm_manager)
        
        result: ValidationResult = await validator.validate(
            code=validate_request.code,
            language=validate_request.language,
            fix_errors=validate_request.fix_errors
        )
        
        return ValidateCodeResponse(
            is_valid=result.is_valid,
            language=result.language,
            errors_count=result.errors_count,
            warnings_count=result.warnings_count,
            issues=[issue.to_dict() for issue in result.issues],
            fixed_code=result.fixed_code
        )
        
    except Exception as e:
        logger.error(f"Code validation error: {e}")
        return ValidateCodeResponse(
            is_valid=False,
            language="unknown",
            errors_count=1,
            warnings_count=0,
            issues=[{
                "severity": "error",
                "code": "INTERNAL",
                "message": str(e),
                "line": 0,
                "column": 0
            }]
        )


@router.post("/test-and-fix", response_model=TestAndFixResponse)
async def test_and_fix_code(request: Request, fix_request: TestAndFixRequest):
    """
    Тестирует код и автоматически исправляет при ошибках.
    
    - Запускает тесты
    - При провале - использует LLM для исправления
    - Повторяет до успеха или исчерпания попыток
    """
    logger.info(f"Test and fix: {len(fix_request.code)} chars, max_attempts={fix_request.max_fix_attempts}")
    
    engine = request.app.state.engine
    if not engine or not engine.llm_manager:
        raise HTTPException(status_code=503, detail="LLM not available for auto-fix")
    
    try:
        tester = get_code_tester(engine.llm_manager)
        
        final_code, result = await tester.test_and_fix(
            code=fix_request.code,
            task_description=fix_request.task_description,
            max_fix_attempts=fix_request.max_fix_attempts
        )
        
        return TestAndFixResponse(
            success=result.success,
            original_code=fix_request.code,
            final_code=final_code,
            was_fixed=final_code != fix_request.code,
            test_result=result.to_dict()
        )
        
    except Exception as e:
        logger.error(f"Test and fix error: {e}")
        return TestAndFixResponse(
            success=False,
            original_code=fix_request.code,
            final_code=fix_request.code,
            was_fixed=False,
            test_result={},
            error=str(e)
        )


@router.get("/capabilities")
async def get_capabilities():
    """
    Возвращает доступные возможности тестирования.
    """
    import subprocess
    import sys
    
    # Проверяем pytest
    pytest_available = False
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pytest", "--version"],
            capture_output=True,
            timeout=5
        )
        pytest_available = result.returncode == 0
    except Exception:
        pass
    
    # Проверяем ruff
    ruff_available = False
    try:
        result = subprocess.run(
            ["ruff", "--version"],
            capture_output=True,
            timeout=5
        )
        ruff_available = result.returncode == 0
    except Exception:
        pass
    
    return {
        "testing": {
            "pytest": pytest_available,
            "unittest": True,  # Встроен в Python
            "auto_test_generation": True,
            "supported_languages": ["python"]
        },
        "validation": {
            "ruff": ruff_available,
            "ast_validation": True,
            "bracket_matching": True,
            "supported_languages": ["python", "javascript", "typescript"]
        },
        "auto_fix": {
            "llm_fix": True,
            "ruff_fix": ruff_available
        }
    }

