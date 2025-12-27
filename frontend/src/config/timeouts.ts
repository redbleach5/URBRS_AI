/**
 * Centralized timeout configuration for API requests
 * All values are in milliseconds
 */
export const TIMEOUT_CONFIG = {
  // Short timeouts for quick operations
  STATUS_CHECK: 5000,           // 5 seconds - health checks, status polls
  QUICK_REQUEST: 10000,         // 10 seconds - simple API calls
  
  // Medium timeouts
  CHAT: 120000,                 // 2 minutes - chat responses
  MODELS_LIST: 15000,           // 15 seconds - fetching model lists
  OLLAMA_CHECK: 10000,          // 10 seconds - Ollama availability check
  AVAILABILITY_CHECK: 10000,    // 10 seconds - provider availability
  
  // Long timeouts for heavy operations
  TASK_EXECUTION: 600000,       // 10 minutes - complex task execution
  BATCH_PROCESSING: 900000,     // 15 minutes - batch task processing
  CODE_GENERATION: 300000,      // 5 minutes - code generation
  
  // WebSocket timeouts
  WS_CONNECT: 5000,             // 5 seconds - WebSocket connection
  WS_PING_INTERVAL: 20000,      // 20 seconds - ping interval
  WS_PONG_TIMEOUT: 10000,       // 10 seconds - pong response timeout
} as const;

/**
 * Retry configuration
 */
export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,           // 1 second initial delay
  RETRY_MULTIPLIER: 2,         // Exponential backoff multiplier
  MAX_RETRY_DELAY: 10000,      // 10 seconds max delay
} as const;

/**
 * Get timeout for specific operation type
 */
export function getTimeout(operation: keyof typeof TIMEOUT_CONFIG): number {
  return TIMEOUT_CONFIG[operation];
}

/**
 * Calculate retry delay with exponential backoff
 */
export function getRetryDelay(attempt: number): number {
  const delay = RETRY_CONFIG.RETRY_DELAY * Math.pow(RETRY_CONFIG.RETRY_MULTIPLIER, attempt);
  return Math.min(delay, RETRY_CONFIG.MAX_RETRY_DELAY);
}

