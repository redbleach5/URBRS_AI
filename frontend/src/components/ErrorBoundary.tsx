import React from 'react';
import { ErrorBoundary as ReactErrorBoundary, FallbackProps } from 'react-error-boundary';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

/**
 * Error fallback component shown when an error occurs
 */
const ErrorFallback: React.FC<FallbackProps> = ({ error, resetErrorBoundary }) => {
  const handleReset = () => {
    // Clear any cached state that might cause the error
    localStorage.removeItem('aillm-chat-store');
    resetErrorBoundary();
  };

  const handleGoHome = () => {
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#1a1d2e] border border-red-500/30 rounded-2xl p-8 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
            <AlertTriangle size={24} className="text-red-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-100">Что-то пошло не так</h2>
            <p className="text-sm text-gray-400">Произошла непредвиденная ошибка</p>
          </div>
        </div>

        {/* Error details */}
        <div className="mb-6 p-4 bg-[#0f111b] border border-red-500/20 rounded-xl">
          <div className="text-xs text-red-400 font-mono break-all max-h-32 overflow-y-auto">
            {error.message || 'Неизвестная ошибка'}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={resetErrorBoundary}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-all duration-200 shadow-lg shadow-blue-500/20"
          >
            <RefreshCw size={18} />
            <span>Попробовать снова</span>
          </button>

          <button
            onClick={handleReset}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#0f111b] hover:bg-[#1f2236] text-gray-300 border border-[#2a2f46] rounded-xl font-medium transition-all duration-200"
          >
            <RefreshCw size={18} />
            <span>Сбросить кэш и перезагрузить</span>
          </button>

          <button
            onClick={handleGoHome}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#0f111b] hover:bg-[#1f2236] text-gray-400 border border-[#2a2f46] rounded-xl font-medium transition-all duration-200"
          >
            <Home size={18} />
            <span>На главную</span>
          </button>
        </div>

        {/* Help text */}
        <p className="mt-6 text-xs text-gray-500 text-center">
          Если проблема повторяется, попробуйте очистить кэш браузера или обратитесь к разработчику.
        </p>
      </div>
    </div>
  );
};

/**
 * Error handler for logging
 */
const handleError = (error: Error, info: React.ErrorInfo) => {
  console.error('Error caught by boundary:', error);
  console.error('Component stack:', info.componentStack || 'Not available');
  
  // You could send this to an error tracking service
  // logErrorToService(error, info);
};

/**
 * Error Boundary wrapper component
 */
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const AppErrorBoundary: React.FC<ErrorBoundaryProps> = ({ children, fallback }) => {
  return (
    <ReactErrorBoundary
      FallbackComponent={fallback ? () => <>{fallback}</> : ErrorFallback}
      onError={handleError}
      onReset={() => {
        // Reset app state on retry
        window.location.reload();
      }}
    >
      {children}
    </ReactErrorBoundary>
  );
};

/**
 * Smaller error boundary for components (not full page)
 */
const ComponentErrorFallback: React.FC<FallbackProps> = ({ error, resetErrorBoundary }) => (
  <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-xl">
    <div className="flex items-center gap-2 mb-2">
      <AlertTriangle size={16} className="text-red-400" />
      <span className="text-sm font-medium text-red-300">Ошибка компонента</span>
    </div>
    <p className="text-xs text-red-400/80 mb-3">{error.message}</p>
    <button
      onClick={resetErrorBoundary}
      className="text-xs px-3 py-1.5 bg-red-600/50 hover:bg-red-600 text-white rounded-lg transition-colors"
    >
      Перезагрузить
    </button>
  </div>
);

export const ComponentErrorBoundary: React.FC<ErrorBoundaryProps> = ({ children }) => {
  return (
    <ReactErrorBoundary
      FallbackComponent={ComponentErrorFallback}
      onError={(error) => console.error('Component error:', error)}
    >
      {children}
    </ReactErrorBoundary>
  );
};

export default AppErrorBoundary;

