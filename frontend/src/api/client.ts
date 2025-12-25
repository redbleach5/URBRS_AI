import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 600000, // shared default timeout for long tasks
});

client.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.code === 'ECONNABORTED') {
      return Promise.reject(new Error('Истек таймаут запроса. Проверьте доступность backend.'));
    }
    if (error.code === 'ECONNREFUSED' || error.message?.includes('Network Error')) {
      return Promise.reject(new Error(`Не удалось подключиться к серверу ${API_BASE_URL}. Убедитесь, что backend запущен.`));
    }
    if (error.response) {
      const detail = error.response.data?.detail || error.response.data?.message;
      return Promise.reject(new Error(detail || `Ошибка сервера: ${error.response.status}`));
    }
    return Promise.reject(error);
  }
);

export interface TaskRequest {
  task: string;
  agent_type?: string;
  context?: Record<string, any>;
  model?: string;  // Выбранная модель (undefined = автовыбор)
  provider?: string;  // Выбранный провайдер
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  message: string;
  history?: ChatMessage[];
  mode?: 'general' | 'ide' | 'research';
  context?: Record<string, any>;
  model?: string;  // Выбранная модель (undefined = автовыбор)
  provider?: string;  // Выбранный провайдер
}

export interface ChatResponse {
  success: boolean;
  message: string;
  error?: string;
  metadata?: {
    model?: string;
    provider?: string;
    mode?: string;
    has_thinking?: boolean;
    thinking?: string;
    web_search_used?: boolean;
  };
}

export async function executeTask(request: TaskRequest, signal?: AbortSignal) {
  try {
    const response = await client.post('/tasks/execute', request, {
      signal,
      timeout: 600000, // 10 minutes for complex tasks
    });
    return response.data;
  } catch (error: any) {
    throw error;
  }
}

/**
 * Простой чат без агентов - для быстрых ответов, шуток, новостей и т.д.
 */
export async function sendChat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
  try {
    const response = await client.post('/chat', request, {
      signal,
      timeout: 120000, // 2 minutes for chat
    });
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      message: '',
      error: error.message || 'Ошибка отправки сообщения'
    };
  }
}

export async function getStatus() {
  try {
    const response = await client.get('/tasks/status', {
      timeout: 5000, // 5 seconds timeout for status check
    });
    return response.data;
  } catch (error: any) {
    // Определяем тип ошибки для более детального сообщения
    let errorMessage = 'Не удалось подключиться к серверу';
    let errorType = 'connection_error';
    
    if (error.code === 'ECONNABORTED') {
      errorMessage = 'Таймаут подключения к серверу';
      errorType = 'timeout';
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Сервер недоступен. Возможно, порт 8000 занят или backend не запущен';
      errorType = 'connection_refused';
    } else if (error.message?.includes('Network Error') || error.message?.includes('address already in use')) {
      errorMessage = 'Порт 8000 занят. Остановите другой процесс или измените порт в настройках';
      errorType = 'port_in_use';
    } else if (error.response) {
      errorMessage = error.response.data?.detail || error.response.data?.message || `Ошибка сервера: ${error.response.status}`;
      errorType = 'server_error';
    }
    
    return { 
      status: 'недоступен', 
      error: errorMessage,
      error_type: errorType,
      initialized: false
    };
  }
}

export async function getMetrics() {
  const response = await client.get('/monitoring/metrics');
  return response.data;
}

export async function getHealthReport() {
  try {
    const response = await client.get('/monitoring/health');
    return response.data;
  } catch (error: any) {
    // Если endpoint недоступен, возвращаем null
    return null;
  }
}

export async function generateCode(request: { task: string; file_path?: string; existing_code?: string }) {
  const response = await client.post('/code/generate', request);
  return response.data;
}

export async function listTools() {
  const response = await client.get('/tools');
  return response.data;
}

export async function executeTool(request: { tool_name: string; input: Record<string, any> }) {
  const response = await client.post('/tools/execute', request);
  return response.data;
}

export async function indexProject(request: { project_path: string }) {
  const response = await client.post('/project/index', request);
  return response.data;
}

export async function getMetricsStats() {
  const response = await client.get('/metrics/stats');
  return response.data;
}

export async function processBatchTasks(request: { tasks: string[]; agent_type?: string }) {
  const response = await client.post('/batch/tasks', request);
  return response.data;
}

export async function getConfig(): Promise<any> {
  try {
    const response = await client.get('/config');
    return response.data;
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED' || error.message?.includes('Network Error')) {
      throw new Error('Не удалось подключиться к серверу. Убедитесь, что backend запущен на http://localhost:8000');
    }
    if (error.response) {
      throw new Error(error.response.data?.detail || error.response.data?.message || `Ошибка сервера: ${error.response.status}`);
    }
    throw error;
  }
}

export async function updateConfig(config: any): Promise<any> {
  try {
    const response = await client.put('/config', config);
    return response.data;
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED' || error.message?.includes('Network Error')) {
      throw new Error('Не удалось подключиться к серверу. Убедитесь, что backend запущен на http://localhost:8000');
    }
    if (error.response) {
      throw new Error(error.response.data?.detail || error.response.data?.message || `Ошибка сервера: ${error.response.status}`);
    }
    throw error;
  }
}

export async function checkAvailability(): Promise<any> {
  try {
    const response = await client.get('/monitoring/check-availability', {
      timeout: 10000, // 10 seconds timeout for availability check
    });
    return response.data;
  } catch (error: any) {
    // Если сервер недоступен, возвращаем структурированный ответ
    if (error.code === 'ECONNREFUSED' || error.message?.includes('Network Error')) {
      return {
        server_available: false,
        message: 'Сервер недоступен. Убедитесь, что backend запущен на http://localhost:8000',
        providers: {}
      };
    }
    if (error.response) {
      return {
        server_available: false,
        message: error.response.data?.detail || error.response.data?.message || `Ошибка сервера: ${error.response.status}`,
        providers: {}
      };
    }
    return {
      server_available: false,
      message: error.message || 'Неизвестная ошибка при проверке доступности',
      providers: {}
    };
  }
}

export async function checkOllamaServer(): Promise<any> {
  try {
    const response = await client.get('/monitoring/ollama/check', {
      timeout: 10000, // 10 seconds timeout for Ollama check
    });
    return response.data;
  } catch (error: any) {
    // Если сервер недоступен, возвращаем структурированный ответ
    if (error.code === 'ECONNREFUSED' || error.message?.includes('Network Error')) {
      return {
        available: false,
        message: 'Не удалось подключиться к backend серверу. Убедитесь, что backend запущен.',
        models: [],
        base_url: null,
        error: 'backend_connection_error'
      };
    }
    if (error.response) {
      return {
        available: false,
        message: error.response.data?.detail || error.response.data?.message || `Ошибка сервера: ${error.response.status}`,
        models: [],
        base_url: null,
        error: `server_error_${error.response.status}`
      };
    }
    return {
      available: false,
      message: error.message || 'Неизвестная ошибка при проверке Ollama',
      models: [],
      base_url: null,
      error: 'unknown_error'
    };
  }
}

// Models API
export interface ModelInfo {
  name: string;
  provider: string;
  size?: string;
  capabilities: string[];
  quality_score: number;
  speed_score: number;
  is_available: boolean;
  is_recommended: boolean;
  description?: string;
}

export interface ModelsResponse {
  success: boolean;
  models: ModelInfo[];
  current_model?: string;
  auto_select_enabled: boolean;
  resource_level: string;
}

export interface ModelSelectRequest {
  model?: string;
  provider?: string;
  auto_select?: boolean;
}

export interface ModelSelectResponse {
  success: boolean;
  selected_model: string;
  provider: string;
  auto_selected: boolean;
  reason: string;
}

export async function getAvailableModels(): Promise<ModelsResponse> {
  try {
    const response = await client.get('/models', { timeout: 15000 });
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      models: [],
      auto_select_enabled: true,
      resource_level: 'unknown'
    };
  }
}

export async function selectModel(request: ModelSelectRequest): Promise<ModelSelectResponse> {
  try {
    const response = await client.post('/models/select', request);
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      selected_model: '',
      provider: '',
      auto_selected: true,
      reason: error.message || 'Ошибка выбора модели'
    };
  }
}

export async function getRecommendedModel(
  taskType?: string,
  complexity?: string,
  speedPriority?: boolean
): Promise<any> {
  try {
    const params = new URLSearchParams();
    if (taskType) params.append('task_type', taskType);
    if (complexity) params.append('complexity', complexity);
    if (speedPriority) params.append('speed_priority', 'true');
    
    const response = await client.get(`/models/recommend?${params.toString()}`, { timeout: 10000 });
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      recommended: null,
      reason: error.message || 'Ошибка получения рекомендации'
    };
  }
}

// Learning & Feedback API
export async function getFeedbackStats(): Promise<any> {
  try {
    const response = await client.get('/feedback/stats', { timeout: 10000 });
    return response.data;
  } catch (error: any) {
    return {
      error: true,
      message: error.message || 'Не удалось получить статистику обучения',
      solution_feedback: { total: 0, avg_rating: 0, helpful_percentage: 0 },
      model_feedback: {},
      learning_insights: { status: 'error', recommendations: [] }
    };
  }
}

export async function getFeedbackRecommendations(): Promise<any> {
  try {
    const response = await client.get('/feedback/recommendations', { timeout: 10000 });
    return response.data;
  } catch (error: any) {
    return {
      error: true,
      recommendations: [],
      message: error.message || 'Не удалось получить рекомендации'
    };
  }
}

export async function submitFeedback(feedback: {
  task: string;
  solution: string;
  rating: number;
  is_helpful: boolean;
  comments?: string;
  agent?: string;
  model?: string;
  provider?: string;
  solution_id?: string;
}): Promise<any> {
  try {
    const response = await client.post('/feedback/solution', feedback);
    return response.data;
  } catch (error: any) {
    throw new Error(error.message || 'Не удалось отправить feedback');
  }
}

