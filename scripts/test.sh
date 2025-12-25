#!/bin/bash
# Скрипт для запуска тестов AILLM
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Активируем виртуальное окружение
VENV_PATH=${VENV_PATH:-.venv}
if [ -d "$VENV_PATH" ]; then
    source "$VENV_PATH/bin/activate"
fi

# Парсинг аргументов
MODE=${1:-""}
EXTRA_ARGS="${@:2}"

show_help() {
    echo "Использование: ./test.sh [режим] [опции pytest]"
    echo ""
    echo "Режимы:"
    echo "  (без аргументов)  Запуск всех тестов"
    echo "  fast              Быстрые тесты (без интеграционных)"
    echo "  cov               С отчётом покрытия кода"
    echo "  verbose           Подробный вывод (-v)"
    echo "  file <path>       Тесты из конкретного файла"
    echo "  match <pattern>   Тесты по паттерну (-k pattern)"
    echo ""
    echo "Примеры:"
    echo "  ./test.sh                      # все тесты"
    echo "  ./test.sh fast                 # без интеграционных"
    echo "  ./test.sh cov                  # с покрытием"
    echo "  ./test.sh file test_agents.py  # только test_agents.py"
    echo "  ./test.sh match 'test_code'    # тесты содержащие 'test_code'"
}

echo "🧪 Запуск тестов AILLM"
echo ""

case "$MODE" in
    help|-h|--help)
        show_help
        exit 0
        ;;
    fast)
        echo "📦 Режим: быстрые тесты (без интеграционных)"
        pytest tests/ -v --ignore=tests/test_integration.py $EXTRA_ARGS
        ;;
    cov)
        echo "📊 Режим: с покрытием кода"
        pytest tests/ --cov=backend --cov-report=term-missing --cov-report=html $EXTRA_ARGS
        echo ""
        echo "📁 HTML отчёт: htmlcov/index.html"
        ;;
    verbose)
        echo "📝 Режим: подробный вывод"
        pytest tests/ -v -s $EXTRA_ARGS
        ;;
    file)
        if [ -z "${2:-}" ]; then
            echo "❌ Укажите файл: ./test.sh file test_agents.py"
            exit 1
        fi
        FILE="$2"
        if [[ "$FILE" != tests/* ]]; then
            FILE="tests/$FILE"
        fi
        echo "📄 Тесты из файла: $FILE"
        pytest "$FILE" -v ${@:3}
        ;;
    match)
        if [ -z "${2:-}" ]; then
            echo "❌ Укажите паттерн: ./test.sh match 'test_code'"
            exit 1
        fi
        PATTERN="$2"
        echo "🔍 Тесты по паттерну: $PATTERN"
        pytest tests/ -v -k "$PATTERN" ${@:3}
        ;;
    "")
        echo "📦 Режим: все тесты"
        pytest tests/ -v $EXTRA_ARGS
        ;;
    *)
        echo "❌ Неизвестный режим: $MODE"
        echo ""
        show_help
        exit 1
        ;;
esac

echo ""
echo "✅ Тесты завершены"

