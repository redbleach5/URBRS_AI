#!/bin/bash
# Скрипт для проверки доступности Ollama сервера
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Читаем URL Ollama из конфига (если pyyaml установлен)
OLLAMA_URL=""

# Пробуем извлечь URL из конфига
if command -v python3 >/dev/null 2>&1; then
    OLLAMA_URL=$(python3 -c "
import yaml
try:
    with open('backend/config/config.yaml', 'r') as f:
        config = yaml.safe_load(f)
    print(config.get('llm', {}).get('providers', {}).get('ollama', {}).get('base_url', ''))
except:
    print('')
" 2>/dev/null || echo "")
fi

# Fallback на дефолтный URL
if [ -z "$OLLAMA_URL" ]; then
    OLLAMA_URL="http://localhost:11434"
fi

echo "=========================================="
echo "🦙 Проверка Ollama сервера"
echo "=========================================="
echo ""
echo "📍 URL: $OLLAMA_URL"
echo ""

# Проверка доступности
echo "🔍 Проверка соединения..."
if curl -s --connect-timeout 5 "$OLLAMA_URL/api/tags" > /dev/null 2>&1; then
    echo "✅ Ollama сервер доступен"
    echo ""
    
    # Получаем список моделей
    echo "📦 Установленные модели:"
    MODELS=$(curl -s "$OLLAMA_URL/api/tags" 2>/dev/null)
    
    if command -v python3 >/dev/null 2>&1; then
        echo "$MODELS" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    models = data.get('models', [])
    if not models:
        print('   (нет моделей)')
    for m in models:
        name = m.get('name', 'unknown')
        size = m.get('size', 0) / (1024**3)
        print(f'   • {name} ({size:.1f} GB)')
except:
    print('   (ошибка парсинга)')
" 2>/dev/null || echo "   (не удалось получить список)"
    else
        echo "   (python3 не найден для парсинга)"
    fi
    
    # Проверяем здоровье
    echo ""
    echo "🏥 Статус сервера:"
    VERSION=$(curl -s "$OLLAMA_URL/api/version" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('version','unknown'))" 2>/dev/null || echo "unknown")
    echo "   Версия: $VERSION"
    
    # Проверяем GPU
    echo ""
    echo "🎮 GPU информация:"
    GPU_INFO=$(curl -s "$OLLAMA_URL/api/ps" 2>/dev/null)
    if [ -n "$GPU_INFO" ] && [ "$GPU_INFO" != "{}" ]; then
        echo "$GPU_INFO" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    models = data.get('models', [])
    if models:
        for m in models:
            name = m.get('name', 'unknown')
            vram = m.get('size_vram', 0) / (1024**3)
            print(f'   • {name}: {vram:.1f} GB VRAM')
    else:
        print('   Нет активных моделей')
except:
    print('   (нет данных)')
" 2>/dev/null || echo "   (нет данных)"
    else
        echo "   Нет активных моделей в памяти"
    fi
    
    echo ""
    echo "=========================================="
    echo "✅ Ollama готов к работе"
    echo "=========================================="
    
else
    echo "❌ Ollama сервер недоступен"
    echo ""
    echo "Возможные причины:"
    echo "   1. Ollama не запущен"
    echo "   2. Неправильный URL в конфиге"
    echo "   3. Firewall блокирует соединение"
    echo "   4. Сервер на другой машине выключен"
    echo ""
    echo "💡 Решения:"
    echo "   • Запустите Ollama: ollama serve"
    echo "   • Проверьте URL в backend/config/config.yaml"
    echo "   • Проверьте сетевое соединение: ping $(echo $OLLAMA_URL | sed 's|http://||' | cut -d: -f1)"
    echo ""
    echo "=========================================="
    echo "❌ Ollama недоступен"
    echo "=========================================="
    exit 1
fi

