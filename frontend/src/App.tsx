import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MainLayout } from './components/MainLayout';
import { ExecutionProvider } from './state/executionContext';
import { AppErrorBoundary } from './components/ErrorBoundary';
import { RETRY_CONFIG } from './config/timeouts';
import './App.css';

// Configure QueryClient with retry logic and caching
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: RETRY_CONFIG.MAX_RETRIES,
      retryDelay: (attemptIndex) => 
        Math.min(
          RETRY_CONFIG.RETRY_DELAY * Math.pow(RETRY_CONFIG.RETRY_MULTIPLIER, attemptIndex),
          RETRY_CONFIG.MAX_RETRY_DELAY
        ),
      staleTime: 30000,         // 30 seconds - data is fresh for this period
      gcTime: 300000,           // 5 minutes - cache garbage collection
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
      retryDelay: RETRY_CONFIG.RETRY_DELAY,
    },
  },
});

function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ExecutionProvider>
          <MainLayout />
        </ExecutionProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

export default App;

