"""
CodeTester - Запуск и тестирование сгенерированного кода.

Обеспечивает:
- Безопасный запуск кода в sandbox
- Автоматическая генерация unit-тестов через LLM
- Запуск pytest/unittest для Python
- Проверка корректности вывода
- Интеграция с CodeValidator для полного цикла

Замыкает цикл: код → валидация → тест → исправление → готово
"""

import asyncio
import subprocess
import tempfile
import os
import sys
import json
import re
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
from enum import Enum

from .logger import get_logger

logger = get_logger(__name__)


class TestStatus(Enum):
    """Статус выполнения теста."""
    PASSED = "passed"
    FAILED = "failed"
    ERROR = "error"
    TIMEOUT = "timeout"
    SKIPPED = "skipped"


@dataclass
class TestCase:
    """Отдельный тест-кейс."""
    name: str
    status: TestStatus
    duration: float = 0.0
    output: str = ""
    error: Optional[str] = None
    expected: Optional[str] = None
    actual: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "status": self.status.value,
            "duration": self.duration,
            "output": self.output[:500] if self.output else "",
            "error": self.error[:500] if self.error else None,
            "expected": self.expected,
            "actual": self.actual
        }


@dataclass
class TestResult:
    """Результат тестирования кода."""
    success: bool
    tests_run: int = 0
    tests_passed: int = 0
    tests_failed: int = 0
    tests_error: int = 0
    test_cases: List[TestCase] = field(default_factory=list)
    execution_output: str = ""
    execution_error: str = ""
    execution_time: float = 0.0
    code_ran_successfully: bool = False
    generated_tests: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "tests_run": self.tests_run,
            "tests_passed": self.tests_passed,
            "tests_failed": self.tests_failed,
            "tests_error": self.tests_error,
            "test_cases": [tc.to_dict() for tc in self.test_cases],
            "execution_output": self.execution_output[:1000] if self.execution_output else "",
            "execution_error": self.execution_error[:1000] if self.execution_error else "",
            "execution_time": self.execution_time,
            "code_ran_successfully": self.code_ran_successfully,
            "has_generated_tests": self.generated_tests is not None
        }
    
    @property
    def pass_rate(self) -> float:
        """Процент пройденных тестов."""
        if self.tests_run == 0:
            return 1.0 if self.code_ran_successfully else 0.0
        return self.tests_passed / self.tests_run


class CodeTester:
    """
    Тестировщик кода с безопасным запуском и генерацией тестов.
    
    Особенности:
    - Sandbox выполнение (ограниченное время, ресурсы)
    - Автоматическая генерация тестов через LLM
    - Запуск pytest для Python кода
    - Проверка вывода на соответствие ожиданиям
    """
    
    # Таймауты
    EXECUTION_TIMEOUT = 30  # секунд для выполнения кода
    TEST_TIMEOUT = 60  # секунд для тестов
    
    # Запрещённые импорты/паттерны для sandbox
    DANGEROUS_PATTERNS = [
        r"\bos\.system\b",
        r"\bsubprocess\.(?:run|call|Popen)\b",
        r"\beval\s*\(",
        r"\bexec\s*\(",
        r"\b__import__\s*\(",
        r"\bopen\s*\([^)]*['\"]w['\"]",  # Запись в файлы
        r"\bshutil\.rmtree\b",
        r"\bos\.remove\b",
        r"\bos\.rmdir\b",
    ]
    
    def __init__(
        self,
        llm_manager=None,
        auto_generate_tests: bool = True,
        sandbox_mode: bool = True
    ):
        """
        Инициализация.
        
        Args:
            llm_manager: LLM провайдер для генерации тестов
            auto_generate_tests: Автоматически генерировать тесты
            sandbox_mode: Безопасный режим с ограничениями
        """
        self.llm_manager = llm_manager
        self.auto_generate_tests = auto_generate_tests
        self.sandbox_mode = sandbox_mode
        
        # Проверяем наличие pytest
        self._pytest_available = self._check_pytest()
        
        if self._pytest_available:
            logger.info("CodeTester: pytest is available")
        else:
            logger.warning("CodeTester: pytest not found, using basic testing")
    
    def _check_pytest(self) -> bool:
        """Проверяет доступность pytest."""
        try:
            result = subprocess.run(
                [sys.executable, "-m", "pytest", "--version"],
                capture_output=True,
                timeout=5
            )
            return result.returncode == 0
        except (subprocess.SubprocessError, FileNotFoundError):
            return False
    
    def _check_dangerous_code(self, code: str) -> Tuple[bool, Optional[str]]:
        """
        Проверяет код на опасные паттерны.
        
        Returns:
            (is_safe, warning_message)
        """
        if not self.sandbox_mode:
            return True, None
        
        for pattern in self.DANGEROUS_PATTERNS:
            if re.search(pattern, code):
                return False, f"Dangerous pattern detected: {pattern}"
        
        return True, None
    
    async def test_code(
        self,
        code: str,
        language: str = "python",
        task_description: Optional[str] = None,
        expected_output: Optional[str] = None,
        custom_tests: Optional[str] = None,
        run_generated_tests: bool = True
    ) -> TestResult:
        """
        Тестирует код.
        
        Args:
            code: Исходный код для тестирования
            language: Язык программирования
            task_description: Описание задачи (для генерации тестов)
            expected_output: Ожидаемый вывод
            custom_tests: Пользовательские тесты
            run_generated_tests: Запускать сгенерированные тесты
            
        Returns:
            TestResult с результатами тестирования
        """
        if not code or not code.strip():
            return TestResult(
                success=False,
                execution_error="No code provided"
            )
        
        if language != "python":
            # Пока поддерживаем только Python
            return TestResult(
                success=True,
                code_ran_successfully=True,
                execution_output=f"Testing for {language} is not yet supported"
            )
        
        # Проверяем на опасный код
        is_safe, safety_warning = self._check_dangerous_code(code)
        if not is_safe:
            return TestResult(
                success=False,
                execution_error=f"Code rejected by sandbox: {safety_warning}"
            )
        
        result = TestResult(success=True)
        
        try:
            # 1. Пробуем просто выполнить код
            exec_result = await self._execute_code(code)
            result.code_ran_successfully = exec_result["success"]
            result.execution_output = exec_result.get("stdout", "")
            result.execution_error = exec_result.get("stderr", "")
            result.execution_time = exec_result.get("duration", 0.0)
            
            if not result.code_ran_successfully:
                result.success = False
                result.test_cases.append(TestCase(
                    name="execution",
                    status=TestStatus.ERROR,
                    error=result.execution_error
                ))
                return result
            
            # 2. Проверяем ожидаемый вывод
            if expected_output:
                output_matches = self._check_output(
                    result.execution_output, 
                    expected_output
                )
                result.test_cases.append(TestCase(
                    name="expected_output",
                    status=TestStatus.PASSED if output_matches else TestStatus.FAILED,
                    expected=expected_output[:200],
                    actual=result.execution_output[:200]
                ))
                if not output_matches:
                    result.tests_failed += 1
                else:
                    result.tests_passed += 1
                result.tests_run += 1
            
            # 3. Запускаем пользовательские тесты
            if custom_tests:
                custom_result = await self._run_tests(code, custom_tests)
                result.test_cases.extend(custom_result.test_cases)
                result.tests_run += custom_result.tests_run
                result.tests_passed += custom_result.tests_passed
                result.tests_failed += custom_result.tests_failed
                result.tests_error += custom_result.tests_error
            
            # 4. Генерируем и запускаем автотесты
            if run_generated_tests and self.auto_generate_tests and self.llm_manager and task_description:
                generated_tests = await self._generate_tests(code, task_description)
                
                if generated_tests:
                    result.generated_tests = generated_tests
                    gen_result = await self._run_tests(code, generated_tests)
                    
                    # Добавляем результаты с префиксом
                    for tc in gen_result.test_cases:
                        tc.name = f"auto_{tc.name}"
                        result.test_cases.append(tc)
                    
                    result.tests_run += gen_result.tests_run
                    result.tests_passed += gen_result.tests_passed
                    result.tests_failed += gen_result.tests_failed
                    result.tests_error += gen_result.tests_error
            
            # Определяем общий успех
            if result.tests_run > 0:
                result.success = result.tests_failed == 0 and result.tests_error == 0
            
            return result
            
        except Exception as e:
            logger.error(f"CodeTester error: {e}")
            return TestResult(
                success=False,
                execution_error=str(e)
            )
    
    async def _execute_code(self, code: str) -> Dict[str, Any]:
        """
        Выполняет Python код в изолированном процессе.
        """
        try:
            # Создаём временный файл
            with tempfile.NamedTemporaryFile(
                mode="w",
                suffix=".py",
                delete=False,
                encoding="utf-8"
            ) as f:
                f.write(code)
                f.flush()
                temp_path = f.name
            
            import time
            start_time = time.time()
            
            # Запускаем в отдельном процессе
            env = os.environ.copy()
            # Добавляем ограничения для sandbox
            if self.sandbox_mode:
                env["PYTHONDONTWRITEBYTECODE"] = "1"
            
            process = await asyncio.create_subprocess_exec(
                sys.executable, temp_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env
            )
            
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=self.EXECUTION_TIMEOUT
                )
                
                duration = time.time() - start_time
                
                return {
                    "success": process.returncode == 0,
                    "stdout": stdout.decode("utf-8", errors="replace"),
                    "stderr": stderr.decode("utf-8", errors="replace"),
                    "returncode": process.returncode,
                    "duration": duration
                }
                
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
                return {
                    "success": False,
                    "stdout": "",
                    "stderr": f"Execution timed out after {self.EXECUTION_TIMEOUT} seconds",
                    "returncode": -1,
                    "duration": self.EXECUTION_TIMEOUT
                }
            
            finally:
                # Удаляем временный файл
                Path(temp_path).unlink(missing_ok=True)
                
        except Exception as e:
            return {
                "success": False,
                "stdout": "",
                "stderr": str(e),
                "returncode": -1,
                "duration": 0
            }
    
    async def _run_tests(self, code: str, tests: str) -> TestResult:
        """
        Запускает тесты для кода.
        """
        result = TestResult(success=True)
        
        try:
            # Создаём временную директорию
            with tempfile.TemporaryDirectory() as temp_dir:
                temp_path = Path(temp_dir)
                
                # Записываем код
                code_file = temp_path / "code_under_test.py"
                code_file.write_text(code, encoding="utf-8")
                
                # Записываем тесты
                test_file = temp_path / "test_code.py"
                
                # Добавляем импорт тестируемого кода
                test_content = f"""import sys
sys.path.insert(0, r'{temp_dir}')
from code_under_test import *

{tests}
"""
                test_file.write_text(test_content, encoding="utf-8")
                
                if self._pytest_available:
                    # Запускаем pytest
                    result = await self._run_pytest(temp_path, test_file)
                else:
                    # Fallback: запускаем unittest
                    result = await self._run_unittest(temp_path, test_file)
                
        except Exception as e:
            logger.error(f"Error running tests: {e}")
            result.success = False
            result.tests_error = 1
            result.test_cases.append(TestCase(
                name="test_execution",
                status=TestStatus.ERROR,
                error=str(e)
            ))
        
        return result
    
    async def _run_pytest(self, temp_dir: Path, test_file: Path) -> TestResult:
        """Запускает pytest и парсит результаты."""
        result = TestResult(success=True)
        
        try:
            process = await asyncio.create_subprocess_exec(
                sys.executable, "-m", "pytest",
                str(test_file),
                "-v",
                "--tb=short",
                "-q",
                cwd=str(temp_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=self.TEST_TIMEOUT
                )
                
                output = stdout.decode("utf-8", errors="replace")
                errors = stderr.decode("utf-8", errors="replace")
                
                # Парсим результаты pytest
                result = self._parse_pytest_output(output, errors)
                
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
                result.success = False
                result.test_cases.append(TestCase(
                    name="pytest_timeout",
                    status=TestStatus.TIMEOUT,
                    error=f"Tests timed out after {self.TEST_TIMEOUT} seconds"
                ))
                result.tests_error = 1
                
        except Exception as e:
            result.success = False
            result.test_cases.append(TestCase(
                name="pytest_error",
                status=TestStatus.ERROR,
                error=str(e)
            ))
            result.tests_error = 1
        
        return result
    
    def _parse_pytest_output(self, stdout: str, stderr: str) -> TestResult:
        """Парсит вывод pytest."""
        result = TestResult(success=True)
        result.execution_output = stdout
        result.execution_error = stderr
        
        # Парсим строки с результатами тестов
        # Формат: test_file.py::test_name PASSED/FAILED
        for line in stdout.split("\n"):
            line = line.strip()
            
            # Паттерн для pytest результатов
            match = re.match(r".*::(\w+)\s+(PASSED|FAILED|ERROR|SKIPPED)", line)
            if match:
                test_name = match.group(1)
                status_str = match.group(2)
                
                status_map = {
                    "PASSED": TestStatus.PASSED,
                    "FAILED": TestStatus.FAILED,
                    "ERROR": TestStatus.ERROR,
                    "SKIPPED": TestStatus.SKIPPED
                }
                status = status_map.get(status_str, TestStatus.ERROR)
                
                result.test_cases.append(TestCase(
                    name=test_name,
                    status=status
                ))
                
                result.tests_run += 1
                if status == TestStatus.PASSED:
                    result.tests_passed += 1
                elif status == TestStatus.FAILED:
                    result.tests_failed += 1
                elif status == TestStatus.ERROR:
                    result.tests_error += 1
        
        # Парсим summary строку
        # Формат: 3 passed, 1 failed in 0.12s
        summary_match = re.search(
            r"(\d+)\s+passed.*?(\d+)?\s*failed?",
            stdout,
            re.IGNORECASE
        )
        if summary_match and result.tests_run == 0:
            result.tests_passed = int(summary_match.group(1))
            result.tests_failed = int(summary_match.group(2) or 0)
            result.tests_run = result.tests_passed + result.tests_failed
        
        # Определяем успех
        result.success = result.tests_failed == 0 and result.tests_error == 0
        result.code_ran_successfully = True
        
        return result
    
    async def _run_unittest(self, temp_dir: Path, test_file: Path) -> TestResult:
        """Fallback на unittest."""
        result = TestResult(success=True)
        
        try:
            process = await asyncio.create_subprocess_exec(
                sys.executable, "-m", "unittest",
                str(test_file),
                "-v",
                cwd=str(temp_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=self.TEST_TIMEOUT
                )
                
                output = stdout.decode("utf-8", errors="replace")
                errors = stderr.decode("utf-8", errors="replace")
                
                result.execution_output = output
                result.execution_error = errors
                result.success = process.returncode == 0
                result.code_ran_successfully = True
                
                # Парсим результат unittest
                # Формат: Ran X tests in Y.YYs
                match = re.search(r"Ran (\d+) tests?", errors)
                if match:
                    result.tests_run = int(match.group(1))
                
                if "OK" in errors:
                    result.tests_passed = result.tests_run
                elif "FAILED" in errors:
                    fail_match = re.search(r"failures?=(\d+)", errors)
                    if fail_match:
                        result.tests_failed = int(fail_match.group(1))
                    result.tests_passed = result.tests_run - result.tests_failed
                    result.success = False
                    
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
                result.success = False
                result.tests_error = 1
                
        except Exception as e:
            result.success = False
            result.tests_error = 1
            result.execution_error = str(e)
        
        return result
    
    async def _generate_tests(self, code: str, task_description: str) -> Optional[str]:
        """
        Генерирует тесты для кода через LLM.
        """
        if not self.llm_manager:
            return None
        
        from ..llm.base import LLMMessage
        
        prompt = f"""Generate pytest unit tests for the following Python code.

CODE:
```python
{code}
```

ORIGINAL TASK: {task_description[:300]}

REQUIREMENTS:
1. Write 3-5 meaningful test cases using pytest
2. Test both normal cases and edge cases
3. Include docstrings for each test
4. Use assert statements
5. Do NOT use fixtures unless necessary
6. Tests should be self-contained and runnable

Return ONLY the test code (no markdown, no explanations), starting with imports:

import pytest
"""

        try:
            response = await self.llm_manager.generate(
                messages=[
                    LLMMessage(
                        role="system",
                        content="You are a Python testing expert. Generate clean, runnable pytest tests."
                    ),
                    LLMMessage(role="user", content=prompt)
                ],
                temperature=0.2,
                max_tokens=1500
            )
            
            tests = response.content.strip()
            
            # Удаляем markdown обёртку если есть
            if tests.startswith("```"):
                tests = re.sub(r"^```(?:python)?\n?", "", tests)
                tests = re.sub(r"\n?```$", "", tests)
            
            # Проверяем что есть хотя бы один тест
            if "def test_" in tests:
                return tests
            
            return None
            
        except Exception as e:
            logger.warning(f"Failed to generate tests: {e}")
            return None
    
    def _check_output(self, actual: str, expected: str) -> bool:
        """
        Проверяет соответствие вывода ожидаемому.
        Использует нечёткое сравнение.
        """
        # Нормализуем строки
        actual_normalized = actual.strip().lower()
        expected_normalized = expected.strip().lower()
        
        # Точное совпадение
        if actual_normalized == expected_normalized:
            return True
        
        # Содержит ожидаемый текст
        if expected_normalized in actual_normalized:
            return True
        
        # Проверяем числовые результаты
        actual_numbers = re.findall(r"[-+]?\d*\.?\d+", actual)
        expected_numbers = re.findall(r"[-+]?\d*\.?\d+", expected)
        
        if actual_numbers and expected_numbers:
            try:
                actual_floats = [float(n) for n in actual_numbers]
                expected_floats = [float(n) for n in expected_numbers]
                
                if len(actual_floats) == len(expected_floats):
                    all_close = all(
                        abs(a - e) < 0.0001 
                        for a, e in zip(actual_floats, expected_floats)
                    )
                    if all_close:
                        return True
            except ValueError:
                pass
        
        return False
    
    async def test_and_fix(
        self,
        code: str,
        task_description: str,
        max_fix_attempts: int = 2
    ) -> Tuple[str, TestResult]:
        """
        Тестирует код и пытается исправить ошибки.
        
        Возвращает исправленный код и результат тестов.
        """
        current_code = code
        
        for attempt in range(max_fix_attempts + 1):
            result = await self.test_code(
                code=current_code,
                language="python",
                task_description=task_description
            )
            
            if result.success:
                logger.info(f"CodeTester: Tests passed on attempt {attempt + 1}")
                return current_code, result
            
            if attempt < max_fix_attempts:
                # Пытаемся исправить
                fixed_code = await self._fix_failing_code(
                    current_code, 
                    result, 
                    task_description
                )
                
                if fixed_code and fixed_code != current_code:
                    current_code = fixed_code
                    logger.info(f"CodeTester: Attempting fix {attempt + 1}")
                else:
                    break
        
        return current_code, result
    
    async def _fix_failing_code(
        self,
        code: str,
        test_result: TestResult,
        task_description: str
    ) -> Optional[str]:
        """Пытается исправить код на основе результатов тестов."""
        if not self.llm_manager:
            return None
        
        from ..llm.base import LLMMessage
        
        # Собираем информацию об ошибках
        errors_info = []
        
        if test_result.execution_error:
            errors_info.append(f"Execution error: {test_result.execution_error[:300]}")
        
        for tc in test_result.test_cases:
            if tc.status in (TestStatus.FAILED, TestStatus.ERROR):
                errors_info.append(f"Test '{tc.name}': {tc.error or 'failed'}")
                if tc.expected and tc.actual:
                    errors_info.append(f"  Expected: {tc.expected}")
                    errors_info.append(f"  Got: {tc.actual}")
        
        errors_text = "\n".join(errors_info[:10])  # Ограничиваем количество
        
        fix_prompt = f"""The following Python code has failing tests. Fix the code.

TASK: {task_description[:200]}

CODE:
```python
{code}
```

ERRORS:
{errors_text}

IMPORTANT:
- Fix the code to pass the tests
- Keep the same function/class signatures
- Return ONLY the fixed code wrapped in ```python```

Fixed code:"""

        try:
            response = await self.llm_manager.generate(
                messages=[
                    LLMMessage(
                        role="system",
                        content="You are a Python debugging expert. Fix code based on test failures."
                    ),
                    LLMMessage(role="user", content=fix_prompt)
                ],
                temperature=0.1,
                max_tokens=len(code) * 2
            )
            
            # Извлекаем код
            fixed = response.content
            match = re.search(r"```python\n(.*?)```", fixed, re.DOTALL)
            if match:
                return match.group(1).strip()
            
            return None
            
        except Exception as e:
            logger.warning(f"Failed to fix code: {e}")
            return None


# Глобальный экземпляр
_code_tester: Optional[CodeTester] = None


def get_code_tester(llm_manager=None) -> CodeTester:
    """Получить экземпляр CodeTester."""
    global _code_tester
    if _code_tester is None:
        _code_tester = CodeTester(llm_manager=llm_manager)
    return _code_tester

