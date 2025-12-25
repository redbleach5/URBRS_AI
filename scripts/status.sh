#!/bin/bash
# Скрипт для проверки статуса проекта AILLM
set -euo pipefail

# Определяем корень проекта
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "=========================================="
echo "📊 Статус AILLM проекта"
echo "=========================================="
echo ""

# Функция проверки процесса
check_process() {
    local name=$1
    local pid_file=$2
    local pattern=$3
    
    echo -n "  $name: "
    
    # Проверяем по PID файлу
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file" 2>/dev/null || echo "")
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo "✅ Запущен (PID: $pid)"
            return 0
        fi
    fi
    
    # Проверяем по паттерну процесса
    local found_pid=$(pgrep -f "$pattern" 2>/dev/null | head -1 || true)
    if [ -n "$found_pid" ]; then
        echo "⚠️  Запущен без PID файла (PID: $found_pid)"
        return 0
    fi
    
    echo "❌ Остановлен"
    return 1
}

# Проверка процессов
echo "🔧 Процессы:"
BACKEND_RUNNING=false
FRONTEND_RUNNING=false

check_process "Backend " "$PROJECT_ROOT/backend.pid" "uvicorn.*backend.main:app" && BACKEND_RUNNING=true || true
check_process "Frontend" "$PROJECT_ROOT/frontend.pid" "vite.*--port" && FRONTEND_RUNNING=true || true

# Проверка портов
echo ""
echo "🌐 Порты:"

# Backend порт
BACKEND_PORT=$(lsof -Pi :8000 -sTCP:LISTEN -t 2>/dev/null || true)
if [ -n "$BACKEND_PORT" ]; then
    echo "  Backend (8000):  ✅ Занят"
else
    echo "  Backend (8000):  ⚪ Свободен"
fi

# Frontend порт
FRONTEND_PORT=$(lsof -Pi :1420 -sTCP:LISTEN -t 2>/dev/null || true)
if [ -n "$FRONTEND_PORT" ]; then
    echo "  Frontend (1420): ✅ Занят"
else
    echo "  Frontend (1420): ⚪ Свободен"
fi

# Проверка здоровья API
echo ""
echo "🏥 Здоровье:"

if curl -s "http://localhost:8000/health" > /dev/null 2>&1; then
    echo "  Backend API:  ✅ Отвечает"
else
    echo "  Backend API:  ❌ Не отвечает"
fi

if curl -s "http://localhost:1420" > /dev/null 2>&1; then
    echo "  Frontend:     ✅ Отвечает"
else
    echo "  Frontend:     ❌ Не отвечает"
fi

# Размер логов
echo ""
echo "📁 Логи:"

if [ -f "$PROJECT_ROOT/backend.log" ]; then
    SIZE=$(du -h "$PROJECT_ROOT/backend.log" | cut -f1)
    echo "  backend.log:  $SIZE"
else
    echo "  backend.log:  (отсутствует)"
fi

if [ -f "$PROJECT_ROOT/frontend.log" ]; then
    SIZE=$(du -h "$PROJECT_ROOT/frontend.log" | cut -f1)
    echo "  frontend.log: $SIZE"
else
    echo "  frontend.log: (отсутствует)"
fi

# Размер кэша
echo ""
echo "💾 Кэш:"

if [ -d "$PROJECT_ROOT/cache" ]; then
    SIZE=$(du -sh "$PROJECT_ROOT/cache" 2>/dev/null | cut -f1)
    echo "  cache/:       $SIZE"
else
    echo "  cache/:       (отсутствует)"
fi

if [ -d "$PROJECT_ROOT/vector_store" ]; then
    SIZE=$(du -sh "$PROJECT_ROOT/vector_store" 2>/dev/null | cut -f1)
    echo "  vector_store/: $SIZE"
else
    echo "  vector_store/: (отсутствует)"
fi

# Итоговый статус
echo ""
echo "=========================================="
if [ "$BACKEND_RUNNING" = true ] && [ "$FRONTEND_RUNNING" = true ]; then
    echo "✅ Проект полностью запущен"
    echo ""
    echo "📍 Backend:  http://localhost:8000"
    echo "📍 Frontend: http://localhost:1420"
    echo "📍 API Docs: http://localhost:8000/docs"
elif [ "$BACKEND_RUNNING" = true ] || [ "$FRONTEND_RUNNING" = true ]; then
    echo "⚠️  Проект частично запущен"
else
    echo "❌ Проект остановлен"
    echo ""
    echo "💡 Для запуска: ./start.sh"
fi
echo "=========================================="

