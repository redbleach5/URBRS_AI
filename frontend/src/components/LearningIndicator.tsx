import React, { useState, useEffect, memo } from 'react';
import { Brain, TrendingUp, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { getFeedbackStats } from '../api/client';

interface LearningStats {
  total_feedback: number;
  avg_rating: number;
  helpful_percentage: number;
  improvements_count?: number;
}

interface LearningIndicatorProps {
  compact?: boolean;
  className?: string;
}

/**
 * Learning Indicator - shows AI learning progress from user feedback
 */
export const LearningIndicator: React.FC<LearningIndicatorProps> = memo(({ 
  compact = false,
  className = '' 
}) => {
  const [stats, setStats] = useState<LearningStats | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      const response = await getFeedbackStats();
      if (!response.error) {
        setStats({
          total_feedback: response.solution_feedback?.total || 0,
          avg_rating: response.solution_feedback?.avg_rating || 0,
          helpful_percentage: response.solution_feedback?.helpful_percentage || 0,
          improvements_count: response.learning_insights?.improvements_applied || 0,
        });
      }
    } catch (error) {
      console.error('Failed to fetch learning stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // Refresh every 5 minutes
    const interval = setInterval(fetchStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading || !stats) {
    return null;
  }

  // Don't show if no feedback yet
  if (stats.total_feedback === 0) {
    return null;
  }

  const getProgressColor = (percentage: number) => {
    if (percentage >= 80) return 'from-green-500 to-emerald-400';
    if (percentage >= 60) return 'from-blue-500 to-cyan-400';
    if (percentage >= 40) return 'from-yellow-500 to-amber-400';
    return 'from-red-500 to-orange-400';
  };

  if (compact) {
    return (
      <div 
        className={`inline-flex items-center gap-1.5 px-2 py-1 bg-purple-900/30 border border-purple-500/30 rounded-lg cursor-pointer hover:bg-purple-900/50 transition-colors ${className}`}
        onClick={() => setIsExpanded(!isExpanded)}
        title={`AI обучился на ${stats.total_feedback} отзывах`}
      >
        <Brain size={12} className="text-purple-400" />
        <span className="text-xs text-purple-300">
          {Math.round(stats.helpful_percentage)}%
        </span>
        <Sparkles size={10} className="text-purple-400 animate-pulse" />
      </div>
    );
  }

  return (
    <div className={`bg-[#1a1d2e] border border-[#2a2f46] rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#1f2236] transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
            <Brain size={16} className="text-purple-400" />
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-gray-200">Обучение AI</div>
            <div className="text-xs text-gray-500">
              {stats.total_feedback} оценок
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Quick stat */}
          <div className="flex items-center gap-1.5">
            <TrendingUp size={14} className="text-green-400" />
            <span className="text-sm font-medium text-green-400">
              {Math.round(stats.helpful_percentage)}%
            </span>
          </div>
          
          {isExpanded ? (
            <ChevronUp size={16} className="text-gray-400" />
          ) : (
            <ChevronDown size={16} className="text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 animate-slide-up">
          {/* Helpfulness bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Полезность ответов</span>
              <span className="text-gray-300">{Math.round(stats.helpful_percentage)}%</span>
            </div>
            <div className="h-2 bg-gray-700/50 rounded-full overflow-hidden">
              <div 
                className={`h-full bg-gradient-to-r ${getProgressColor(stats.helpful_percentage)} rounded-full transition-all duration-500`}
                style={{ width: `${stats.helpful_percentage}%` }}
              />
            </div>
          </div>

          {/* Average rating */}
          <div className="flex items-center justify-between p-2 bg-[#0f111b]/60 rounded-lg">
            <span className="text-xs text-gray-400">Средняя оценка</span>
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium text-gray-200">
                {stats.avg_rating.toFixed(1)}
              </span>
              <span className="text-xs text-gray-500">/5</span>
            </div>
          </div>

          {/* Improvements applied */}
          {stats.improvements_count !== undefined && stats.improvements_count > 0 && (
            <div className="flex items-center justify-between p-2 bg-green-900/20 rounded-lg border border-green-500/20">
              <span className="text-xs text-green-400">Улучшений применено</span>
              <div className="flex items-center gap-1">
                <Sparkles size={12} className="text-green-400" />
                <span className="text-sm font-medium text-green-300">
                  {stats.improvements_count}
                </span>
              </div>
            </div>
          )}

          {/* Tips */}
          <p className="text-xs text-gray-500 text-center pt-2">
            Оценивайте ответы 👍/👎 чтобы улучшить качество
          </p>
        </div>
      )}
    </div>
  );
});

LearningIndicator.displayName = 'LearningIndicator';

export default LearningIndicator;

