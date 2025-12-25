#!/usr/bin/env python3
"""
GUI панель управления проектом AILLM
Простой и удобный интерфейс для всех скриптов
"""

import subprocess
import threading
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
from pathlib import Path

# Определяем корень проекта
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent


class CustomButton(tk.Canvas):
    """Кастомная кнопка на Canvas — работает на macOS"""
    
    def __init__(self, parent, text, command, bg='#37474f', fg='#eceff1', 
                 hover_bg='#455a64', width=140, height=36, **kwargs):
        super().__init__(parent, width=width, height=height, 
                        bg=parent.cget('bg'), highlightthickness=0, **kwargs)
        
        self.command = command
        self.bg = bg
        self.fg = fg
        self.hover_bg = hover_bg
        self.text = text
        self.width = width
        self.height = height
        
        self._draw()
        
        self.bind('<Enter>', self._on_enter)
        self.bind('<Leave>', self._on_leave)
        self.bind('<Button-1>', self._on_click)
        
    def _draw(self, hover=False):
        self.delete('all')
        color = self.hover_bg if hover else self.bg
        
        # Рисуем скруглённый прямоугольник
        r = 6  # радиус скругления
        self.create_polygon(
            r, 0,
            self.width - r, 0,
            self.width, r,
            self.width, self.height - r,
            self.width - r, self.height,
            r, self.height,
            0, self.height - r,
            0, r,
            fill=color, outline=color
        )
        
        # Рисуем текст
        self.create_text(
            self.width // 2, self.height // 2,
            text=self.text, fill=self.fg,
            font=('Helvetica', 12, 'bold')
        )
        
    def _on_enter(self, event):
        self._draw(hover=True)
        self.configure(cursor='hand2')
        
    def _on_leave(self, event):
        self._draw(hover=False)
        
    def _on_click(self, event):
        if self.command:
            self.command()


class AILLMControlPanel:
    def __init__(self, root):
        self.root = root
        self.root.title("AILLM Control Panel")
        self.root.geometry("900x700")
        self.root.minsize(800, 600)
        
        # Цветовая схема
        self.colors = {
            'bg': '#1e1e2e',
            'card': '#2a2a3e',
            'fg': '#cdd6f4',
            'dim': '#6c7086',
            'success': '#a6e3a1',
            'success_bg': '#1e4620',
            'error': '#f38ba8',
            'error_bg': '#5c1f2e',
            'warning': '#f9e2af',
            'blue': '#89b4fa',
            'button': '#45475a',
            'button_hover': '#585b70'
        }
        
        self.root.configure(bg=self.colors['bg'])
        
        # UI
        self.create_ui()
        
        # Обновляем статус при запуске
        self.root.after(100, self.refresh_status)
        
    def create_ui(self):
        # Главный контейнер
        main = tk.Frame(self.root, bg=self.colors['bg'])
        main.pack(fill=tk.BOTH, expand=True, padx=25, pady=20)
        
        # Заголовок
        header = tk.Frame(main, bg=self.colors['bg'])
        header.pack(fill=tk.X, pady=(0, 20))
        
        title = tk.Label(header, text="🤖 AILLM Control Panel", 
                        bg=self.colors['bg'], fg=self.colors['fg'],
                        font=('Helvetica', 26, 'bold'))
        title.pack(side=tk.LEFT)
        
        # Кнопка обновления
        refresh_btn = CustomButton(header, "🔄 Обновить", self.refresh_status,
                                  bg=self.colors['button'], 
                                  fg=self.colors['fg'],
                                  hover_bg=self.colors['button_hover'],
                                  width=120, height=32)
        refresh_btn.pack(side=tk.RIGHT)
        
        # Статус панель
        self.status_frame = tk.Frame(main, bg=self.colors['card'])
        self.status_frame.pack(fill=tk.X, pady=(0, 20), ipady=15, ipadx=15)
        
        self.create_status_panel()
        
        # Панель с кнопками
        buttons_frame = tk.Frame(main, bg=self.colors['bg'])
        buttons_frame.pack(fill=tk.X, pady=(0, 20))
        
        self.create_button_groups(buttons_frame)
        
        # Лог-панель
        log_header = tk.Frame(main, bg=self.colors['bg'])
        log_header.pack(fill=tk.X, pady=(0, 8))
        
        tk.Label(log_header, text="📋 Вывод команд", 
                bg=self.colors['bg'], fg=self.colors['dim'],
                font=('Helvetica', 12)).pack(side=tk.LEFT)
        
        clear_btn = CustomButton(log_header, "🗑️ Очистить", self.clear_log,
                                bg=self.colors['card'], fg=self.colors['dim'],
                                hover_bg=self.colors['button'],
                                width=100, height=28)
        clear_btn.pack(side=tk.RIGHT)
        
        self.log_text = scrolledtext.ScrolledText(
            main, 
            height=10,
            font=('Menlo', 11),
            bg='#11111b',
            fg='#a6e3a1',
            insertbackground='#a6e3a1',
            relief=tk.FLAT,
            wrap=tk.WORD,
            padx=10, pady=10
        )
        self.log_text.pack(fill=tk.BOTH, expand=True)
        
    def create_status_panel(self):
        for widget in self.status_frame.winfo_children():
            widget.destroy()
            
        inner = tk.Frame(self.status_frame, bg=self.colors['card'])
        inner.pack(fill=tk.X, padx=10, pady=5)
        
        # Backend статус
        backend_frame = tk.Frame(inner, bg=self.colors['card'])
        backend_frame.pack(side=tk.LEFT, padx=(0, 40))
        
        tk.Label(backend_frame, text="Backend", 
                bg=self.colors['card'], fg=self.colors['dim'],
                font=('Helvetica', 11)).pack(anchor=tk.W)
        
        self.backend_status = tk.Label(backend_frame, text="⏳ Проверка...",
                                       bg=self.colors['card'], 
                                       fg=self.colors['warning'],
                                       font=('Helvetica', 13, 'bold'))
        self.backend_status.pack(anchor=tk.W)
        
        # Frontend статус
        frontend_frame = tk.Frame(inner, bg=self.colors['card'])
        frontend_frame.pack(side=tk.LEFT, padx=(0, 40))
        
        tk.Label(frontend_frame, text="Frontend",
                bg=self.colors['card'], fg=self.colors['dim'],
                font=('Helvetica', 11)).pack(anchor=tk.W)
        
        self.frontend_status = tk.Label(frontend_frame, text="⏳ Проверка...",
                                        bg=self.colors['card'],
                                        fg=self.colors['warning'],
                                        font=('Helvetica', 13, 'bold'))
        self.frontend_status.pack(anchor=tk.W)
        
        # Ollama статус
        ollama_frame = tk.Frame(inner, bg=self.colors['card'])
        ollama_frame.pack(side=tk.LEFT, padx=(0, 40))
        
        tk.Label(ollama_frame, text="Ollama",
                bg=self.colors['card'], fg=self.colors['dim'],
                font=('Helvetica', 11)).pack(anchor=tk.W)
        
        self.ollama_status = tk.Label(ollama_frame, text="⏳ Проверка...",
                                      bg=self.colors['card'],
                                      fg=self.colors['warning'],
                                      font=('Helvetica', 13, 'bold'))
        self.ollama_status.pack(anchor=tk.W)
        
        # URLs
        urls_frame = tk.Frame(inner, bg=self.colors['card'])
        urls_frame.pack(side=tk.RIGHT)
        
        self.urls_label = tk.Label(urls_frame, 
                                   text="localhost:8000 (API)\nlocalhost:1420 (UI)",
                                   bg=self.colors['card'], 
                                   fg=self.colors['dim'],
                                   font=('Menlo', 10),
                                   justify=tk.RIGHT)
        self.urls_label.pack(anchor=tk.E)
        
    def create_button_groups(self, parent):
        groups = [
            ("🚀 Управление", [
                ("▶️ Запустить", self.cmd_start, 'success'),
                ("⏹️ Остановить", self.cmd_stop, 'danger'),
                ("🔄 Перезапуск", self.cmd_restart, 'normal'),
            ]),
            ("🛠️ Разработка", [
                ("🧪 Тесты", self.cmd_test, 'normal'),
                ("⚡ Быстрые", self.cmd_test_fast, 'normal'),
                ("📊 Покрытие", self.cmd_test_cov, 'normal'),
            ]),
            ("📋 Логи", [
                ("📋 Все", self.cmd_logs_all, 'normal'),
                ("🔧 Backend", self.cmd_logs_backend, 'normal'),
                ("🎨 Frontend", self.cmd_logs_frontend, 'normal'),
            ]),
            ("🔧 Обслуживание", [
                ("📦 Обновить", self.cmd_update, 'normal'),
                ("🧹 Очистить", self.cmd_cleanup, 'normal'),
                ("✅ Валидация", self.cmd_validate, 'normal'),
            ]),
            ("⚙️ Дополнительно", [
                ("🦙 Ollama", self.cmd_check_ollama, 'normal'),
                ("🗑️ Сброс БД", self.cmd_reset_db, 'danger'),
                ("📁 Папка", self.cmd_open_folder, 'normal'),
            ]),
        ]
        
        row = 0
        for group_name, buttons in groups:
            # Заголовок группы
            label = tk.Label(parent, text=group_name,
                           bg=self.colors['bg'], fg=self.colors['blue'],
                           font=('Helvetica', 12, 'bold'))
            label.grid(row=row, column=0, sticky=tk.W, pady=(12, 6))
            
            # Кнопки
            btn_frame = tk.Frame(parent, bg=self.colors['bg'])
            btn_frame.grid(row=row+1, column=0, sticky=tk.W, pady=(0, 8))
            
            for text, command, btn_type in buttons:
                if btn_type == 'success':
                    bg = self.colors['success_bg']
                    fg = self.colors['success']
                    hover_bg = '#2a5c2e'
                elif btn_type == 'danger':
                    bg = self.colors['error_bg']
                    fg = self.colors['error']
                    hover_bg = '#7a2a3d'
                else:
                    bg = self.colors['button']
                    fg = self.colors['fg']
                    hover_bg = self.colors['button_hover']
                
                btn = CustomButton(btn_frame, text, command,
                                  bg=bg, fg=fg, hover_bg=hover_bg,
                                  width=130, height=38)
                btn.pack(side=tk.LEFT, padx=(0, 10))
            
            row += 2
            
    def refresh_status(self):
        """Обновить статус всех сервисов"""
        threading.Thread(target=self._check_status, daemon=True).start()
        
    def _check_status(self):
        """Проверка статуса в фоне"""
        import urllib.request
        
        # Backend
        try:
            req = urllib.request.Request('http://localhost:8000/health', method='GET')
            with urllib.request.urlopen(req, timeout=2) as resp:
                if resp.status == 200:
                    self.root.after(0, lambda: self._set_status(
                        self.backend_status, "✅ Запущен", self.colors['success']))
                else:
                    self.root.after(0, lambda: self._set_status(
                        self.backend_status, "❌ Ошибка", self.colors['error']))
        except:
            self.root.after(0, lambda: self._set_status(
                self.backend_status, "⭕ Остановлен", self.colors['dim']))
        
        # Frontend
        try:
            req = urllib.request.Request('http://localhost:1420', method='GET')
            with urllib.request.urlopen(req, timeout=2) as resp:
                self.root.after(0, lambda: self._set_status(
                    self.frontend_status, "✅ Запущен", self.colors['success']))
        except:
            self.root.after(0, lambda: self._set_status(
                self.frontend_status, "⭕ Остановлен", self.colors['dim']))
        
        # Ollama
        try:
            ollama_url = "http://192.168.178.126:11434"
            try:
                import yaml
                config_path = PROJECT_ROOT / 'backend' / 'config' / 'config.yaml'
                with open(config_path) as f:
                    config = yaml.safe_load(f)
                    ollama_url = config.get('llm', {}).get('providers', {}).get('ollama', {}).get('base_url', ollama_url)
            except:
                pass
            
            req = urllib.request.Request(f'{ollama_url}/api/tags', method='GET')
            with urllib.request.urlopen(req, timeout=3) as resp:
                self.root.after(0, lambda: self._set_status(
                    self.ollama_status, "✅ Доступен", self.colors['success']))
        except:
            self.root.after(0, lambda: self._set_status(
                self.ollama_status, "❌ Недоступен", self.colors['error']))
    
    def _set_status(self, label, text, color):
        label.configure(text=text, fg=color)
        
    def log(self, message):
        self.log_text.insert(tk.END, message + "\n")
        self.log_text.see(tk.END)
        
    def clear_log(self):
        self.log_text.delete(1.0, tk.END)
        
    def run_command(self, cmd, show_output=True):
        def _run():
            self.log(f"$ {' '.join(cmd)}\n")
            try:
                process = subprocess.Popen(
                    cmd, cwd=PROJECT_ROOT,
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, bufsize=1
                )
                
                for line in iter(process.stdout.readline, ''):
                    if show_output:
                        self.root.after(0, lambda l=line: self.log(l.rstrip()))
                
                process.wait()
                
                if process.returncode == 0:
                    self.root.after(0, lambda: self.log("✅ Готово\n"))
                else:
                    self.root.after(0, lambda: self.log(f"⚠️ Код выхода: {process.returncode}\n"))
                
                self.root.after(1000, self.refresh_status)
                
            except Exception as e:
                self.root.after(0, lambda: self.log(f"❌ Ошибка: {e}\n"))
        
        threading.Thread(target=_run, daemon=True).start()
        
    # Команды
    def cmd_start(self):
        self.run_command(['./scripts/start_project.sh'])
        
    def cmd_stop(self):
        self.run_command(['./scripts/stop_project.sh'])
        
    def cmd_restart(self):
        self.log("🔄 Перезапуск проекта...\n")
        def _restart():
            subprocess.run(['./scripts/stop_project.sh'], cwd=PROJECT_ROOT, 
                          capture_output=True, timeout=30)
            self.root.after(0, lambda: self.run_command(['./scripts/start_project.sh']))
        threading.Thread(target=_restart, daemon=True).start()
        
    def cmd_test(self):
        self.run_command(['./scripts/test.sh'])
        
    def cmd_test_fast(self):
        self.run_command(['./scripts/test.sh', 'fast'])
        
    def cmd_test_cov(self):
        self.run_command(['./scripts/test.sh', 'cov'])
        
    def cmd_logs_all(self):
        self.run_command(['tail', '-n', '50', 'backend.log', 'frontend.log'])
        
    def cmd_logs_backend(self):
        self.run_command(['tail', '-n', '100', 'backend.log'])
        
    def cmd_logs_frontend(self):
        self.run_command(['tail', '-n', '100', 'frontend.log'])
        
    def cmd_update(self):
        if messagebox.askyesno("Обновление", 
                               "Обновить все зависимости?\nЭто может занять несколько минут."):
            self.run_command(['./scripts/update.sh'])
        
    def cmd_cleanup(self):
        self.run_command(['python3', 'scripts/cleanup_project.py'])
        
    def cmd_validate(self):
        self.run_command(['python3', 'scripts/validate_project.py'])
        
    def cmd_check_ollama(self):
        self.run_command(['./scripts/check_ollama.sh'])
        
    def cmd_reset_db(self):
        if messagebox.askyesno("Сброс БД", 
                               "⚠️ Удалить все базы данных?\n\nДействие необратимо!",
                               icon='warning'):
            self.run_command(['bash', '-c', 
                            'rm -f memory/*.db memory/*.db-shm memory/*.db-wal && echo "✅ Базы данных удалены"'])
            
    def cmd_open_folder(self):
        subprocess.Popen(['open', str(PROJECT_ROOT)])


def main():
    root = tk.Tk()
    app = AILLMControlPanel(root)
    root.protocol("WM_DELETE_WINDOW", root.destroy)
    root.mainloop()


if __name__ == '__main__':
    main()
