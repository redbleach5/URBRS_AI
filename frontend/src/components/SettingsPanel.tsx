import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  getConfig, 
  updateConfig, 
  checkAvailability, 
  checkOllamaServer,
  getRoutingPolicy,
  updateRoutingPolicy,
  getProvidersInfo,
  RoutingPolicy,
  ProviderInfo,
  COST_TIER_LABELS
} from '../api/client';
import { Settings, CircleX, RefreshCw, FileCode, Loader2, AlertTriangle, Lightbulb, Bot, Shield, Zap, Lock, DollarSign } from 'lucide-react';

function get(obj: any, path: string, defaultValue?: any) {
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj) ?? defaultValue;
}

function set(obj: any, path: string, value: any) {
  const keys = path.split('.');
  const target = { ...(obj || {}) };
  let cur: any = target;
  keys.forEach((k, idx) => {
    if (idx === keys.length - 1) {
      cur[k] = value;
    } else {
      cur[k] = { ...(cur[k] || {}) };
      cur = cur[k];
    }
  });
  return target;
}

export default function SettingsPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['config'],
    queryFn: getConfig,
    refetchOnMount: true,
    refetchInterval: false,
  });

  const [localConfig, setLocalConfig] = useState<any>(null);
  const [originalConfig, setOriginalConfig] = useState<any>(null);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'success' | 'error' | 'warning' | 'info'>('info');
  const [hasChanges, setHasChanges] = useState(false);
  const [availabilityStatus, setAvailabilityStatus] = useState<any>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<any>(null);
  const [checkingOllama, setCheckingOllama] = useState(false);
  
  // Routing Policy state
  const [routingPolicy, setRoutingPolicy] = useState<RoutingPolicy | null>(null);
  const [policyPresets, setPolicyPresets] = useState<Record<string, RoutingPolicy>>({});
  const [providersInfo, setProvidersInfo] = useState<ProviderInfo[]>([]);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setLocalConfig(data);
      setOriginalConfig(JSON.parse(JSON.stringify(data))); // Deep clone
      setJsonText(JSON.stringify(data, null, 2));
      setJsonError(null);
      setHasChanges(false);
      
      // Загружаем политику маршрутизации и информацию о провайдерах
      loadRoutingPolicy();
      loadProvidersInfo();
    }
  }, [data]);

  const loadRoutingPolicy = async () => {
    setPolicyLoading(true);
    setPolicyError(null);
    try {
      const response = await getRoutingPolicy();
      if (response.success) {
        setRoutingPolicy(response.policy);
        setPolicyPresets(response.presets);
      }
    } catch (e: any) {
      setPolicyError(e.message || 'Ошибка загрузки политики');
    } finally {
      setPolicyLoading(false);
    }
  };

  const loadProvidersInfo = async () => {
    try {
      const response = await getProvidersInfo();
      if (response.success) {
        setProvidersInfo(response.providers);
      }
    } catch (e) {
      // Игнорируем ошибки загрузки провайдеров
    }
  };

  const handlePolicyChange = async (updates: Partial<RoutingPolicy>) => {
    if (!routingPolicy) return;
    
    const newPolicy = { ...routingPolicy, ...updates };
    setRoutingPolicy(newPolicy);
    
    try {
      const response = await updateRoutingPolicy(newPolicy);
      if (response.success) {
        setMessageType('success');
        setMessage('Политика маршрутизации обновлена');
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (e: any) {
      setMessageType('error');
      setMessage(e.message || 'Ошибка обновления политики');
      // Откатываем изменения
      loadRoutingPolicy();
    }
  };

  const applyPreset = async (presetName: string) => {
    const preset = policyPresets[presetName];
    if (!preset) return;
    
    setRoutingPolicy(preset);
    
    try {
      const response = await updateRoutingPolicy(preset);
      if (response.success) {
        setMessageType('success');
        setMessage(`Применён пресет: ${presetName}`);
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (e: any) {
      setMessageType('error');
      setMessage(e.message || 'Ошибка применения пресета');
      loadRoutingPolicy();
    }
  };

  // Автоматическая проверка доступности при первой загрузке
  const [hasPerformedInitialCheck, setHasPerformedInitialCheck] = useState(false);
  
  useEffect(() => {
    if (!localConfig || hasPerformedInitialCheck) return;
    
    const performChecks = async () => {
      setHasPerformedInitialCheck(true);
      
      // Проверяем общую доступность (включая Ollama)
      setCheckingAvailability(true);
      try {
        const status = await checkAvailability();
        setAvailabilityStatus(status);
        
        // Обновляем статус Ollama из общей проверки
        if (status.providers?.ollama) {
          const ollamaData = status.providers.ollama;
          setOllamaStatus({
            available: ollamaData.available,
            models: ollamaData.models || [],
            base_url: get(localConfig, 'llm.providers.ollama.base_url', 'http://localhost:11434'),
            message: ollamaData.available 
              ? `Доступен • ${ollamaData.models_available || ollamaData.models?.length || 0} моделей` 
              : (ollamaData.error || 'Недоступен')
          });
        }
      } catch (error: any) {
        setAvailabilityStatus({
          server_available: false,
          message: error.message || 'Ошибка проверки доступности',
          providers: {}
        });
      } finally {
        setCheckingAvailability(false);
      }
    };
    
    performChecks();
  }, [localConfig, hasPerformedInitialCheck]);

  // Отслеживание изменений
  useEffect(() => {
    if (localConfig && originalConfig) {
      const changed = JSON.stringify(localConfig) !== JSON.stringify(originalConfig);
      setHasChanges(changed);
    }
  }, [localConfig, originalConfig]);

  const providers = useMemo(() => Object.keys(get(localConfig, 'llm.providers', {})), [localConfig]);

  const mutation = useMutation({
    mutationFn: (cfg: any) => updateConfig(cfg),
    onSuccess: async (res: any) => {
      const appliedChanges = res?.applied_changes || [];
      const warnings = res?.warnings || [];
      
      if (warnings.length > 0) {
        setMessageType('warning');
        setMessage(`Конфигурация сохранена. Применено изменений: ${appliedChanges.length}. Предупреждения: ${warnings.join(', ')}`);
      } else {
        setMessageType('success');
        setMessage(`Конфигурация успешно сохранена и применена. Применено изменений: ${appliedChanges.length}`);
      }
      
      // Обновляем кэш после успешного сохранения
      await queryClient.invalidateQueries({ queryKey: ['config'] });
      
      // Перезагружаем конфигурацию
      const updatedConfig = await queryClient.fetchQuery({ 
        queryKey: ['config'], 
        queryFn: getConfig 
      });
      
      // Обновляем локальное состояние
      if (updatedConfig) {
        setLocalConfig(updatedConfig);
        setOriginalConfig(JSON.parse(JSON.stringify(updatedConfig)));
        setJsonText(JSON.stringify(updatedConfig, null, 2));
      }
      
      // Сбрасываем флаг изменений
      setHasChanges(false);
      
      // Очищаем сообщение через 5 секунд
      setTimeout(() => {
        setMessage(null);
        setMessageType('info');
      }, 5000);
    },
    onError: (err: any) => {
      setMessageType('error');
      setMessage(err?.message || 'Ошибка сохранения конфигурации');
      // Очищаем сообщение об ошибке через 5 секунд
      setTimeout(() => {
        setMessage(null);
        setMessageType('info');
      }, 5000);
    },
  });

  const handleJsonChange = (value: string) => {
    setJsonText(value);
    setJsonError(null);
    try {
      const parsed = JSON.parse(value);
      setLocalConfig(parsed);
    } catch (e: any) {
      setJsonError(e?.message || 'Неверный JSON');
    }
  };

  const updateField = (path: string, value: any) => {
    const updated = set(localConfig, path, value);
    setLocalConfig(updated);
    setJsonText(JSON.stringify(updated, null, 2));
    // Очищаем сообщение при изменении
    if (message) {
      setMessage(null);
      setMessageType('info');
    }
  };

  const save = () => {
    setMessage(null);
    if (jsonError) {
      setMessage('Исправьте ошибки в JSON перед сохранением');
      return;
    }
    mutation.mutate(localConfig);
  };

  const handleCheckAvailability = async () => {
    setCheckingAvailability(true);
    try {
      const status = await checkAvailability();
      setAvailabilityStatus(status);
      
      // Всегда обновляем статус Ollama из общей проверки, если есть данные
      if (status.providers?.ollama) {
        const ollamaData = status.providers.ollama;
        setOllamaStatus({
          available: ollamaData.available,
          models: ollamaData.models || [],
          base_url: get(localConfig, 'llm.providers.ollama.base_url', 'http://localhost:11434'),
          message: ollamaData.available 
            ? `Доступен • ${ollamaData.models_available || ollamaData.models?.length || 0} моделей` 
            : (ollamaData.error || 'Недоступен')
        });
      }
      
      if (status.server_available) {
        setMessageType('success');
        setMessage('Проверка завершена успешно');
      } else {
        setMessageType('warning');
        setMessage(`Сервер недоступен: ${status.message}`);
      }
      setTimeout(() => {
        setMessage(null);
        setMessageType('info');
      }, 5000);
    } catch (error: any) {
      setAvailabilityStatus({
        server_available: false,
        message: error.message || 'Ошибка проверки доступности',
        providers: {}
      });
      setMessageType('error');
      setMessage(`Ошибка проверки: ${error.message}`);
      setTimeout(() => {
        setMessage(null);
        setMessageType('info');
      }, 5000);
    } finally {
      setCheckingAvailability(false);
    }
  };

  const handleCheckOllama = async () => {
    setCheckingOllama(true);
    try {
      const status = await checkOllamaServer();
      setOllamaStatus(status);
      if (status.available) {
        setMessageType('success');
        setMessage(`Ollama сервер доступен. Найдено моделей: ${status.models.length}`);
      } else {
        setMessageType('warning');
        setMessage(`Ollama сервер недоступен: ${status.message}`);
      }
      setTimeout(() => {
        setMessage(null);
        setMessageType('info');
      }, 5000);
    } catch (error: any) {
      setOllamaStatus({
        available: false,
        message: error.message || 'Ошибка проверки Ollama',
        models: [],
        base_url: null,
        error: 'unknown_error'
      });
      setMessageType('error');
      setMessage(`Ошибка проверки Ollama: ${error.message}`);
      setTimeout(() => {
        setMessage(null);
        setMessageType('info');
      }, 5000);
    } finally {
      setCheckingOllama(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 size={48} strokeWidth={1.5} className="animate-spin mx-auto mb-4 text-blue-400" />
          <p className="text-gray-400 text-lg">Загрузка настроек...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="p-4 bg-red-900/30 border-2 border-red-500/60 rounded-xl text-red-300 flex items-start gap-2">
          <CircleX size={20} strokeWidth={1.5} className="flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold mb-1">Ошибка</div>
            <div className="text-sm">{(error as any)?.message || 'Не удалось загрузить настройки'}</div>
          </div>
        </div>
      </div>
    );
  }

  const getMessageClassName = () => {
    switch (messageType) {
      case 'success':
        return 'bg-green-900/30 border-green-500/60 text-green-300';
      case 'error':
        return 'bg-red-900/30 border-red-500/60 text-red-300';
      case 'warning':
        return 'bg-yellow-900/30 border-yellow-500/60 text-yellow-300';
      default:
        return 'bg-blue-900/30 border-blue-500/60 text-blue-300';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0f111b]">
      {/* Status bar */}
      {message && (
        <div className={`px-6 py-3 border-b-2 ${getMessageClassName()}`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{message}</span>
            <button
              onClick={() => {
                setMessage(null);
                setMessageType('info');
              }}
              className="ml-4 text-lg opacity-70 hover:opacity-100 transition-opacity"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 p-6 space-y-6 overflow-y-auto border-r border-[#1f2236] bg-[#131524]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-3xl font-bold text-gray-100 flex items-center gap-3">
              <Settings size={32} strokeWidth={1.5} className="text-blue-400" />
              <span>Настройки</span>
            </h2>
            {hasChanges && (
              <span className="text-xs bg-yellow-900/40 border border-yellow-500/30 text-yellow-300 px-3 py-1.5 rounded-lg font-medium flex items-center gap-1">
                <AlertTriangle size={12} strokeWidth={1.5} />
                Есть несохранённые изменения
              </span>
            )}
          </div>

          {/* Секция проверки подключений */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Проверка подключений</h3>
                <p className="text-xs text-gray-400 mt-1">
                  Проверьте доступность серверов и моделей перед использованием
                </p>
              </div>
              <button
                onClick={handleCheckAvailability}
                disabled={checkingAvailability}
                className="px-4 py-2 text-sm bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md font-medium flex items-center gap-2"
                title="Проверить все провайдеры"
              >
                {checkingAvailability ? (
                  <>
                    <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
                    <span>Проверка...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={14} strokeWidth={1.5} />
                    <span>Проверить все</span>
                  </>
                )}
              </button>
            </div>
            
            {/* Карточки провайдеров */}
            <div className="space-y-2">
              {/* Ollama карточка - используем данные из отдельной проверки или из общей проверки */}
              {get(localConfig, 'llm.providers.ollama') && (() => {
                // Объединяем данные: приоритет у отдельной проверки, fallback на общую проверку
                const ollamaFromGeneral = availabilityStatus?.providers?.ollama;
                const finalOllamaStatus = ollamaStatus || (ollamaFromGeneral ? {
                  available: ollamaFromGeneral.available,
                  models: ollamaFromGeneral.models || [],
                  base_url: get(localConfig, 'llm.providers.ollama.base_url', 'http://localhost:11434'),
                  message: ollamaFromGeneral.available ? 'Доступен' : 'Недоступен'
                } : null);
                
                return (
                  <div className={`p-4 rounded-xl border-2 ${
                    finalOllamaStatus?.available 
                      ? 'bg-green-900/30 border-green-500/60' 
                      : finalOllamaStatus?.available === false
                      ? 'bg-red-900/30 border-red-500/60'
                      : 'bg-[#1a1d2e] border-[#2a2f46]'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${
                          finalOllamaStatus?.available 
                            ? 'bg-green-500' 
                            : finalOllamaStatus?.available === false
                            ? 'bg-red-500'
                            : 'bg-gray-500'
                        }`} />
                        <span className="font-semibold">Ollama</span>
                        {finalOllamaStatus?.base_url && (
                          <span className="text-xs text-gray-400">({finalOllamaStatus.base_url})</span>
                        )}
                      </div>
                      <button
                        onClick={handleCheckOllama}
                        disabled={checkingOllama}
                        className="px-3 py-1.5 text-xs bg-[#1f2236] border border-[#2a2f46] rounded-lg hover:bg-[#2a2f46] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                      >
                        {checkingOllama ? (
                          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          'Проверить'
                        )}
                      </button>
                    </div>
                    
                    {finalOllamaStatus && (
                      <div className="text-sm space-y-1">
                        <div className={finalOllamaStatus.available ? 'text-green-300' : 'text-red-300'}>
                          {finalOllamaStatus.available 
                            ? `✓ Доступен${finalOllamaStatus.models?.length ? ` • ${finalOllamaStatus.models.length} моделей` : ''}`
                            : `✗ ${finalOllamaStatus.message || 'Недоступен'}`
                          }
                        </div>
                        {finalOllamaStatus.available && finalOllamaStatus.models && finalOllamaStatus.models.length > 0 && (
                          <div className="mt-2">
                            <div className="text-xs text-gray-400 mb-1">Модели:</div>
                            <div className="flex flex-wrap gap-1">
                              {finalOllamaStatus.models.slice(0, 10).map((model: string, idx: number) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 bg-blue-600/30 text-blue-200 rounded text-xs"
                                >
                                  {model}
                                </span>
                              ))}
                              {finalOllamaStatus.models.length > 10 && (
                                <span className="px-2 py-0.5 bg-[#1f2236] border border-[#2a2f46] text-gray-300 rounded-lg text-xs">
                                  +{finalOllamaStatus.models.length - 10}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {!finalOllamaStatus && (
                      <div className="text-xs text-gray-400">Нажмите "Проверить" для проверки статуса</div>
                    )}
                  </div>
                );
              })()}

              {/* Другие провайдеры из общей проверки */}
              {availabilityStatus?.providers && Object.entries(availabilityStatus.providers)
                .filter(([name]) => name !== 'ollama')
                .map(([providerName, providerInfo]: [string, any]) => (
                  <div 
                    key={providerName}
                    className={`p-4 rounded-xl border-2 ${
                      providerInfo.available 
                        ? 'bg-green-900/30 border-green-500/60' 
                        : 'bg-red-900/30 border-red-500/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-3 h-3 rounded-full ${
                        providerInfo.available ? 'bg-green-500' : 'bg-red-500'
                      }`} />
                      <span className="font-semibold capitalize">{providerName}</span>
                    </div>
                    <div className={`text-sm ${providerInfo.available ? 'text-green-300' : 'text-red-300'}`}>
                      {providerInfo.available 
                        ? `✓ Доступен${providerInfo.models_available ? ` • ${providerInfo.models_available} моделей` : ''}`
                        : `✗ Недоступен${providerInfo.error ? ': ' + providerInfo.error : ''}`
                      }
                    </div>
                    {providerInfo.available && providerInfo.models && providerInfo.models.length > 0 && (
                      <div className="mt-2">
                        <div className="text-xs text-gray-400 mb-1">Модели:</div>
                        <div className="flex flex-wrap gap-1">
                          {providerInfo.models.slice(0, 10).map((model: string, idx: number) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 bg-blue-600/30 text-blue-200 rounded text-xs"
                            >
                              {model}
                            </span>
                          ))}
                          {providerInfo.models.length > 10 && (
                            <span className="px-2 py-0.5 bg-[#1f2236] border border-[#2a2f46] text-gray-300 rounded-lg text-xs">
                              +{providerInfo.models.length - 10}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </section>

          {/* Основные настройки LLM */}
          <section className="space-y-2">
            <h3 className="text-lg font-semibold">Основные настройки LLM</h3>
            <label className="text-sm text-gray-300">Провайдер по умолчанию</label>
            <select
              value={get(localConfig, 'llm.default_provider', '')}
              onChange={(e) => updateField('llm.default_provider', e.target.value)}
              className="w-full bg-[#0f111b] border-2 border-[#1f2236] rounded-xl px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
            >
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p === 'ollama' ? '🦙 Ollama (Приоритет)' : p}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Ollama является приоритетным провайдером для локальной работы. Система автоматически использует Ollama, если он доступен.
            </p>
          </section>

          {/* Политика маршрутизации моделей */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Shield size={20} strokeWidth={1.5} className="text-green-400" />
                  Политика маршрутизации
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  Контролируйте баланс между приватностью, стоимостью и качеством
                </p>
              </div>
              {policyLoading && (
                <Loader2 size={16} className="animate-spin text-blue-400" />
              )}
            </div>

            {policyError && (
              <div className="p-3 bg-red-900/30 border border-red-500/60 rounded-xl text-red-300 text-sm">
                {policyError}
              </div>
            )}

            {routingPolicy && (
              <>
                {/* Быстрые пресеты */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => applyPreset('privacy_first')}
                    className={`px-3 py-2 text-xs rounded-xl border-2 transition-all duration-200 flex items-center gap-1.5 ${
                      routingPolicy.require_private 
                        ? 'bg-green-900/40 border-green-500/60 text-green-300' 
                        : 'bg-[#1a1d2e] border-[#2a2f46] text-gray-300 hover:border-green-500/40'
                    }`}
                  >
                    <Lock size={12} />
                    Приватность
                  </button>
                  <button
                    onClick={() => applyPreset('cost_first')}
                    className={`px-3 py-2 text-xs rounded-xl border-2 transition-all duration-200 flex items-center gap-1.5 ${
                      routingPolicy.prefer_cheap && routingPolicy.max_cost_tier <= 2
                        ? 'bg-yellow-900/40 border-yellow-500/60 text-yellow-300' 
                        : 'bg-[#1a1d2e] border-[#2a2f46] text-gray-300 hover:border-yellow-500/40'
                    }`}
                  >
                    <DollarSign size={12} />
                    Экономия
                  </button>
                  <button
                    onClick={() => applyPreset('quality_first')}
                    className={`px-3 py-2 text-xs rounded-xl border-2 transition-all duration-200 flex items-center gap-1.5 ${
                      routingPolicy.prefer_quality && routingPolicy.min_quality >= 0.8
                        ? 'bg-purple-900/40 border-purple-500/60 text-purple-300' 
                        : 'bg-[#1a1d2e] border-[#2a2f46] text-gray-300 hover:border-purple-500/40'
                    }`}
                  >
                    <Zap size={12} />
                    Качество
                  </button>
                  <button
                    onClick={() => applyPreset('balanced')}
                    className={`px-3 py-2 text-xs rounded-xl border-2 transition-all duration-200 flex items-center gap-1.5 ${
                      routingPolicy.prefer_local && routingPolicy.prefer_quality && !routingPolicy.require_private && !routingPolicy.prefer_cheap
                        ? 'bg-blue-900/40 border-blue-500/60 text-blue-300' 
                        : 'bg-[#1a1d2e] border-[#2a2f46] text-gray-300 hover:border-blue-500/40'
                    }`}
                  >
                    <Settings size={12} />
                    Баланс
                  </button>
                </div>

                {/* Основные переключатели */}
                <div className="bg-[#1a1d2e] p-4 rounded-xl border-2 border-[#2a2f46] space-y-4">
                  {/* Приватность */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Lock size={16} className={routingPolicy.require_private ? 'text-green-400' : 'text-gray-400'} />
                      <div>
                        <div className="text-sm font-medium">Только приватные модели</div>
                        <div className="text-xs text-gray-400">Данные не уходят в облако (только Ollama)</div>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={routingPolicy.require_private}
                        onChange={(e) => handlePolicyChange({ require_private: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-green-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                    </label>
                  </div>

                  {/* Предпочитать локальные */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bot size={16} className={routingPolicy.prefer_local ? 'text-purple-400' : 'text-gray-400'} />
                      <div>
                        <div className="text-sm font-medium">Предпочитать локальные модели</div>
                        <div className="text-xs text-gray-400">Ollama в приоритете перед облаком</div>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={routingPolicy.prefer_local}
                        onChange={(e) => handlePolicyChange({ prefer_local: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                  </div>

                  {/* Предпочитать дешёвые */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign size={16} className={routingPolicy.prefer_cheap ? 'text-yellow-400' : 'text-gray-400'} />
                      <div>
                        <div className="text-sm font-medium">Предпочитать дешёвые модели</div>
                        <div className="text-xs text-gray-400">Экономия на облачных API</div>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={routingPolicy.prefer_cheap}
                        onChange={(e) => handlePolicyChange({ prefer_cheap: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-yellow-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-600"></div>
                    </label>
                  </div>

                  {/* Максимальная стоимость */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">Максимальный уровень стоимости</div>
                      <span className="text-xs px-2 py-1 bg-[#0f111b] border border-[#2a2f46] rounded-lg">
                        {COST_TIER_LABELS[routingPolicy.max_cost_tier] || 'Премиум'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="4"
                      value={routingPolicy.max_cost_tier}
                      onChange={(e) => handlePolicyChange({ max_cost_tier: parseInt(e.target.value) })}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>🆓 Бесплатно</span>
                      <span>💰 Дёшево</span>
                      <span>💎 Стандарт</span>
                      <span>👑 Премиум</span>
                    </div>
                  </div>

                  {/* Минимальное качество */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">Минимальное качество модели</div>
                      <span className="text-xs px-2 py-1 bg-[#0f111b] border border-[#2a2f46] rounded-lg">
                        {Math.round(routingPolicy.min_quality * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={routingPolicy.min_quality * 100}
                      onChange={(e) => handlePolicyChange({ min_quality: parseInt(e.target.value) / 100 })}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Любое</span>
                      <span>Высокое</span>
                    </div>
                  </div>
                </div>

                {/* Информация о провайдерах */}
                {providersInfo.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-300">Доступные провайдеры:</div>
                    <div className="grid gap-2">
                      {providersInfo.map((provider) => (
                        <div 
                          key={provider.name}
                          className={`flex items-center justify-between p-3 rounded-xl border-2 ${
                            provider.enabled
                              ? provider.is_private 
                                ? 'bg-green-900/20 border-green-500/40' 
                                : 'bg-[#1a1d2e] border-[#2a2f46]'
                              : 'bg-gray-900/30 border-gray-700/40 opacity-50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              provider.is_local ? 'bg-purple-900/40' : 'bg-blue-900/40'
                            }`}>
                              {provider.is_local ? (
                                <Bot size={16} className="text-purple-400" />
                              ) : (
                                <Zap size={16} className="text-blue-400" />
                              )}
                            </div>
                            <div>
                              <div className="text-sm font-medium capitalize flex items-center gap-2">
                                {provider.name}
                                {provider.is_private && (
                                  <span title="Приватный"><Lock size={12} className="text-green-400" /></span>
                                )}
                              </div>
                              <div className="text-xs text-gray-400">{provider.description}</div>
                            </div>
                          </div>
                          <div className="text-xs px-2 py-1 rounded-lg bg-[#0f111b] border border-[#2a2f46]">
                            {COST_TIER_LABELS[provider.cost_tier]}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

        {/* Секция API Сервера удалена - эти настройки (host, port, workers, reload) 
            не имеет смысла менять через UI, т.к. они применяются только при запуске сервера.
            Для изменения этих настроек редактируйте backend/config/config.yaml напрямую */}

        <section className="space-y-3">
          <div>
            <h3 className="text-lg font-semibold">Настройки провайдеров</h3>
            <p className="text-xs text-gray-400 mt-1">
              Настройте подключение к LLM провайдерам. Проверьте доступность в секции "Проверка подключений" выше.
            </p>
          </div>
          
          {/* Ollama настройки */}
          {get(localConfig, 'llm.providers.ollama') && (
            <div className="bg-[#1a1d2e] p-5 rounded-xl border-2 border-[#2a2f46]">
              <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                    <Bot size={16} strokeWidth={1.5} className="text-purple-400" />
                    <span>Ollama (Локальные модели)</span>
                  </h4>
                <span className="text-xs px-2.5 py-1 bg-green-900/40 border border-green-500/30 text-green-300 rounded-lg font-medium">Приоритетный</span>
              </div>
                <div className="space-y-4">
                <div className="bg-purple-900/20 border border-purple-700/50 rounded-xl p-3 mb-2">
                  <p className="text-xs text-purple-200">
                    🦙 <strong>Это адрес вашего Ollama сервера</strong> — куда AILLM будет отправлять запросы к LLM моделям. Ollama должен быть запущен по этому адресу.
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-300 mb-2 block font-medium">Base URL (адрес сервера Ollama)</label>
                  <input
                    value={get(localConfig, 'llm.providers.ollama.base_url', 'http://localhost:11434')}
                    onChange={(e) => updateField('llm.providers.ollama.base_url', e.target.value)}
                    className="w-full bg-[#0f111b] border-2 border-[#1f2236] rounded-xl px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                    placeholder="http://localhost:11434"
                  />
                  <p className="text-xs text-gray-400 mt-2">
                    Пример: <code className="bg-[#0f111b] px-1 rounded">http://localhost:11434</code> (локально) или <code className="bg-[#0f111b] px-1 rounded">http://192.168.1.100:11434</code> (удалённый сервер)
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-300 mb-2 block font-medium">Модель по умолчанию</label>
                  <input
                    value={get(localConfig, 'llm.providers.ollama.default_model', '')}
                    onChange={(e) => updateField('llm.providers.ollama.default_model', e.target.value)}
                    className="w-full bg-[#0f111b] border-2 border-[#1f2236] rounded-xl px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                    placeholder="llama2"
                  />
                  <p className="text-xs text-gray-400 mt-2">
                    Имя модели, которая будет использоваться по умолчанию
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(get(localConfig, 'llm.providers.ollama.enabled', true))}
                    onChange={(e) => updateField('llm.providers.ollama.enabled', e.target.checked)}
                  />
                  <span>Включен</span>
                </label>
              </div>
            </div>
          )}

          {/* OpenAI настройки */}
          {get(localConfig, 'llm.providers.openai') && (
            <div className="bg-[#1a1d2e] p-5 rounded-xl border-2 border-[#2a2f46]">
              <h4 className="text-sm font-semibold mb-4 text-gray-100 flex items-center gap-2">
                <Bot size={16} strokeWidth={1.5} className="text-green-400" />
                <span>OpenAI</span>
              </h4>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-300 mb-2 block font-medium">Base URL</label>
                  <input
                    value={get(localConfig, 'llm.providers.openai.base_url', 'https://api.openai.com/v1')}
                    onChange={(e) => updateField('llm.providers.openai.base_url', e.target.value)}
                    className="w-full bg-[#0f111b] border-2 border-[#1f2236] rounded-xl px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                    placeholder="https://api.openai.com/v1"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-300 mb-2 block font-medium">Модель по умолчанию</label>
                  <input
                    value={get(localConfig, 'llm.providers.openai.default_model', '')}
                    onChange={(e) => updateField('llm.providers.openai.default_model', e.target.value)}
                    className="w-full bg-[#0f111b] border-2 border-[#1f2236] rounded-xl px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                    placeholder="gpt-4-turbo-preview"
                  />
                </div>
                <div className="bg-blue-900/30 border-2 border-blue-500/40 rounded-xl p-3">
                  <p className="text-xs text-blue-300 flex items-start gap-2">
                    <Lightbulb size={14} strokeWidth={1.5} className="flex-shrink-0 mt-0.5" />
                    <span>API ключ должен быть установлен через переменную окружения <code className="bg-[#0f111b] px-2 py-0.5 rounded-lg border border-[#1f2236]">OPENAI_API_KEY</code></span>
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(get(localConfig, 'llm.providers.openai.enabled', true))}
                    onChange={(e) => updateField('llm.providers.openai.enabled', e.target.checked)}
                  />
                  <span>Включен</span>
                </label>
              </div>
            </div>
          )}

          {/* Anthropic настройки */}
          {get(localConfig, 'llm.providers.anthropic') && (
            <div className="bg-gray-800/50 p-4 rounded border border-gray-700">
              <h4 className="text-sm font-semibold mb-3">Anthropic (Claude)</h4>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-300 mb-1 block">Модель по умолчанию</label>
                  <input
                    value={get(localConfig, 'llm.providers.anthropic.default_model', '')}
                    onChange={(e) => updateField('llm.providers.anthropic.default_model', e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
                    placeholder="claude-3-opus-20240229"
                  />
                </div>
                <div className="bg-blue-900/20 border border-blue-700/50 rounded p-2">
                  <p className="text-xs text-blue-200">
                    💡 API ключ должен быть установлен через переменную окружения <code className="bg-gray-800 px-1 rounded">ANTHROPIC_API_KEY</code>
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(get(localConfig, 'llm.providers.anthropic.enabled', true))}
                    onChange={(e) => updateField('llm.providers.anthropic.enabled', e.target.checked)}
                  />
                  <span>Включен</span>
                </label>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="text-lg font-semibold">Настройки агентов</h3>
            <p className="text-xs text-gray-400 mt-1">
              Настройте thinking mode для каждого агента. Thinking mode улучшает качество reasoning для сложных задач.
            </p>
            <div className="bg-blue-900/20 border border-blue-700/50 rounded p-2 mt-2">
              <p className="text-xs text-blue-200">
                💡 <strong>Thinking Mode:</strong> Включает глубокое рассуждение для моделей. Для Ollama: нативная поддержка (Llama 3.3+, Qwen 2.5+) или эмуляция через промпты.
              </p>
            </div>
          </div>
          
          <div className="space-y-3">
            {['code_writer', 'react', 'research', 'data_analysis', 'workflow', 'integration', 'monitoring'].map((agentId) => {
              const agentNames: Record<string, string> = {
                code_writer: 'Генератор кода',
                react: 'ReAct (Reasoning + Acting)',
                research: 'Исследователь',
                data_analysis: 'Анализ данных',
                workflow: 'Workflow',
                integration: 'Интеграция',
                monitoring: 'Мониторинг',
              };
              
              const agentDescriptions: Record<string, string> = {
                code_writer: 'Генерация и рефакторинг кода',
                react: 'Интерактивное решение задач с reasoning',
                research: 'Исследование и анализ информации',
                data_analysis: 'Анализ данных и статистика',
                workflow: 'Управление рабочими процессами',
                integration: 'Интеграция с внешними сервисами',
                monitoring: 'Мониторинг производительности',
              };
              
              const recommendedThinking: Record<string, boolean> = {
                react: true,
                research: true,
                data_analysis: true,
                code_writer: false,
                workflow: false,
                integration: false,
                monitoring: false,
              };
              
              return (
                <div key={agentId} className="bg-gray-800/50 p-3 rounded border border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="text-sm font-semibold">{agentNames[agentId]}</h4>
                      <p className="text-xs text-gray-400">{agentDescriptions[agentId]}</p>
                    </div>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(get(localConfig, `agents.${agentId}.use_thinking_mode`, recommendedThinking[agentId] || false))}
                        onChange={(e) => updateField(`agents.${agentId}.use_thinking_mode`, e.target.checked)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Thinking Mode</span>
                    </label>
                  </div>
                  {recommendedThinking[agentId] && (
                    <div className="text-xs text-green-300 mt-1">
                      ✓ Рекомендуется для этого агента
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-lg font-semibold">RAG и Контекст</h3>
          <div className="space-y-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(get(localConfig, 'rag.enabled', true))}
                onChange={(e) => updateField('rag.enabled', e.target.checked)}
              />
              <span>RAG система включена</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-300">Размер контекста (токены)</label>
                <input
                  type="number"
                  value={get(localConfig, 'context.max_tokens', 8000)}
                  onChange={(e) => updateField('context.max_tokens', Number(e.target.value))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-300">Top K результатов</label>
                <input
                  type="number"
                  value={get(localConfig, 'rag.search.top_k', 10)}
                  onChange={(e) => updateField('rag.search.top_k', Number(e.target.value))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-lg font-semibold">Память</h3>
          <div className="space-y-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(get(localConfig, 'memory.enabled', true))}
                onChange={(e) => updateField('memory.enabled', e.target.checked)}
              />
              <span>Долгосрочная память включена</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-300">Макс. количество воспоминаний</label>
                <input
                  type="number"
                  value={get(localConfig, 'memory.max_memories', 10000)}
                  onChange={(e) => updateField('memory.max_memories', Number(e.target.value))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-300">Порог схожести</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  value={get(localConfig, 'memory.similarity_threshold', 0.7)}
                  onChange={(e) => updateField('memory.similarity_threshold', Number(e.target.value))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-lg font-semibold">Безопасность инструментов</h3>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(get(localConfig, 'tools.safety.sandbox', false))}
              onChange={(e) => updateField('tools.safety.sandbox', e.target.checked)}
            />
            <span>Sandbox для опасных операций</span>
          </label>

          <label className="text-sm text-gray-300">Разрешённые команды (через запятую)</label>
          <textarea
            value={(get(localConfig, 'tools.safety.allowed_commands', []) || []).join(', ')}
            onChange={(e) =>
              updateField(
                'tools.safety.allowed_commands',
                e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            }
            rows={2}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
          />

          <div className="grid grid-cols-2 gap-2">
            {Object.entries(get(localConfig, 'tools.categories', {})).map(([cat, enabled]) => (
              <label key={cat} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(enabled)}
                  onChange={(e) => updateField(`tools.categories.${cat}`, e.target.checked)}
                />
                <span>{cat}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <div>
            <h3 className="text-lg font-semibold">Логирование</h3>
            <p className="text-xs text-gray-400 mt-1">
              Настройки логирования системы. Изменения применяются динамически без перезапуска.
            </p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-300">Уровень логирования</label>
              <select
                value={get(localConfig, 'logging.level', 'INFO')}
                onChange={(e) => updateField('logging.level', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm mt-1"
              >
                {['DEBUG', 'INFO', 'WARNING', 'ERROR'].map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-300">Формат логов</label>
              <select
                value={get(localConfig, 'logging.format', 'text')}
                onChange={(e) => updateField('logging.format', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm mt-1"
              >
                <option value="text">Текстовый</option>
                <option value="json">JSON</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-300">Путь к файлу логов</label>
              <input
                value={get(localConfig, 'logging.file', 'logs/app.log')}
                onChange={(e) => updateField('logging.file', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm mt-1"
                placeholder="logs/app.log"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm text-gray-300">Макс. размер файла (MB)</label>
                <input
                  type="number"
                  min="1"
                  value={get(localConfig, 'logging.max_size_mb', 100)}
                  onChange={(e) => updateField('logging.max_size_mb', Number(e.target.value))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-sm text-gray-300">Кол-во резервных копий</label>
                <input
                  type="number"
                  min="1"
                  value={get(localConfig, 'logging.backup_count', 5)}
                  onChange={(e) => updateField('logging.backup_count', Number(e.target.value))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm mt-1"
                />
              </div>
            </div>
          </div>
        </section>

          <div className="flex items-center gap-3 pt-4 border-t border-gray-700">
            <button
              onClick={save}
              disabled={mutation.isPending || !!jsonError || !hasChanges}
              className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {mutation.isPending ? 'Сохранение...' : 'Сохранить изменения'}
            </button>
            {!hasChanges && (
              <span className="text-xs text-gray-500">Нет изменений для сохранения</span>
            )}
            {jsonError && (
              <span className="text-sm text-red-400">Ошибка JSON: {jsonError}</span>
            )}
          </div>
        </div>

        {/* JSON Editor - второй столбец */}
        <div className="w-1/2 p-6 space-y-4 overflow-y-auto bg-[#131524]">
          <div className="mb-4">
            <h3 className="text-xl font-bold text-gray-100 flex items-center gap-2 mb-2">
              <FileCode size={20} strokeWidth={1.5} />
              <span>Полная конфигурация (JSON)</span>
            </h3>
            <p className="text-xs text-gray-400">Редактируйте при необходимости</p>
          </div>
          <textarea
            value={jsonText}
            onChange={(e) => handleJsonChange(e.target.value)}
            className="w-full h-[calc(100vh-250px)] bg-[#0a0a0f] border-2 border-[#1a1d2e] rounded-xl px-4 py-3 font-mono text-xs text-gray-200 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 resize-none"
          />
        </div>
      </div>
    </div>
  );
}
