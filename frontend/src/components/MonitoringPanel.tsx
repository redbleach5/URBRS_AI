import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStatus, getAvailableModels } from '../api/client';
import { 
  Activity, Brain, Database, Cpu, Shield, 
  GitBranch, Wrench, Server, MemoryStick,
  Zap, CheckCircle2, XCircle, AlertCircle,
  Sparkles, Clock, Gauge
} from 'lucide-react';

// Component icons mapping
const COMPONENT_CONFIG: Record<string, { icon: React.ElementType; label: string; description: string }> = {
  llm_manager: { 
    icon: Brain, 
    label: 'LLM Manager', 
    description: 'Управление языковыми моделями' 
  },
  vector_store: { 
    icon: Database, 
    label: 'Vector Store', 
    description: 'Хранилище векторных эмбеддингов' 
  },
  context_manager: { 
    icon: GitBranch, 
    label: 'Context Manager', 
    description: 'Управление контекстом диалогов' 
  },
  agent_registry: { 
    icon: Cpu, 
    label: 'Agent Registry', 
    description: 'Реестр AI агентов' 
  },
  orchestrator: { 
    icon: Zap, 
    label: 'Orchestrator', 
    description: 'Координация задач и агентов' 
  },
  tool_registry: { 
    icon: Wrench, 
    label: 'Tool Registry', 
    description: 'Реестр инструментов' 
  },
  safety_guard: { 
    icon: Shield, 
    label: 'Safety Guard', 
    description: 'Защита и безопасность' 
  },
  memory: { 
    icon: MemoryStick, 
    label: 'Memory', 
    description: 'Долгосрочная память системы' 
  },
};

// Status indicator component
const StatusIndicator: React.FC<{ status: boolean; size?: 'sm' | 'md' | 'lg' }> = ({ status, size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4'
  };
  
  return (
    <div className="relative">
      <div className={`${sizeClasses[size]} rounded-full ${status ? 'bg-emerald-500' : 'bg-red-500'}`}>
        {status && (
          <div className={`absolute inset-0 ${sizeClasses[size]} rounded-full bg-emerald-500 animate-ping opacity-75`} />
        )}
      </div>
    </div>
  );
};

// Component card
const ComponentCard: React.FC<{ 
  componentKey: string; 
  isActive: boolean;
  index: number;
}> = ({ componentKey, isActive, index }) => {
  const config = COMPONENT_CONFIG[componentKey];
  if (!config) return null;
  
  const Icon = config.icon;
  
  return (
    <div 
      className={`
        relative overflow-hidden
        bg-gradient-to-br from-[#1a1d2e] to-[#0f111b] 
        p-4 rounded-xl border transition-all duration-300
        ${isActive 
          ? 'border-emerald-500/30 shadow-lg shadow-emerald-500/10 hover:border-emerald-500/50' 
          : 'border-red-500/30 shadow-lg shadow-red-500/10'
        }
        hover:scale-[1.02] cursor-default
      `}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Glow effect */}
      <div className={`
        absolute -top-10 -right-10 w-24 h-24 rounded-full blur-2xl opacity-20
        ${isActive ? 'bg-emerald-500' : 'bg-red-500'}
      `} />
      
      <div className="relative flex items-start gap-3">
        <div className={`
          p-2.5 rounded-lg
          ${isActive 
            ? 'bg-emerald-500/10 text-emerald-400' 
            : 'bg-red-500/10 text-red-400'
          }
        `}>
          <Icon size={22} strokeWidth={1.5} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-gray-100 truncate">{config.label}</h4>
            <StatusIndicator status={isActive} size="sm" />
          </div>
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{config.description}</p>
        </div>
      </div>
      
      <div className={`
        absolute bottom-0 left-0 right-0 h-0.5 
        ${isActive ? 'bg-gradient-to-r from-emerald-500/50 via-emerald-400/50 to-transparent' : 'bg-gradient-to-r from-red-500/50 via-red-400/50 to-transparent'}
      `} />
    </div>
  );
};

// Model card
const ModelCard: React.FC<{ 
  model: {
    name: string;
    provider: string;
    size: string | null;
    capabilities: string[];
    quality_score: number;
    speed_score: number;
    is_available: boolean;
    is_recommended: boolean;
    description: string;
  };
  isCurrentModel: boolean;
  index: number;
}> = ({ model, isCurrentModel, index }) => {
  return (
    <div 
      className={`
        relative overflow-hidden
        bg-gradient-to-br from-[#1a1d2e] to-[#0f111b] 
        p-4 rounded-xl border transition-all duration-300
        ${isCurrentModel 
          ? 'border-blue-500/50 ring-1 ring-blue-500/30 shadow-lg shadow-blue-500/10' 
          : 'border-[#2a2f46] hover:border-[#3a3f56]'
        }
      `}
      style={{ animationDelay: `${index * 75}ms` }}
    >
      {/* Current model badge */}
      {isCurrentModel && (
        <div className="absolute top-2 right-2">
          <span className="px-2 py-0.5 text-xs font-medium bg-blue-500/20 text-blue-400 rounded-full border border-blue-500/30">
            Активная
          </span>
        </div>
      )}
      
      {/* Recommended badge */}
      {model.is_recommended && !isCurrentModel && (
        <div className="absolute top-2 right-2">
          <span className="px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400 rounded-full border border-amber-500/30 flex items-center gap-1">
            <Sparkles size={10} /> Рекомендована
          </span>
        </div>
      )}
      
      <div className="flex items-start gap-3 mb-3">
        <div className={`
          p-2.5 rounded-lg
          ${model.is_available ? 'bg-purple-500/10 text-purple-400' : 'bg-gray-500/10 text-gray-400'}
        `}>
          <Brain size={22} strokeWidth={1.5} />
        </div>
        
        <div className="flex-1 min-w-0 pr-16">
          <h4 className="font-semibold text-gray-100 truncate">{model.name}</h4>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-400">{model.provider}</span>
            {model.size && (
              <>
                <span className="text-gray-600">•</span>
                <span className="text-xs text-gray-400">{model.size}</span>
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* Capabilities */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {model.capabilities.map(cap => (
          <span 
            key={cap} 
            className="px-2 py-0.5 text-xs bg-[#2a2f46] text-gray-300 rounded-md"
          >
            {cap === 'code' ? '💻 Код' : cap === 'chat' ? '💬 Чат' : cap}
          </span>
        ))}
      </div>
      
      {/* Scores */}
      <div className="space-y-2">
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Gauge size={12} /> Качество
            </span>
            <span className="text-xs font-medium text-gray-300">{Math.round(model.quality_score * 100)}%</span>
          </div>
          <div className="h-1.5 bg-[#0a0a0f] rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
              style={{ width: `${model.quality_score * 100}%` }}
            />
          </div>
        </div>
        
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Clock size={12} /> Скорость
            </span>
            <span className="text-xs font-medium text-gray-300">{Math.round(model.speed_score * 100)}%</span>
          </div>
          <div className="h-1.5 bg-[#0a0a0f] rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500"
              style={{ width: `${model.speed_score * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// System status overview
const SystemOverview: React.FC<{ 
  status: string; 
  activeComponents: number; 
  totalComponents: number;
  modelsCount: number;
}> = ({ status, activeComponents, totalComponents, modelsCount }) => {
  const isHealthy = status === 'ok' && activeComponents === totalComponents;
  const healthPercentage = totalComponents > 0 ? Math.round((activeComponents / totalComponents) * 100) : 0;
  
  return (
    <div className="bg-gradient-to-br from-[#1a1d2e] to-[#0f111b] p-6 rounded-xl border border-[#2a2f46] shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Animated status ring */}
          <div className="relative">
            <svg className="w-20 h-20 -rotate-90">
              <circle
                cx="40"
                cy="40"
                r="35"
                fill="none"
                stroke="#1a1d2e"
                strokeWidth="6"
              />
              <circle
                cx="40"
                cy="40"
                r="35"
                fill="none"
                stroke={isHealthy ? '#10b981' : '#f59e0b'}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${healthPercentage * 2.2} 220`}
                className="transition-all duration-1000"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              {isHealthy ? (
                <CheckCircle2 size={28} className="text-emerald-500" />
              ) : (
                <AlertCircle size={28} className="text-amber-500" />
              )}
            </div>
          </div>
          
          <div>
            <h3 className="text-xl font-bold text-gray-100">
              {isHealthy ? 'Система работает' : 'Требуется внимание'}
            </h3>
            <p className="text-gray-400 text-sm mt-0.5">
              {activeComponents} из {totalComponents} компонентов активны
            </p>
          </div>
        </div>
        
        <div className="flex gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-emerald-400">{activeComponents}</div>
            <div className="text-xs text-gray-400 mt-0.5">Активных</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-purple-400">{modelsCount}</div>
            <div className="text-xs text-gray-400 mt-0.5">Моделей</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-400">{healthPercentage}%</div>
            <div className="text-xs text-gray-400 mt-0.5">Здоровье</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export function MonitoringPanel() {
  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['status'],
    queryFn: getStatus,
    refetchInterval: 5000
  });

  const { data: modelsData, isLoading: modelsLoading } = useQuery({
    queryKey: ['models'],
    queryFn: getAvailableModels,
    refetchInterval: 10000
  });

  const componentsList = useMemo(() => {
    if (!status?.components) return [];
    return Object.entries(status.components);
  }, [status]);

  const activeComponents = useMemo(() => {
    return componentsList.filter(([_, isActive]) => isActive).length;
  }, [componentsList]);

  const models = modelsData?.models || [];
  const currentModel = modelsData?.current_model;

  if (statusLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-gray-400">Загрузка данных мониторинга...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Activity size={32} strokeWidth={1.5} className="text-blue-400" />
        <div>
          <h2 className="text-3xl font-bold text-gray-100">Мониторинг системы</h2>
          <p className="text-gray-400 text-sm">Состояние компонентов и моделей в реальном времени</p>
        </div>
      </div>

      {/* System Overview */}
      <SystemOverview 
        status={status?.status || 'unknown'}
        activeComponents={activeComponents}
        totalComponents={componentsList.length}
        modelsCount={models.length}
      />

      {/* Components Grid */}
      <div>
        <h3 className="text-lg font-semibold mb-4 text-gray-100 flex items-center gap-2">
          <Server size={18} strokeWidth={1.5} className="text-emerald-400" />
          <span>Компоненты системы</span>
          <span className="ml-2 px-2 py-0.5 text-xs bg-emerald-500/10 text-emerald-400 rounded-full">
            {activeComponents}/{componentsList.length}
          </span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {componentsList.map(([key, isActive], index) => (
            <ComponentCard 
              key={key} 
              componentKey={key} 
              isActive={isActive as boolean}
              index={index}
            />
          ))}
        </div>
      </div>

      {/* Models Grid */}
      <div>
        <h3 className="text-lg font-semibold mb-4 text-gray-100 flex items-center gap-2">
          <Brain size={18} strokeWidth={1.5} className="text-purple-400" />
          <span>Доступные модели</span>
          <span className="ml-2 px-2 py-0.5 text-xs bg-purple-500/10 text-purple-400 rounded-full">
            {models.length} моделей
          </span>
        </h3>
        {modelsLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {models.map((model: any, index: number) => (
              <ModelCard 
                key={model.name} 
                model={model}
                isCurrentModel={model.name === currentModel}
                index={index}
              />
            ))}
          </div>
        )}
      </div>

      {/* Auto-refresh indicator */}
      <div className="flex items-center justify-center gap-2 text-gray-500 text-xs">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span>Автообновление каждые 5 секунд</span>
      </div>
    </div>
  );
}
