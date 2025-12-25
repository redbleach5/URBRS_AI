import React, { useState, useEffect } from 'react';
import { MessageSquare, ChevronLeft, Trash2, Pencil, type LucideIcon } from 'lucide-react';
import { LearningProgress } from './LearningProgress';
import { ChatMode } from '../state/chatStore';

// ============ Types ============

export interface Conversation {
  id: string;
  title: string;
  mode: ChatMode;
  messages: any[];
  createdAt: number;
  updatedAt: number;
}

export interface ModeInfo {
  name: string;
  description: string;
  icon: LucideIcon;
  placeholder: string;
  examples: string[];
}

// ============ Sidebar Hook ============

export interface UseSidebarReturn {
  isOpen: boolean;
  width: number;
  isResizing: boolean;
  toggle: () => void;
  close: () => void;
  open: () => void;
  handleMouseDown: (e: React.MouseEvent) => void;
}

export function useSidebar(): UseSidebarReturn {
  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem('sidebarOpen');
    return saved !== null ? saved === 'true' : true;
  });
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem('sidebarWidth');
    return saved ? parseInt(saved, 10) : 256; // Default w-64 = 256px
  });
  const [isResizing, setIsResizing] = useState(false);

  // Save UI state to localStorage
  useEffect(() => {
    localStorage.setItem('sidebarOpen', isOpen.toString());
  }, [isOpen]);

  // Sidebar resize handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = e.clientX;
      // Clamp between 180px and 400px
      const clampedWidth = Math.min(400, Math.max(180, newWidth));
      setWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      // Save to localStorage
      localStorage.setItem('sidebarWidth', width.toString());
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, width]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  return {
    isOpen,
    width,
    isResizing,
    toggle: () => setIsOpen(!isOpen),
    close: () => setIsOpen(false),
    open: () => setIsOpen(true),
    handleMouseDown,
  };
}

// ============ Conversation Item Component ============

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  modeInfo: Record<ChatMode, ModeInfo>;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
}

const ConversationItem: React.FC<ConversationItemProps> = ({
  conversation,
  isSelected,
  modeInfo,
  onSelect,
  onRename,
  onDelete,
}) => {
  const ModeIcon = modeInfo[conversation.mode]?.icon || MessageSquare;
  
  return (
    <div
      className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all duration-200 group ${
        isSelected
          ? 'border-blue-500/60 bg-gradient-to-br from-[#1a1e30] to-[#1f2236] shadow-md shadow-blue-500/10 ring-1 ring-blue-500/20'
          : 'border-[#1f2236] bg-[#0f111b] hover:border-[#2a2f46] hover:bg-[#131524]'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between gap-1.5 mb-1">
        <div className="font-semibold truncate flex-1 text-gray-100 text-xs">{conversation.title}</div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRename();
            }}
            className="text-[10px] text-gray-400 hover:text-blue-400 p-1 rounded hover:bg-[#1f2236] transition-colors"
            title="Переименовать"
          >
            <Pencil size={10} strokeWidth={1.5} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-[10px] text-gray-400 hover:text-red-400 p-1 rounded hover:bg-[#1f2236] transition-colors"
            title="Удалить"
          >
            <Trash2 size={10} strokeWidth={1.5} />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1.5 mb-1">
        {conversation.mode && modeInfo[conversation.mode] && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#1f2236]/80 border border-[#2a2f46] text-gray-300 font-medium flex items-center gap-1">
            <ModeIcon size={10} strokeWidth={1.5} /> {modeInfo[conversation.mode].name}
          </span>
        )}
      </div>
      <div className="text-[10px] text-gray-500 mb-1">
        {new Date(conversation.updatedAt).toLocaleString('ru-RU', { 
          day: '2-digit', 
          month: '2-digit', 
          hour: '2-digit', 
          minute: '2-digit' 
        })}
      </div>
      <div className="text-[11px] text-gray-400 overflow-hidden text-ellipsis line-clamp-2 leading-snug">
        {conversation.messages[conversation.messages.length - 1]?.content || 'Пустой чат'}
      </div>
    </div>
  );
};

// ============ Main Sidebar Component ============

interface ConversationSidebarProps {
  conversations: Record<string, Conversation>;
  currentConversationId: string | undefined;
  modeInfo: Record<ChatMode, ModeInfo>;
  sidebar: UseSidebarReturn;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onRenameConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onClearHistory: () => void;
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  conversations,
  currentConversationId,
  modeInfo,
  sidebar,
  onSelectConversation,
  onNewChat,
  onRenameConversation,
  onDeleteConversation,
  onClearHistory,
}) => {
  const sortedConversations = Object.values(conversations)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <>
      {/* Sidebar */}
      <div
        className={`${
          sidebar.isOpen ? '' : 'w-0'
        } bg-[#131524] border-r border-[#1f2236] transition-all duration-300 overflow-hidden flex flex-col shadow-xl relative`}
        style={{ width: sidebar.isOpen ? sidebar.width : 0 }}
      >
        <div className="p-3 border-b border-[#1f2236] bg-gradient-to-r from-[#131524] to-[#1a1d2e]">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-bold text-gray-100 flex items-center gap-1.5">
              <MessageSquare size={16} strokeWidth={1.5} className="text-blue-400" />
              <span>Чаты</span>
            </h2>
            <button
              onClick={onNewChat}
              className="text-xs px-2 py-1 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium shadow-md transition-all duration-200 flex items-center gap-1"
            >
              <span>+</span>
              <span className="hidden sm:inline">Новый</span>
            </button>
          </div>
          <div className="flex items-center justify-between text-xs">
            <button 
              onClick={sidebar.close} 
              className="text-gray-400 hover:text-white transition-colors flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#1f2236] text-[10px]"
            >
              <ChevronLeft size={10} strokeWidth={2} />
              <span>Скрыть</span>
            </button>
            <button 
              onClick={onClearHistory} 
              className="text-gray-400 hover:text-red-400 transition-colors flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#1f2236] text-[10px]"
            >
              <Trash2 size={10} strokeWidth={1.5} />
              <span>Очистить</span>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {sortedConversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isSelected={conv.id === currentConversationId}
              modeInfo={modeInfo}
              onSelect={() => onSelectConversation(conv.id)}
              onRename={() => onRenameConversation(conv.id)}
              onDelete={() => onDeleteConversation(conv.id)}
            />
          ))}
        </div>
        
        {/* Learning Progress */}
        <div className="p-2 border-t border-[#1f2236]">
          <LearningProgress />
        </div>
      </div>

      {/* Sidebar Resize Handle */}
      {sidebar.isOpen && (
        <div
          className={`w-1 hover:w-1.5 bg-transparent hover:bg-blue-500/50 cursor-col-resize transition-all duration-150 flex-shrink-0 ${sidebar.isResizing ? 'bg-blue-500/70 w-1.5' : ''}`}
          onMouseDown={sidebar.handleMouseDown}
          title="Изменить ширину панели"
        />
      )}
    </>
  );
};

export default ConversationSidebar;

