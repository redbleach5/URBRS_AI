#!/bin/bash
# =============================================================================
# AILLM - Установка рекомендуемых моделей Ollama
# =============================================================================

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функция для вывода сообщений
info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; }

# Проверка Ollama
check_ollama() {
    if ! command -v ollama &> /dev/null; then
        error "Ollama не установлена!"
        echo "Установите Ollama: https://ollama.com/download"
        exit 1
    fi
    
    if ! ollama list &> /dev/null; then
        error "Ollama сервер не запущен!"
        echo "Запустите: ollama serve"
        exit 1
    fi
    
    success "Ollama готова к работе"
}

# Установка модели с проверкой
install_model() {
    local model=$1
    local description=$2
    
    info "Устанавливаю $model ($description)..."
    
    if ollama list | grep -q "^$model"; then
        warning "$model уже установлена, пропускаю"
    else
        ollama pull "$model"
        success "$model установлена"
    fi
}

# Меню выбора конфигурации
show_menu() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "          🤖 AILLM - Установка моделей Ollama"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    
    # Определяем GPU
    GPU_COUNT=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | wc -l || echo 0)
    GPU_MEMORY=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 || echo 0)
    TOTAL_VRAM=$((GPU_COUNT * GPU_MEMORY / 1024))
    
    if [ "$GPU_COUNT" -gt 0 ]; then
        echo "  🎮 Обнаружено: ${GPU_COUNT} GPU, ~${TOTAL_VRAM} GB VRAM"
        echo ""
    fi
    
    echo "Выберите конфигурацию:"
    echo ""
    echo "  1) Минимальная (8 GB VRAM)   - gemma3:4b, qwen2.5-coder:7b, gemma3:1b"
    echo "  2) Рекомендуемая (16 GB VRAM) - gemma3:12b, qwen2.5-coder:14b, qwen3:14b + быстрые"
    echo "  3) Полная (24+ GB VRAM)      - Все основные модели"
    echo "  4) Multi-GPU (48+ GB VRAM)   - Включая 70B модели для multi-GPU"
    echo "  5) Только чат                - gemma3:12b"
    echo "  6) Только код                - qwen2.5-coder:14b, deepseek-coder-v2:16b"
    echo "  7) Только быстрые            - gemma3:1b, qwen2.5:1.5b"
    echo "  8) Выборочная установка"
    echo "  0) Выход"
    echo ""
}

# Минимальная конфигурация
install_minimal() {
    echo ""
    info "Установка минимальной конфигурации (8 GB VRAM)..."
    echo ""
    
    install_model "gemma3:4b" "Чат на русском"
    install_model "qwen2.5-coder:7b" "Написание кода"
    install_model "gemma3:1b" "Быстрые задачи"
    
    success "Минимальная конфигурация установлена!"
}

# Рекомендуемая конфигурация
install_recommended() {
    echo ""
    info "Установка рекомендуемой конфигурации (16 GB VRAM)..."
    echo ""
    
    install_model "gemma3:12b" "Чат на русском (основная)"
    install_model "qwen2.5-coder:14b" "Написание кода (основная)"
    install_model "qwen3:14b" "Reasoning/Thinking"
    install_model "gemma3:1b" "Быстрая классификация"
    install_model "qwen2.5:1.5b" "Быстрая маршрутизация"
    
    success "Рекомендуемая конфигурация установлена!"
}

# Полная конфигурация
install_full() {
    echo ""
    info "Установка полной конфигурации (24+ GB VRAM)..."
    echo ""
    
    # Чат
    install_model "gemma3:12b" "Чат на русском (основная)"
    install_model "gemma3:4b" "Чат (быстрая)"
    install_model "qwen2.5:14b" "Чат (альтернатива)"
    
    # Код
    install_model "qwen2.5-coder:14b" "Код (основная)"
    install_model "deepseek-coder-v2:16b" "Код (сложные задачи)"
    install_model "qwen2.5-coder:7b" "Код (быстрая)"
    
    # Reasoning
    install_model "qwen3:14b" "Reasoning (основная)"
    install_model "deepseek-r1:14b" "Reasoning (альтернатива)"
    
    # Быстрые
    install_model "gemma3:1b" "Быстрая классификация"
    install_model "qwen2.5:1.5b" "Быстрая маршрутизация"
    
    success "Полная конфигурация установлена!"
}

# Multi-GPU конфигурация (2-3x RTX 3090)
install_multi_gpu() {
    echo ""
    info "Установка конфигурации для multi-GPU (48-72 GB VRAM)..."
    echo ""
    
    warning "⚠️  Большие модели требуют значительного времени на загрузку!"
    echo ""
    
    # Большие модели (доступны с multi-GPU)
    install_model "llama3.3:70b" "Максимальное качество (43 GB)"
    install_model "qwen2.5:72b" "Альтернатива 70B (43 GB)"
    
    # Стандартный набор
    install_model "gemma3:12b" "Чат на русском (основная)"
    install_model "qwen2.5-coder:14b" "Код (основная)"
    install_model "deepseek-coder-v2:16b" "Код (сложные задачи)"
    install_model "qwen3:14b" "Reasoning"
    install_model "deepseek-r1:14b" "Reasoning (альтернатива)"
    
    # Быстрые
    install_model "gemma3:1b" "Быстрая классификация"
    install_model "qwen2.5:1.5b" "Быстрая маршрутизация"
    
    success "Multi-GPU конфигурация установлена!"
    echo ""
    info "Для 70B моделей рекомендуется:"
    echo "  - Минимум 48 GB VRAM (2x RTX 3090)"
    echo "  - 32+ GB RAM"
    echo "  - NVMe SSD для быстрой загрузки"
}

# Только чат
install_chat() {
    echo ""
    info "Установка моделей для чата..."
    echo ""
    
    install_model "gemma3:12b" "Чат на русском (основная)"
    
    success "Модели для чата установлены!"
}

# Только код
install_code() {
    echo ""
    info "Установка моделей для кодирования..."
    echo ""
    
    install_model "qwen2.5-coder:14b" "Код (основная)"
    install_model "deepseek-coder-v2:16b" "Код (сложные задачи)"
    
    success "Модели для кодирования установлены!"
}

# Только быстрые
install_fast() {
    echo ""
    info "Установка быстрых моделей..."
    echo ""
    
    install_model "gemma3:1b" "Быстрая классификация"
    install_model "qwen2.5:1.5b" "Быстрая маршрутизация"
    
    success "Быстрые модели установлены!"
}

# Выборочная установка
install_custom() {
    echo ""
    echo "Доступные модели:"
    echo ""
    echo "  Чат:"
    echo "    a) gemma3:12b    - Лучший для русского (8 GB)"
    echo "    b) gemma3:4b     - Быстрый чат (3 GB)"
    echo "    c) qwen2.5:14b   - Сложные диалоги (9 GB)"
    echo "    d) qwen2.5:7b    - Баланс (4.7 GB)"
    echo ""
    echo "  Код:"
    echo "    e) qwen2.5-coder:14b     - Лучший для кода (9 GB)"
    echo "    f) qwen2.5-coder:7b      - Быстрый код (4.7 GB)"
    echo "    g) deepseek-coder-v2:16b - Сложный код (10 GB)"
    echo ""
    echo "  Reasoning:"
    echo "    h) qwen3:14b     - Thinking mode (9 GB)"
    echo "    i) deepseek-r1:14b - Альтернатива (9 GB)"
    echo ""
    echo "  Быстрые:"
    echo "    j) gemma3:1b     - Классификация (0.8 GB)"
    echo "    k) qwen2.5:1.5b  - Маршрутизация (1.1 GB)"
    echo ""
    
    read -p "Введите буквы моделей (например: aejk): " choices
    
    for ((i=0; i<${#choices}; i++)); do
        case ${choices:$i:1} in
            a) install_model "gemma3:12b" "Чат" ;;
            b) install_model "gemma3:4b" "Чат быстрый" ;;
            c) install_model "qwen2.5:14b" "Диалоги" ;;
            d) install_model "qwen2.5:7b" "Баланс" ;;
            e) install_model "qwen2.5-coder:14b" "Код" ;;
            f) install_model "qwen2.5-coder:7b" "Код быстрый" ;;
            g) install_model "deepseek-coder-v2:16b" "Сложный код" ;;
            h) install_model "qwen3:14b" "Reasoning" ;;
            i) install_model "deepseek-r1:14b" "Reasoning" ;;
            j) install_model "gemma3:1b" "Быстрая" ;;
            k) install_model "qwen2.5:1.5b" "Быстрая" ;;
            *) warning "Неизвестный выбор: ${choices:$i:1}" ;;
        esac
    done
    
    success "Выборочная установка завершена!"
}

# Показать установленные модели
show_installed() {
    echo ""
    info "Установленные модели:"
    echo ""
    ollama list
    echo ""
}

# Основной цикл
main() {
    check_ollama
    
    while true; do
        show_menu
        read -p "Ваш выбор [1-7, 0]: " choice
        
        case $choice in
            1) install_minimal ;;
            2) install_recommended ;;
            3) install_full ;;
            4) install_multi_gpu ;;
            5) install_chat ;;
            6) install_code ;;
            7) install_fast ;;
            8) install_custom ;;
            0) 
                echo ""
                show_installed
                success "До свидания!"
                exit 0
                ;;
            *)
                warning "Неверный выбор, попробуйте снова"
                ;;
        esac
        
        show_installed
        
        read -p "Продолжить установку? [y/N]: " cont
        if [[ ! $cont =~ ^[Yy]$ ]]; then
            success "Установка завершена!"
            exit 0
        fi
    done
}

# Запуск
main

