import React, { memo } from 'react';
import { 
  Archive, History, Brain, MessageSquare,
  Info, ChevronRight
} from 'lucide-react';

interface ChatContextIndicatorProps {
  /** Was the chat history summarized? */
  chatSummarized?: boolean;
  /** Was RAG context used? */
  ragContextUsed?: boolean;
  /** Was web search used? */
  webSearchUsed?: boolean;
  /** Number of messages in history before summarization */
  messagesBeforeSummary?: number;
  /** Is thinking mode active? */
  thinkingMode?: boolean;
}

/**
 * Shows context indicators about how the current message was processed:
 * - Chat history summarization
 * - RAG context enrichment
 * - Web search results
 * - Thinking mode
 */
export const ChatContextIndicator: React.FC<ChatContextIndicatorProps> = memo(({
  chatSummarized,
  ragContextUsed,
  webSearchUsed,
  messagesBeforeSummary,
  thinkingMode
}) => {
  // Don't show if nothing special happened
  if (!chatSummarized && !ragContextUsed && !webSearchUsed && !thinkingMode) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 flex-wrap mb-2">
      {/* Chat summarization indicator */}
      {chatSummarized && (
        <div 
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30"
          title={messagesBeforeSummary 
            ? `История из ${messagesBeforeSummary} сообщений была суммирована для сохранения контекста` 
            : "История чата была суммирована для сохранения контекста"}
        >
          <Archive size={10} />
          <span>История суммирована</span>
          {messagesBeforeSummary && (
            <span className="opacity-70">({messagesBeforeSummary})</span>
          )}
        </div>
      )}
      
      {/* RAG context indicator */}
      {ragContextUsed && (
        <div 
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30"
          title="Использован контекст из базы знаний проекта"
        >
          <Brain size={10} />
          <span>RAG контекст</span>
        </div>
      )}
      
      {/* Web search indicator */}
      {webSearchUsed && (
        <div 
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/20 text-green-300 border border-green-500/30"
          title="Использованы результаты поиска в интернете"
        >
          <span>🌐</span>
          <span>Web поиск</span>
        </div>
      )}
      
      {/* Thinking mode indicator */}
      {thinkingMode && (
        <div 
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30"
          title="Модель использовала расширенное мышление"
        >
          <span>💭</span>
          <span>Thinking</span>
        </div>
      )}
    </div>
  );
});

ChatContextIndicator.displayName = 'ChatContextIndicator';

/**
 * Shows a summary of conversation context at the top of chat
 * when there's a lot of history being managed
 */
export const ConversationContextBanner: React.FC<{
  totalMessages: number;
  summarizedMessages?: number;
  activeSummary?: boolean;
}> = memo(({ totalMessages, summarizedMessages, activeSummary }) => {
  if (totalMessages < 10 || !activeSummary) {
    return null;
  }

  return (
    <div className="mx-4 mb-4 p-3 bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-500/30 rounded-xl flex items-center gap-3">
      <div className="p-2 bg-purple-500/20 rounded-lg">
        <History size={18} className="text-purple-400" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-purple-200">
          Длинный диалог
        </div>
        <div className="text-xs text-purple-300/70">
          {summarizedMessages || Math.floor(totalMessages * 0.7)} сообщений суммировано • 
          Последние {totalMessages - (summarizedMessages || Math.floor(totalMessages * 0.7))} сохранены полностью
        </div>
      </div>
      <div className="flex items-center gap-1 text-xs text-purple-400">
        <Info size={12} />
        <span>Контекст сохранён</span>
      </div>
    </div>
  );
});

ConversationContextBanner.displayName = 'ConversationContextBanner';

/**
 * Inline context flow indicator - shows the processing pipeline
 */
export const ContextFlowIndicator: React.FC<{
  steps: Array<{
    name: string;
    active: boolean;
    icon: React.ReactNode;
  }>;
}> = memo(({ steps }) => {
  const activeSteps = steps.filter(s => s.active);
  
  if (activeSteps.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 text-[10px] text-gray-400 mb-2">
      <MessageSquare size={10} />
      {activeSteps.map((step, idx) => (
        <React.Fragment key={step.name}>
          {idx > 0 && <ChevronRight size={10} className="text-gray-600" />}
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#1a1d2e] border border-[#2a2f46]">
            {step.icon}
            <span>{step.name}</span>
          </span>
        </React.Fragment>
      ))}
    </div>
  );
});

ContextFlowIndicator.displayName = 'ContextFlowIndicator';

export default ChatContextIndicator;

