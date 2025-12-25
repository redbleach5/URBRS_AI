#!/bin/bash
# Скрипт для просмотра логов AILLM в реальном времени
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

MODE=${1:-"all"}

show_help() {
    echo "Использование: ./logs.sh [режим]"
    echo ""
    echo "Режимы:"
    echo "  all       Все логи (backend + frontend) - по умолчанию"
    echo "  backend   Только backend логи"
    echo "  frontend  Только frontend логи"
    echo "  app       Логи приложения (logs/aillm.log)"
    echo "  error     Только ошибки (logs/error.log)"
    echo "  clear     Очистить все лог-файлы"
    echo ""
    echo "Примеры:"
    echo "  ./logs.sh           # все логи"
    echo "  ./logs.sh backend   # только backend"
    echo "  ./logs.sh app       # логи приложения"
}

case "$MODE" in
    help|-h|--help)
        show_help
        exit 0
        ;;
    all)
        echo "📋 Логи Backend + Frontend (Ctrl+C для выхода)"
        echo "================================================"
        tail -f backend.log frontend.log 2>/dev/null || {
            echo "⚠️  Лог-файлы не найдены. Проект запущен?"
            echo "   Запустите: ./start.sh"
        }
        ;;
    backend)
        echo "📋 Backend логи (Ctrl+C для выхода)"
        echo "================================================"
        if [ -f "backend.log" ]; then
            tail -f backend.log
        else
            echo "⚠️  backend.log не найден"
        fi
        ;;
    frontend)
        echo "📋 Frontend логи (Ctrl+C для выхода)"
        echo "================================================"
        if [ -f "frontend.log" ]; then
            tail -f frontend.log
        else
            echo "⚠️  frontend.log не найден"
        fi
        ;;
    app)
        echo "📋 Application логи (Ctrl+C для выхода)"
        echo "================================================"
        if [ -f "logs/aillm.log" ]; then
            tail -f logs/aillm.log
        else
            echo "⚠️  logs/aillm.log не найден"
        fi
        ;;
    error)
        echo "📋 Error логи (Ctrl+C для выхода)"
        echo "================================================"
        if [ -f "logs/error.log" ]; then
            tail -f logs/error.log
        else
            echo "⚠️  logs/error.log не найден"
        fi
        ;;
    clear)
        echo "🗑️  Очистка лог-файлов..."
        > backend.log 2>/dev/null && echo "✅ backend.log очищен" || true
        > frontend.log 2>/dev/null && echo "✅ frontend.log очищен" || true
        > logs/aillm.log 2>/dev/null && echo "✅ logs/aillm.log очищен" || true
        > logs/app.log 2>/dev/null && echo "✅ logs/app.log очищен" || true
        > logs/error.log 2>/dev/null && echo "✅ logs/error.log очищен" || true
        echo "✅ Логи очищены"
        ;;
    *)
        echo "❌ Неизвестный режим: $MODE"
        echo ""
        show_help
        exit 1
        ;;
esac

