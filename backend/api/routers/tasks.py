"""
Tasks router
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, Dict, Any
from backend.core.logger import get_logger
logger = get_logger(__name__)

from backend.core.validators import validate_task_input

router = APIRouter()


class TaskResponse(BaseModel):
    success: bool
    result: Any = None
    error: Optional[str] = None
    subtasks: Optional[list] = None
    task: Optional[str] = None
    time_estimate: Optional[Dict[str, Any]] = None
    warning: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None  # Дополнительные метаданные для фронтенда


@router.post("/tasks/execute", response_model=TaskResponse)
async def execute_task(request: Request, task_request: Dict[str, Any]):
    """
    Выполнить задачу (поддерживает задачи любой сложности)
    НЕ блокирует сложные операции — только предупреждает пользователя.
    """
    logger.debug(
        "API execute_task entry",
        extra={
            "task": task_request.get("task", "")[:100],
            "agent_type": task_request.get("agent_type"),
            "has_engine": request.app.state.engine is not None
        }
    )
    
    engine = request.app.state.engine
    
    if not engine:
        raise HTTPException(status_code=503, detail="Движок не инициализирован")
    
    # Анализируем сложность задачи ПЕРЕД выполнением (НЕ блокирует!)
    complexity_warning = None
    complexity_info = None
    try:
        from backend.core.complexity_analyzer import get_complexity_analyzer
        analyzer = get_complexity_analyzer()
        complexity_info = analyzer.analyze(
            task=task_request.get("task", ""),
            model=task_request.get("model"),
            task_type=task_request.get("agent_type")
        )
        
        if complexity_info.should_warn:
            complexity_warning = complexity_info.warning_message
            logger.info(
                f"Task complexity: {complexity_info.level.value}, "
                f"~{complexity_info.estimated_minutes:.1f} min - PROCEEDING (not blocking)"
            )
    except Exception as e:
        logger.debug(f"Complexity analysis failed (non-critical): {e}")
    
    try:
        # Validate input
        validated = validate_task_input(task_request)
        
        logger.debug(
            "Before engine.execute_task",
            extra={
                "validated_task": validated.task[:100],
                "validated_agent_type": validated.agent_type
            }
        )
        
        # Добавляем модель в контекст если указана
        context = validated.context or {}
        if task_request.get("model"):
            context["preferred_model"] = task_request["model"]
        if task_request.get("provider"):
            context["preferred_provider"] = task_request["provider"]
        
        # Execute task - система автоматически определит сложность и выберет подход
        result = await engine.execute_task(
            task=validated.task,
            agent_type=validated.agent_type,
            context=context
        )
        
        logger.debug(
            "After engine.execute_task",
            extra={
                "result_success": result.get("success"),
                "result_error": result.get("error"),
                "has_result": result.get("result") is not None,
                "result_keys": list(result.keys()) if isinstance(result, dict) else []
            }
        )
        
        # Normalize and ensure response includes all necessary fields for frontend
        response_data = {
            "success": result.get("success", True),
            "result": result.get("result"),
            "error": result.get("error"),
            "subtasks": result.get("subtasks", []),
            "task": result.get("task", validated.task),
            "metadata": {}
        }
        
        # Добавляем предупреждение о сложности (из нашего анализа или из результата)
        if complexity_warning:
            response_data["warning"] = complexity_warning
        elif result.get("time_estimate") and result["time_estimate"].get("warning"):
            response_data["warning"] = result["time_estimate"]["warning"]
        
        # Добавляем оценку времени
        if result.get("time_estimate"):
            response_data["time_estimate"] = result["time_estimate"]
        elif complexity_info:
            response_data["time_estimate"] = {
                "estimated_minutes": complexity_info.estimated_minutes,
                "level": complexity_info.level.value,
                "factors": complexity_info.factors
            }
        
        # Добавляем метаданные для фронтенда
        if result.get("metadata"):
            response_data["metadata"].update(result["metadata"])
        
        # Добавляем информацию о модели и провайдере если есть
        if result.get("model"):
            response_data["metadata"]["model"] = result["model"]
        if result.get("provider"):
            response_data["metadata"]["provider"] = result["provider"]
        if result.get("thinking"):
            response_data["metadata"]["thinking"] = result["thinking"]
        if result.get("has_thinking"):
            response_data["metadata"]["has_thinking"] = result["has_thinking"]
        
        # Добавляем информацию о восстановлении если было
        if result.get("recovered"):
            response_data["metadata"]["recovered"] = True
            response_data["metadata"]["recovery_method"] = result.get("recovery_method", "fallback_agent")
        
        # Добавляем результаты проверки фактов (FactCheckerMixin)
        if result.get("fact_check"):
            response_data["metadata"]["fact_check"] = result["fact_check"]
        
        # Добавляем результаты тестирования кода (CodeTester)
        if result.get("test_result"):
            response_data["metadata"]["test_result"] = result["test_result"]
        
        # Добавляем информацию о сложности
        if complexity_info:
            response_data["metadata"]["complexity_level"] = complexity_info.level.value
            response_data["metadata"]["estimated_minutes"] = complexity_info.estimated_minutes
            response_data["metadata"]["complexity_analyzed"] = True
        
        logger.debug(
            "Before return TaskResponse",
            extra={
                "response_success": response_data.get("success"),
                "response_error": response_data.get("error"),
                "response_keys": list(response_data.keys())
            }
        )
        
        return TaskResponse(**response_data)
    except ValueError as e:
        logger.warning(f"ValueError in task execution: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        error_message = str(e)
        # Улучшаем сообщение об ошибке для пользователя
        if "threads can only be started once" in error_message:
            error_message = "Ошибка работы с базой данных. Попробуйте перезапустить сервер."
        elif "timeout" in error_message.lower():
            error_message = "Превышено время ожидания выполнения задачи. Попробуйте упростить задачу или повторить попытку."
        elif "connection" in error_message.lower():
            error_message = "Ошибка подключения к сервису. Проверьте настройки подключения."
        
        logger.error(
            "Exception caught in task execution",
            extra={
                "error_type": type(e).__name__,
                "error_message": error_message,
                "original_error": str(e)[:200]
            },
            exc_info=True
        )
        
        logger.error(f"Task execution error: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=error_message)


@router.get("/tasks/status")
async def get_status(request: Request):
    """Получить статус движка"""
    engine = request.app.state.engine
    
    if not engine:
        return {"status": "не_инициализирован"}
    
    return engine.get_status()

