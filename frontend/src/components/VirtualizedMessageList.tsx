import React, { useCallback, useEffect, useRef, memo } from 'react';
import { ChatMessage as MessageComponent } from './ChatMessage';
import { ChatMessage as MessageType, FeedbackData } from '../state/chatStore';
import { CodeExecutionResult } from './CodeExecutor';
import { ComponentErrorBoundary } from './ErrorBoundary';

// Estimated heights for different message types
const ESTIMATED_HEIGHTS = {
  USER_MESSAGE: 80,
  ASSISTANT_SHORT: 120,
  ASSISTANT_WITH_CODE: 400,
  ASSISTANT_WITH_REFLECTION: 500,
  STREAMING: 60,
  ERROR: 100,
};

interface VirtualizedMessageListProps {
  messages: MessageType[];
  runningCodeId: string | null;
  codeExecutionResults: Record<string, CodeExecutionResult>;
  onRunCode: (code: string, messageId: string, files?: any[]) => void;
  onDownloadCode: (code: string, filename: string) => void;
  onFeedbackSubmit: (messageId: string, feedback: FeedbackData) => void;
  containerHeight: number;
}

/**
 * Estimate message height based on content
 */
function estimateMessageHeight(message: MessageType): number {
  if (message.role === 'user') {
    // User messages - based on content length
    const lines = Math.ceil(message.content.length / 60);
    return Math.max(ESTIMATED_HEIGHTS.USER_MESSAGE, 60 + lines * 20);
  }

  if (message.status === 'streaming') {
    return ESTIMATED_HEIGHTS.STREAMING;
  }

  if (message.status === 'error') {
    return ESTIMATED_HEIGHTS.ERROR;
  }

  // Assistant messages - more complex estimation
  let height = ESTIMATED_HEIGHTS.ASSISTANT_SHORT;

  // Check for code
  const hasCode = message.result?.code || message.content?.includes('```');
  if (hasCode) {
    height = ESTIMATED_HEIGHTS.ASSISTANT_WITH_CODE;
  }

  // Check for reflection
  if (message.reflection) {
    height = Math.max(height, ESTIMATED_HEIGHTS.ASSISTANT_WITH_REFLECTION);
  }

  // Check for thinking
  if (message.thinking) {
    height += 200;
  }

  // Check for subtasks
  if (message.subtasks && message.subtasks.length > 0) {
    height += message.subtasks.length * 50;
  }

  // Content length adjustment
  const contentLines = Math.ceil((message.content?.length || 0) / 80);
  height += contentLines * 15;

  return Math.min(height, 1200); // Cap at 1200px
}

/**
 * Message row component - memoized for performance
 */
const MessageRow: React.FC<{
  message: MessageType;
  index: number;
  runningCodeId: string | null;
  executionResult?: CodeExecutionResult;
  onRunCode: (code: string, messageId: string, files?: any[]) => void;
  onDownloadCode: (code: string, filename: string) => void;
  onFeedbackSubmit: (messageId: string, feedback: FeedbackData) => void;
}> = memo(({ message, index, runningCodeId, executionResult, onRunCode, onDownloadCode, onFeedbackSubmit }) => (
  <ComponentErrorBoundary>
    <MessageComponent
      message={message}
      index={index}
      runningCodeId={runningCodeId}
      executionResult={executionResult}
      onRunCode={onRunCode}
      onDownloadCode={onDownloadCode}
      onFeedbackSubmit={onFeedbackSubmit}
    />
  </ComponentErrorBoundary>
));

MessageRow.displayName = 'MessageRow';

/**
 * Optimized message list for performance with large conversations
 * Uses windowing for lists > 50 messages
 */
export const VirtualizedMessageList: React.FC<VirtualizedMessageListProps> = memo(({
  messages,
  runningCodeId,
  codeExecutionResults,
  onRunCode,
  onDownloadCode,
  onFeedbackSubmit,
  containerHeight,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages.length]);

  // For small message lists, render normally
  // React.memo on MessageRow handles re-render optimization
  if (messages.length < 50) {
    return (
      <div 
        ref={containerRef}
        className="space-y-2 px-4 overflow-y-auto"
        style={{ maxHeight: containerHeight || 'auto' }}
      >
        {messages.map((message, index) => (
          <MessageRow
            key={message.id}
            message={message}
            index={index}
            runningCodeId={runningCodeId}
            executionResult={codeExecutionResults[message.id]}
            onRunCode={onRunCode}
            onDownloadCode={onDownloadCode}
            onFeedbackSubmit={onFeedbackSubmit}
          />
        ))}
      </div>
    );
  }

  // For very large lists, show only recent messages with a load more button
  const VISIBLE_COUNT = 50;
  const visibleMessages = messages.slice(-VISIBLE_COUNT);
  const hiddenCount = messages.length - VISIBLE_COUNT;

  return (
    <div 
      ref={containerRef}
      className="space-y-2 px-4 overflow-y-auto"
      style={{ maxHeight: containerHeight || 'auto' }}
    >
      {hiddenCount > 0 && (
        <div className="text-center py-3">
          <span className="text-xs text-gray-500">
            {hiddenCount} более ранних сообщений скрыто
          </span>
        </div>
      )}
      {visibleMessages.map((message, index) => (
        <MessageRow
          key={message.id}
          message={message}
          index={hiddenCount + index}
          runningCodeId={runningCodeId}
          executionResult={codeExecutionResults[message.id]}
          onRunCode={onRunCode}
          onDownloadCode={onDownloadCode}
          onFeedbackSubmit={onFeedbackSubmit}
        />
      ))}
    </div>
  );
});

export default VirtualizedMessageList;

