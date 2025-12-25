import { useEffect, useState, useCallback } from 'react';
import { Brain, AlertTriangle, ChevronDown, Bot, Loader2 } from 'lucide-react';

interface AgentStats {
  tasks: number;
  success_rate: number;
  avg_quality: number;
}

interface LearningProgress {
  total_experience: number;
  success_rate: number;
  level: string;
  level_description: string;
  quality: string;
  agents_learning: number;
  total_successful: number;
  total_retries: number;
}

interface LearningData {
  success: boolean;
  progress?: LearningProgress;
  agents_summary?: Record<string, AgentStats>;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export function LearningProgress() {
  const [data, setData] = useState<LearningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(() => {
    const saved = localStorage.getItem('learningProgressExpanded');
    return saved === 'true';
  });

  // Save expanded state
  const toggleExpanded = () => {
    const newValue = !isExpanded;
    setIsExpanded(newValue);
    localStorage.setItem('learningProgressExpanded', newValue.toString());
  };

  const fetchLearningProgress = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/learning/progress`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch learning progress');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLearningProgress();
    
    // Обновляем каждые 30 секунд
    const interval = setInterval(fetchLearningProgress, 30000);
    return () => clearInterval(interval);
  }, [fetchLearningProgress]);

  if (loading) {
    return (
      <div className="p-2.5 bg-gradient-to-br from-indigo-900/30 to-purple-900/20 border border-indigo-500/30 rounded-lg">
        <div className="flex items-center gap-2 text-indigo-300">
          <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
          <span className="text-xs">Загрузка...</span>
        </div>
      </div>
    );
  }

  if (error || !data?.success || !data.progress) {
    return (
      <div className="p-2.5 bg-gradient-to-br from-red-900/20 to-orange-900/10 border border-red-500/20 rounded-lg">
        <div className="flex items-center gap-2 text-red-300">
          <AlertTriangle size={14} strokeWidth={1.5} />
          <span className="text-xs truncate">{error || 'Нет данных'}</span>
        </div>
      </div>
    );
  }

  const { progress, agents_summary } = data;

  // Определяем цвет уровня
  const getLevelColor = (level: string) => {
    switch (level) {
      case 'экспертный': return 'from-purple-600 to-pink-500';
      case 'продвинутый': return 'from-blue-500 to-indigo-500';
      case 'базовый': return 'from-green-500 to-teal-500';
      default: return 'from-gray-500 to-slate-500';
    }
  };

  // Определяем цвет качества
  const getQualityColor = (quality: string) => {
    switch (quality) {
      case 'отличное': return 'text-green-400';
      case 'хорошее': return 'text-blue-400';
      case 'среднее': return 'text-yellow-400';
      default: return 'text-red-400';
    }
  };

  return (
    <div className="p-2.5 bg-gradient-to-br from-indigo-900/30 to-purple-900/20 border border-indigo-500/30 rounded-lg shadow-lg">
      {/* Header */}
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={toggleExpanded}
      >
        <div className="flex items-center gap-2">
          <Brain size={18} strokeWidth={1.5} className="text-indigo-400 flex-shrink-0" />
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-indigo-200">Обучение</h3>
            <p className="text-[10px] text-indigo-400 truncate">{progress.level_description}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Level badge */}
          <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold text-white bg-gradient-to-r ${getLevelColor(progress.level)}`}>
            {progress.level.toUpperCase()}
          </div>
          
          {/* Expand icon */}
          <ChevronDown size={14} strokeWidth={1.5} className={`text-indigo-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Main stats - 2x2 grid for narrow sidebar */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="text-center p-1.5 bg-black/20 rounded-lg">
          <div className="text-lg font-bold text-white">{progress.total_experience}</div>
          <div className="text-[10px] text-indigo-300">Задач</div>
        </div>
        <div className="text-center p-1.5 bg-black/20 rounded-lg">
          <div className={`text-lg font-bold ${getQualityColor(progress.quality)}`}>
            {(progress.success_rate * 100).toFixed(0)}%
          </div>
          <div className="text-[10px] text-indigo-300">Успех</div>
        </div>
        <div className="text-center p-1.5 bg-black/20 rounded-lg">
          <div className="text-lg font-bold text-green-400">{progress.total_successful}</div>
          <div className="text-[10px] text-indigo-300">Успешных</div>
        </div>
        <div className="text-center p-1.5 bg-black/20 rounded-lg">
          <div className="text-lg font-bold text-yellow-400">{progress.total_retries}</div>
          <div className="text-[10px] text-indigo-300">Исправлений</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-2.5">
        <div className="flex justify-between text-[10px] text-indigo-300 mb-0.5">
          <span>Прогресс</span>
          <span>{Math.min(progress.total_experience / 200 * 100, 100).toFixed(0)}%</span>
        </div>
        <div className="h-1.5 bg-black/30 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
            style={{ width: `${Math.min(progress.total_experience / 200 * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Expanded: Agent details */}
      {isExpanded && agents_summary && Object.keys(agents_summary).length > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-indigo-500/20">
          <h4 className="text-[10px] font-semibold text-indigo-300 mb-2">Агенты</h4>
          <div className="space-y-1.5">
            {Object.entries(agents_summary).map(([name, stats]) => (
              <div key={name} className="p-1.5 bg-black/20 rounded-lg">
                <div className="flex items-center gap-1.5 mb-1">
                  <Bot size={12} strokeWidth={1.5} className="text-indigo-300 flex-shrink-0" />
                  <span className="text-[11px] text-white font-medium truncate">{name}</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-indigo-300">{stats.tasks} задач</span>
                  <span className={stats.success_rate >= 0.8 ? 'text-green-400' : stats.success_rate >= 0.6 ? 'text-yellow-400' : 'text-red-400'}>
                    {(stats.success_rate * 100).toFixed(0)}%
                  </span>
                  <span className="text-purple-400">{stats.avg_quality.toFixed(0)}★</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quality indicator */}
      <div className="mt-2.5 flex items-center justify-center gap-1.5 text-[10px]">
        <span className="text-indigo-300">Качество:</span>
        <span className={`font-semibold ${getQualityColor(progress.quality)}`}>
          {progress.quality}
        </span>
      </div>
    </div>
  );
}

