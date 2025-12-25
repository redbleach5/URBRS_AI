import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { listTools, executeTool } from '../api/client';
import { 
  Wrench, FileText, FolderOpen, Terminal, GitBranch, 
  Globe, Database, Play, CheckCircle2, XCircle, 
  Clock, Loader2, ChevronRight, Sparkles, Info,
  File, FolderTree, Command, GitCommit, GitMerge,
  Search, Server, Zap, Copy, RotateCcw
} from 'lucide-react';

// Tool categories and their configurations
const TOOL_CATEGORIES = {
  files: {
    name: 'Файловая система',
    icon: FolderOpen,
    color: 'emerald',
    description: 'Работа с файлами и директориями',
    tools: ['read_file', 'write_file', 'list_files']
  },
  shell: {
    name: 'Командная строка',
    icon: Terminal,
    color: 'amber',
    description: 'Выполнение shell команд',
    tools: ['execute_command']
  },
  git: {
    name: 'Git',
    icon: GitBranch,
    color: 'orange',
    description: 'Управление версиями кода',
    tools: ['git_status', 'git_commit', 'git_branch', 'git_diff', 'git_log']
  },
  web: {
    name: 'Веб и API',
    icon: Globe,
    color: 'blue',
    description: 'Интернет-запросы и API',
    tools: ['web_search', 'api_call']
  },
  database: {
    name: 'База данных',
    icon: Database,
    color: 'purple',
    description: 'SQL запросы и работа с БД',
    tools: ['database_query']
  }
};

// Tool icons mapping
const TOOL_ICONS: Record<string, React.ElementType> = {
  read_file: File,
  write_file: FileText,
  list_files: FolderTree,
  execute_command: Command,
  git_status: GitBranch,
  git_commit: GitCommit,
  git_branch: GitMerge,
  git_diff: GitBranch,
  git_log: Clock,
  web_search: Search,
  api_call: Server,
  database_query: Database,
};

// Tool examples
const TOOL_EXAMPLES: Record<string, { description: string; example: object }[]> = {
  read_file: [
    { description: 'Прочитать README', example: { path: 'README.md' } },
    { description: 'Прочитать конфиг', example: { path: 'package.json' } },
  ],
  write_file: [
    { description: 'Создать файл', example: { path: 'test.txt', content: 'Привет мир!' } },
  ],
  list_files: [
    { description: 'Текущая директория', example: { path: '.' } },
    { description: 'Папка src', example: { path: './src' } },
  ],
  execute_command: [
    { description: 'Список файлов', example: { command: 'ls -la' } },
    { description: 'Текущая директория', example: { command: 'pwd' } },
    { description: 'Версия Node', example: { command: 'node --version' } },
  ],
  git_status: [
    { description: 'Статус репозитория', example: {} },
  ],
  git_commit: [
    { description: 'Создать коммит', example: { message: 'feat: добавлена новая функция' } },
  ],
  git_branch: [
    { description: 'Список веток', example: { action: 'list' } },
    { description: 'Создать ветку', example: { action: 'create', name: 'feature/new' } },
  ],
  git_diff: [
    { description: 'Показать изменения', example: {} },
  ],
  git_log: [
    { description: 'История коммитов', example: { limit: 10 } },
  ],
  web_search: [
    { description: 'Поиск в интернете', example: { query: 'React hooks tutorial' } },
  ],
  api_call: [
    { description: 'GET запрос', example: { method: 'GET', url: 'https://api.example.com/data' } },
  ],
  database_query: [
    { description: 'SELECT запрос', example: { query: 'SELECT * FROM users LIMIT 10' } },
  ],
};

const colorClasses = {
  emerald: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
    hover: 'hover:border-emerald-500/50',
    ring: 'ring-emerald-500/30',
    gradient: 'from-emerald-600/20 to-emerald-700/10',
  },
  amber: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    hover: 'hover:border-amber-500/50',
    ring: 'ring-amber-500/30',
    gradient: 'from-amber-600/20 to-amber-700/10',
  },
  orange: {
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    text: 'text-orange-400',
    hover: 'hover:border-orange-500/50',
    ring: 'ring-orange-500/30',
    gradient: 'from-orange-600/20 to-orange-700/10',
  },
  blue: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-400',
    hover: 'hover:border-blue-500/50',
    ring: 'ring-blue-500/30',
    gradient: 'from-blue-600/20 to-blue-700/10',
  },
  purple: {
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/30',
    text: 'text-purple-400',
    hover: 'hover:border-purple-500/50',
    ring: 'ring-purple-500/30',
    gradient: 'from-purple-600/20 to-purple-700/10',
  },
};

// Result item component
const ResultItem: React.FC<{ item: any; index: number }> = ({ item, index }) => {
  const [expanded, setExpanded] = useState(index === 0);
  const isSuccess = !item.result?.error;
  
  return (
    <div className={`
      bg-gradient-to-br from-[#1a1d2e] to-[#0f111b] rounded-xl border transition-all duration-200
      ${isSuccess ? 'border-emerald-500/20' : 'border-red-500/20'}
    `}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          {isSuccess ? (
            <CheckCircle2 size={18} className="text-emerald-400" />
          ) : (
            <XCircle size={18} className="text-red-400" />
          )}
          <span className="font-medium text-gray-200">{item.tool}</span>
          <span className="text-xs text-gray-500">
            {item.timestamp.toLocaleTimeString('ru-RU')}
          </span>
        </div>
        <ChevronRight 
          size={18} 
          className={`text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} 
        />
      </button>
      
      {expanded && (
        <div className="px-4 pb-4 border-t border-[#2a2f46]">
          <div className="mt-3">
            <div className="text-xs text-gray-500 mb-1">Входные данные:</div>
            <pre className="text-xs bg-[#0a0a0f] p-2 rounded-lg text-gray-400 font-mono overflow-x-auto">
              {item.input}
            </pre>
          </div>
          <div className="mt-3">
            <div className="text-xs text-gray-500 mb-1">Результат:</div>
            <pre className={`text-xs bg-[#0a0a0f] p-2 rounded-lg font-mono overflow-x-auto max-h-48 overflow-y-auto ${isSuccess ? 'text-emerald-300' : 'text-red-300'}`}>
              {JSON.stringify(item.result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export function ToolsPanel() {
  const [selectedTool, setSelectedTool] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('files');
  const [toolInput, setToolInput] = useState('{}');
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data: tools } = useQuery({
    queryKey: ['tools'],
    queryFn: listTools,
  });

  const executeMutation = useMutation({
    mutationFn: ({ tool, input }: { tool: string; input: any }) =>
      executeTool({ tool_name: tool, input }),
    onSuccess: (data) => {
      setResults([{ tool: selectedTool, input: toolInput, result: data, timestamp: new Date() }, ...results]);
    },
    onError: (err) => {
      setResults([{ tool: selectedTool, input: toolInput, result: { error: err.message }, timestamp: new Date() }, ...results]);
    }
  });

  const handleExecute = () => {
    if (!selectedTool) return;
    setError(null);
    try {
      const input = JSON.parse(toolInput);
      executeMutation.mutate({ tool: selectedTool, input });
    } catch (e) {
      setError('Неверный JSON формат');
    }
  };

  const applyExample = (example: object) => {
    setToolInput(JSON.stringify(example, null, 2));
  };

  const getToolCategory = (toolName: string): string | null => {
    for (const [key, cat] of Object.entries(TOOL_CATEGORIES)) {
      if (cat.tools.includes(toolName)) return key;
    }
    return null;
  };

  const availableTools = tools?.tools ? Object.keys(tools.tools) : [];
  const currentCategoryTools = availableTools.filter(t => 
    TOOL_CATEGORIES[selectedCategory as keyof typeof TOOL_CATEGORIES]?.tools.includes(t)
  );
  const currentCategoryConfig = TOOL_CATEGORIES[selectedCategory as keyof typeof TOOL_CATEGORIES];
  const colors = colorClasses[currentCategoryConfig?.color as keyof typeof colorClasses] || colorClasses.blue;

  return (
    <div className="flex h-full">
      {/* Left sidebar - Categories */}
      <div className="w-64 border-r border-[#2a2f46] p-4 space-y-2 bg-[#0f111b]/50">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Категории</h3>
        </div>
        
        {Object.entries(TOOL_CATEGORIES).map(([key, category]) => {
          const Icon = category.icon;
          const catColors = colorClasses[category.color as keyof typeof colorClasses];
          const toolCount = availableTools.filter(t => category.tools.includes(t)).length;
          
          return (
            <button
              key={key}
              onClick={() => {
                setSelectedCategory(key);
                setSelectedTool('');
              }}
              className={`
                w-full p-3 rounded-xl flex items-center gap-3 transition-all duration-200
                ${selectedCategory === key 
                  ? `bg-gradient-to-r ${catColors.gradient} border ${catColors.border} ${catColors.ring} ring-1` 
                  : 'hover:bg-[#1a1d2e] border border-transparent'
                }
              `}
            >
              <div className={`p-2 rounded-lg ${catColors.bg}`}>
                <Icon size={18} className={catColors.text} />
              </div>
              <div className="flex-1 text-left">
                <div className="text-sm font-medium text-gray-200">{category.name}</div>
                <div className="text-xs text-gray-500">{toolCount} инструментов</div>
              </div>
            </button>
          );
        })}
        
        {/* Info box */}
        <div className="mt-6 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
          <div className="flex items-start gap-2">
            <Info size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-gray-400">
              <p className="font-medium text-blue-400 mb-1">Что это?</p>
              <p>Инструменты - это возможности AI агентов. Они используются автоматически при выполнении задач.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-[#2a2f46]">
          <div className="flex items-center gap-3 mb-2">
            <Wrench size={28} strokeWidth={1.5} className="text-blue-400" />
            <div>
              <h2 className="text-2xl font-bold text-gray-100">Инструменты AI агентов</h2>
              <p className="text-sm text-gray-400">Тестирование и отладка инструментов системы</p>
            </div>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Tools list */}
          <div className="w-80 border-r border-[#2a2f46] p-4 overflow-y-auto">
            <div className="flex items-center gap-2 mb-4">
              {currentCategoryConfig && (
                <>
                  <currentCategoryConfig.icon size={18} className={colors.text} />
                  <span className="font-medium text-gray-200">{currentCategoryConfig.name}</span>
                </>
              )}
            </div>
            
            <div className="space-y-2">
              {currentCategoryTools.map((toolName) => {
                const Icon = TOOL_ICONS[toolName] || Wrench;
                const toolData = tools?.tools?.[toolName];
                
                return (
                  <button
                    key={toolName}
                    onClick={() => {
                      setSelectedTool(toolName);
                      const examples = TOOL_EXAMPLES[toolName];
                      if (examples && examples.length > 0) {
                        setToolInput(JSON.stringify(examples[0].example, null, 2));
                      } else {
                        setToolInput('{}');
                      }
                    }}
                    className={`
                      w-full p-3 rounded-xl border text-left transition-all duration-200
                      ${selectedTool === toolName
                        ? `${colors.border} bg-gradient-to-br ${colors.gradient} ring-1 ${colors.ring}`
                        : 'border-[#2a2f46] hover:border-[#3a3f56] hover:bg-[#1a1d2e]'
                      }
                    `}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon size={16} className={selectedTool === toolName ? colors.text : 'text-gray-400'} />
                      <span className="font-medium text-gray-200 text-sm">{toolName}</span>
                    </div>
                    {toolData?.description && (
                      <p className="text-xs text-gray-500 line-clamp-2">{toolData.description}</p>
                    )}
                  </button>
                );
              })}
              
              {currentCategoryTools.length === 0 && (
                <div className="text-center py-8 text-gray-500 text-sm">
                  Нет доступных инструментов в этой категории
                </div>
              )}
            </div>
          </div>

          {/* Tool execution area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedTool ? (
              <>
                {/* Tool header */}
                <div className="p-4 border-b border-[#2a2f46] bg-[#1a1d2e]/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {(() => {
                        const Icon = TOOL_ICONS[selectedTool] || Wrench;
                        return <Icon size={24} className={colors.text} />;
                      })()}
                      <div>
                        <h3 className="text-lg font-semibold text-gray-100">{selectedTool}</h3>
                        <p className="text-xs text-gray-400">
                          {tools?.tools?.[selectedTool]?.description}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleExecute}
                      disabled={executeMutation.isPending}
                      className={`
                        px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2
                        ${executeMutation.isPending 
                          ? 'bg-gray-600 cursor-not-allowed' 
                          : `bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-600/20`
                        }
                      `}
                    >
                      {executeMutation.isPending ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Play size={16} />
                      )}
                      <span>{executeMutation.isPending ? 'Выполняется...' : 'Запустить'}</span>
                    </button>
                  </div>
                </div>

                {/* Quick examples */}
                {TOOL_EXAMPLES[selectedTool] && (
                  <div className="p-4 border-b border-[#2a2f46] bg-[#0f111b]/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles size={14} className="text-amber-400" />
                      <span className="text-xs font-medium text-gray-400">Быстрые примеры:</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {TOOL_EXAMPLES[selectedTool].map((ex, idx) => (
                        <button
                          key={idx}
                          onClick={() => applyExample(ex.example)}
                          className="px-3 py-1.5 text-xs bg-[#1a1d2e] border border-[#2a2f46] rounded-lg hover:border-amber-500/50 hover:bg-amber-500/10 transition-all duration-200 flex items-center gap-1.5"
                        >
                          <Copy size={12} className="text-gray-500" />
                          <span className="text-gray-300">{ex.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Input area */}
                <div className="flex-1 p-4 overflow-y-auto">
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                        <FileText size={14} />
                        Входные данные (JSON)
                      </label>
                      <button
                        onClick={() => setToolInput('{}')}
                        className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
                      >
                        <RotateCcw size={12} />
                        Сбросить
                      </button>
                    </div>
                    <textarea
                      value={toolInput}
                      onChange={(e) => {
                        setToolInput(e.target.value);
                        setError(null);
                      }}
                      className="w-full px-4 py-3 bg-[#0a0a0f] border border-[#2a2f46] rounded-xl text-gray-200 font-mono text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all resize-none"
                      rows={6}
                      placeholder='{"key": "value"}'
                    />
                    {error && (
                      <div className="mt-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs flex items-center gap-2">
                        <XCircle size={14} />
                        {error}
                      </div>
                    )}
                  </div>

                  {/* Results */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                        <Clock size={14} />
                        История выполнения
                      </h4>
                      {results.length > 0 && (
                        <button
                          onClick={() => setResults([])}
                          className="text-xs text-gray-500 hover:text-gray-300"
                        >
                          Очистить
                        </button>
                      )}
                    </div>
                    
                    {results.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 text-sm bg-[#1a1d2e]/50 rounded-xl border border-[#2a2f46]">
                        Результаты выполнения появятся здесь
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {results.slice(0, 10).map((item, idx) => (
                          <ResultItem key={idx} item={item} index={idx} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center max-w-md">
                  <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl ${colors.bg} flex items-center justify-center`}>
                    <Zap size={32} className={colors.text} />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-200 mb-2">Выберите инструмент</h3>
                  <p className="text-gray-400 text-sm">
                    Выберите инструмент из списка слева, чтобы протестировать его работу или посмотреть примеры использования.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
