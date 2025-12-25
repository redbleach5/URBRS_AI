import React, { useState, useEffect } from 'react';
import { Brain, Code, Zap, ChevronDown, CircleCheck } from 'lucide-react';
import { getAvailableModels, selectModel, ModelInfo } from '../api/client';

// ============ Types ============

export interface ModelSelectorState {
  availableModels: ModelInfo[];
  selectedModel: string | null;
  autoSelectModel: boolean;
  loadingModels: boolean;
  resourceLevel: string;
}

// ============ Model Selector Hook ============

export interface UseModelSelectorReturn extends ModelSelectorState {
  handleModelSelect: (modelName: string | null) => Promise<void>;
  setAutoSelectModel: (value: boolean) => void;
}

export function useModelSelector(): UseModelSelectorReturn {
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(() => {
    return localStorage.getItem('selectedModel') || null;
  });
  const [autoSelectModel, setAutoSelectModelState] = useState(() => {
    const saved = localStorage.getItem('autoSelectModel');
    return saved !== null ? saved === 'true' : true;
  });
  const [loadingModels, setLoadingModels] = useState(false);
  const [resourceLevel, setResourceLevel] = useState<string>('unknown');

  // Load available models on mount
  useEffect(() => {
    const loadModels = async () => {
      setLoadingModels(true);
      try {
        const response = await getAvailableModels();
        if (response.success) {
          setAvailableModels(response.models);
          setSelectedModel(response.current_model || null);
          setResourceLevel(response.resource_level);
        }
      } catch (e) {
        console.error('Failed to load models:', e);
      } finally {
        setLoadingModels(false);
      }
    };
    loadModels();
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (selectedModel) {
      localStorage.setItem('selectedModel', selectedModel);
    }
  }, [selectedModel]);

  useEffect(() => {
    localStorage.setItem('autoSelectModel', autoSelectModel.toString());
  }, [autoSelectModel]);

  const handleModelSelect = async (modelName: string | null) => {
    if (modelName === null) {
      // Enable auto-select
      setAutoSelectModelState(true);
      setSelectedModel(null);
      return;
    }
    
    const result = await selectModel({ model: modelName, auto_select: false });
    if (result.success) {
      setSelectedModel(result.selected_model);
      setAutoSelectModelState(false);
    }
  };

  const setAutoSelectModel = (value: boolean) => {
    setAutoSelectModelState(value);
    if (value) {
      setSelectedModel(null);
    }
  };

  return {
    availableModels,
    selectedModel,
    autoSelectModel,
    loadingModels,
    resourceLevel,
    handleModelSelect,
    setAutoSelectModel,
  };
}

// ============ Model Selector Dropdown Component ============

interface ModelSelectorDropdownProps {
  availableModels: ModelInfo[];
  selectedModel: string | null;
  autoSelectModel: boolean;
  loadingModels: boolean;
  resourceLevel: string;
  onModelSelect: (modelName: string | null) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export const ModelSelectorDropdown: React.FC<ModelSelectorDropdownProps> = ({
  availableModels,
  selectedModel,
  autoSelectModel,
  loadingModels,
  resourceLevel,
  onModelSelect,
  isOpen,
  onToggle,
  onClose,
}) => {
  const handleSelect = (modelName: string | null) => {
    onModelSelect(modelName);
    onClose();
  };

  return (
    <div className="relative flex-shrink-0 model-dropdown">
      <button
        type="button"
        onClick={onToggle}
        className="px-2 py-2.5 h-full bg-transparent hover:bg-[#1f2236] transition-colors flex items-center gap-1 text-xs font-medium text-gray-400 border-r border-[#1f2236]"
        title="Выбор модели"
      >
        <Brain size={12} strokeWidth={1.5} className="text-purple-400" />
        <span className="hidden sm:inline text-[10px] max-w-[60px] truncate">
          {loadingModels ? '...' : autoSelectModel ? 'Авто' : (selectedModel?.split(':')[0] || 'Авто')}
        </span>
        <ChevronDown size={10} strokeWidth={1.5} />
      </button>
      
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-72 bg-[#1a1d2e] border border-[#2a2f46] rounded-lg shadow-xl z-30 max-h-[350px] overflow-y-auto">
          <div className="p-2 border-b border-[#2a2f46]">
            <div className="text-xs text-gray-400 mb-1">Выбор модели</div>
            <div className="text-[10px] text-gray-500">
              Ресурсы: <span className={`font-medium ${
                resourceLevel === 'high' ? 'text-green-400' : 
                resourceLevel === 'medium' ? 'text-yellow-400' : 
                resourceLevel === 'low' ? 'text-orange-400' : 'text-gray-400'
              }`}>{resourceLevel}</span>
            </div>
          </div>
          
          {/* Auto-select option */}
          <button
            type="button"
            onClick={() => handleSelect(null)}
            className={`w-full px-3 py-2 text-left text-xs hover:bg-[#252840] transition-colors flex items-center gap-2 ${
              autoSelectModel ? 'bg-purple-900/30 border-l-2 border-purple-500' : ''
            }`}
          >
            <Brain size={14} className="text-purple-400" />
            <div className="flex-1">
              <div className="font-medium text-white">Автовыбор</div>
              <div className="text-[10px] text-gray-500">Оптимальная модель под задачу</div>
            </div>
            {autoSelectModel && <CircleCheck size={14} className="text-purple-400" />}
          </button>
          
          <div className="border-t border-[#2a2f46]" />
          
          {/* Model list */}
          {availableModels.map((model) => (
            <button
              key={`${model.provider}:${model.name}`}
              type="button"
              onClick={() => handleSelect(model.name)}
              className={`w-full px-3 py-2 text-left text-xs hover:bg-[#252840] transition-colors flex items-center gap-2 ${
                !autoSelectModel && selectedModel === model.name ? 'bg-blue-900/30 border-l-2 border-blue-500' : ''
              }`}
            >
              <div className="w-5 h-5 rounded bg-[#0f111b] flex items-center justify-center shrink-0">
                {model.provider === 'ollama' ? (
                  <Code size={10} className="text-blue-400" />
                ) : model.provider === 'openai' ? (
                  <Brain size={10} className="text-green-400" />
                ) : (
                  <Zap size={10} className="text-orange-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white truncate flex items-center gap-1">
                  {model.name}
                  {model.is_recommended && (
                    <span className="text-[8px] px-1 py-0.5 bg-yellow-900/50 text-yellow-400 rounded">★</span>
                  )}
                </div>
                <div className="text-[10px] text-gray-500 flex items-center gap-2">
                  {model.size && <span>{model.size}</span>}
                  <span className="text-green-400">Q:{Math.round(model.quality_score * 100)}%</span>
                  <span className="text-blue-400">S:{Math.round(model.speed_score * 100)}%</span>
                </div>
              </div>
              {!autoSelectModel && selectedModel === model.name && (
                <CircleCheck size={12} className="text-blue-400 shrink-0" />
              )}
            </button>
          ))}
          
          {availableModels.length === 0 && (
            <div className="px-3 py-4 text-xs text-gray-500 text-center">
              {loadingModels ? 'Загрузка моделей...' : 'Нет доступных моделей'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============ Simplified Inline Model Selector ============

interface InlineModelSelectorProps {
  state: UseModelSelectorReturn;
}

export const InlineModelSelector: React.FC<InlineModelSelectorProps> = ({ state }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <ModelSelectorDropdown
      availableModels={state.availableModels}
      selectedModel={state.selectedModel}
      autoSelectModel={state.autoSelectModel}
      loadingModels={state.loadingModels}
      resourceLevel={state.resourceLevel}
      onModelSelect={state.handleModelSelect}
      isOpen={isOpen}
      onToggle={() => setIsOpen(!isOpen)}
      onClose={() => setIsOpen(false)}
    />
  );
};

export default ModelSelectorDropdown;

