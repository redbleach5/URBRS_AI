#!/bin/bash
# Запуск GUI панели управления AILLM
cd "$(dirname "$0")"

# Активируем виртуальное окружение если есть
if [ -d ".venv" ]; then
    source .venv/bin/activate
fi

python3 scripts/gui.py "$@"

