import React, { useState, useCallback, useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { executeTask, executeTool, getAvailableModels, selectModel, indexProject, writeFile, deleteFile, renameFile, ModelInfo } from '../api/client';
import {
  Folder, FolderOpen, File, FileCode, FileJson, FileText, FileCog,
  Code, Code2, Terminal, Database, Globe, Lock,
  Brain, Target, Files, Search, Cpu, Sparkles,
  CircleCheck, CircleX, Clock, Loader2, BarChart3,
  GitCommit, Play, Plus, X, ChevronLeft, ChevronRight, ChevronDown,
  History, Package, Layers, AlertCircle, ChevronUp,
  Save, Trash2, Edit3, Copy, MoreVertical, Command,
  GitBranch, Keyboard, Eye, CornerDownLeft, Hash,
  type LucideIcon
} from 'lucide-react';

const API_BASE_URL = 'http://localhost:8000';

// Saved recent projects in localStorage
const RECENT_PROJECTS_KEY = 'aillm_recent_projects';
const MAX_RECENT_PROJECTS = 5;

const getRecentProjects = (): string[] => {
  try {
    const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveRecentProject = (path: string) => {
  try {
    const recent = getRecentProjects().filter(p => p !== path);
    recent.unshift(path);
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT_PROJECTS)));
  } catch {
    // Ignore storage errors
  }
};

// Types
interface FileInfo {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number;
  extension?: string;
  children?: FileInfo[];
}

interface OpenFile {
  path: string;
  name: string;
  content: string;
  language: string;
  isDirty: boolean;
  isNew?: boolean; // Новый файл (не из проекта)
}

interface ProjectStats {
  files: number;
  dirs: number;
  code_files: number;
}

// File icon mapping
const FILE_ICONS: Record<string, LucideIcon> = {
  '.py': Code,
  '.js': FileCode,
  '.jsx': FileCode,
  '.ts': Code2,
  '.tsx': Code2,
  '.html': Globe,
  '.css': Layers,
  '.json': FileJson,
  '.md': FileText,
  '.yaml': FileCog,
  '.yml': FileCog,
  '.sql': Database,
  '.sh': Terminal,
  '.env': Lock,
};

const getFileIcon = (file: FileInfo, isExpanded?: boolean): LucideIcon => {
  if (file.is_dir) {
    return isExpanded ? FolderOpen : Folder;
  }
  const ext = file.extension?.toLowerCase();
  return FILE_ICONS[ext || ''] || File;
};

// File Tree Component
function FileTree({ 
  node, depth = 0, onFileClick, expandedPaths, toggleExpand, onContextMenu, activeFile 
}: { 
  node: FileInfo; depth?: number; 
  onFileClick: (file: FileInfo) => void;
  expandedPaths: Set<string>;
  toggleExpand: (path: string) => void;
  onContextMenu?: (e: React.MouseEvent, file: FileInfo) => void;
  activeFile?: string | null;
}) {
  const isExpanded = expandedPaths.has(node.path);
  const isActive = activeFile === node.path;
  const IconComponent = getFileIcon(node, isExpanded);

  return (
    <div style={{ marginLeft: depth * 12 }}>
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-colors text-sm group ${
          isActive ? 'bg-blue-900/50 text-white' :
          node.is_dir ? 'hover:bg-[#1f2236] text-gray-300' : 'hover:bg-blue-900/30 text-gray-400 hover:text-white'
        }`}
        onClick={() => node.is_dir ? toggleExpand(node.path) : onFileClick(node)}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu?.(e, node);
        }}
      >
        <IconComponent size={14} strokeWidth={1.5} className="shrink-0 opacity-70" />
        <span className="truncate flex-1">{node.name}</span>
        {!node.is_dir && node.size && node.size > 0 && (
          <span className="text-[10px] text-gray-500 group-hover:hidden">
            {node.size < 1024 ? `${node.size}B` : `${(node.size / 1024).toFixed(1)}KB`}
          </span>
        )}
      </div>
      {node.is_dir && isExpanded && node.children && (
        <div>
          {node.children.map((child, idx) => (
            <FileTree key={`${child.path}-${idx}`} node={child} depth={depth + 1}
              onFileClick={onFileClick} expandedPaths={expandedPaths} toggleExpand={toggleExpand}
              onContextMenu={onContextMenu} activeFile={activeFile} />
          ))}
        </div>
      )}
    </div>
  );
}

// Main IDE Component
export function IDE() {
  // Project state
  const [projectPath, setProjectPath] = useState('');
  const [projectTree, setProjectTree] = useState<FileInfo | null>(null);
  const [projectStats, setProjectStats] = useState<ProjectStats | null>(null);
  const [projectName, setProjectName] = useState('');
  const [projectLoading, setProjectLoading] = useState(false);
  
  // File state
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['.']));
  
  // Code generation state
  const [task, setTask] = useState('');
  const [generating, setGenerating] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [htmlPreviewUrl, setHtmlPreviewUrl] = useState<string | null>(null);
  const [detectedStack, setDetectedStack] = useState<string | null>(null);
  
  // Model selection state
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [autoSelectModel, setAutoSelectModel] = useState(true);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [resourceLevel, setResourceLevel] = useState<string>('unknown');
  
  // AI Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [analysisType, setAnalysisType] = useState('comprehensive');
  const [customQuestion, setCustomQuestion] = useState('');
  const [showAnalysisMenu, setShowAnalysisMenu] = useState(false);
  
  // Progress state
  const [progressStage, setProgressStage] = useState<string>('');
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressDetails, setProgressDetails] = useState<any>(null);
  
  // UI state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<string[]>([]);
  
  // Indexing state
  const [indexing, setIndexing] = useState(false);
  const [indexStatus, setIndexStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [showRecentProjects, setShowRecentProjects] = useState(false);
  
  // Smart suggestion state
  const [showAnalysisSuggestion, setShowAnalysisSuggestion] = useState(false);
  const [autoIndexingDone, setAutoIndexingDone] = useState(false);
  
  // Browser state
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserPath, setBrowserPath] = useState('~');
  const [browserDirs, setBrowserDirs] = useState<Array<{name: string; path: string; has_code: boolean}>>([]);
  const [browserLoading, setBrowserLoading] = useState(false);
  
  // Command Palette state
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandSearch, setCommandSearch] = useState('');
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileInfo } | null>(null);
  
  // Editor state
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ success: boolean; message: string } | null>(null);
  
  // Keyboard shortcuts toast
  const [showShortcutsHint, setShowShortcutsHint] = useState(false);
  
  const editorRef = useRef<any>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);

  // Load recent projects on mount
  useEffect(() => {
    setRecentProjects(getRecentProjects());
  }, []);

  // Save file function
  const handleSaveFile = useCallback(async (path?: string) => {
    const targetPath = path || activeFile;
    if (!targetPath) return;
    
    const file = openFiles.find(f => f.path === targetPath);
    if (!file) return;
    
    // Новые файлы (сгенерированные) пока не сохраняем на диск
    if (file.isNew || targetPath.startsWith('__new__/')) {
      setSaveStatus({ success: false, message: 'Сначала сохраните файл в проект' });
      setTimeout(() => setSaveStatus(null), 2000);
      return;
    }
    
    setSaving(true);
    setSaveStatus(null);
    
    try {
      const fullPath = projectPath.endsWith('/') 
        ? `${projectPath}${targetPath}` 
        : `${projectPath}/${targetPath}`;
      
      await writeFile({ file_path: fullPath, content: file.content });
      
      // Сбрасываем isDirty
      setOpenFiles(prev => prev.map(f => 
        f.path === targetPath ? { ...f, isDirty: false } : f
      ));
      
      setSaveStatus({ success: true, message: '✓ Сохранено' });
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      setSaveStatus({ 
        success: false, 
        message: err instanceof Error ? err.message : 'Ошибка сохранения' 
      });
      setTimeout(() => setSaveStatus(null), 3000);
    } finally {
      setSaving(false);
    }
  }, [activeFile, openFiles, projectPath]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      
      // Ctrl/Cmd + S - Save file
      if (modKey && e.key === 's') {
        e.preventDefault();
        handleSaveFile();
        return;
      }
      
      // Ctrl/Cmd + P - Command Palette
      if (modKey && e.key === 'p') {
        e.preventDefault();
        setShowCommandPalette(true);
        setTimeout(() => commandInputRef.current?.focus(), 100);
        return;
      }
      
      // Ctrl/Cmd + W - Close current tab
      if (modKey && e.key === 'w') {
        e.preventDefault();
        if (activeFile) {
          setOpenFiles(prev => prev.filter(f => f.path !== activeFile));
          const remaining = openFiles.filter(f => f.path !== activeFile);
          setActiveFile(remaining.length > 0 ? remaining[remaining.length - 1].path : null);
        }
        return;
      }
      
      // Escape - Close modals
      if (e.key === 'Escape') {
        setShowCommandPalette(false);
        setContextMenu(null);
        return;
      }
      
      // Ctrl/Cmd + Shift + S - Save all dirty files
      if (modKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        openFiles.filter(f => f.isDirty && !f.isNew).forEach(f => handleSaveFile(f.path));
        return;
      }
      
      // Ctrl/Cmd + K - Show shortcuts hint
      if (modKey && e.key === 'k') {
        e.preventDefault();
        setShowShortcutsHint(prev => !prev);
        return;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSaveFile, activeFile, openFiles]);

  // Focus command palette input when opened
  useEffect(() => {
    if (showCommandPalette && commandInputRef.current) {
      commandInputRef.current.focus();
    }
  }, [showCommandPalette]);

  // Get all files from tree (for Command Palette)
  const getAllFiles = useCallback((node: FileInfo | null): FileInfo[] => {
    if (!node) return [];
    if (!node.is_dir) return [node];
    
    const files: FileInfo[] = [];
    if (node.children) {
      for (const child of node.children) {
        files.push(...getAllFiles(child));
      }
    }
    return files;
  }, []);

  // Filter files for Command Palette
  const filteredFiles = useCallback(() => {
    const allFiles = getAllFiles(projectTree);
    if (!commandSearch.trim()) return allFiles.slice(0, 20);
    
    const search = commandSearch.toLowerCase();
    return allFiles
      .filter(f => f.name.toLowerCase().includes(search) || f.path.toLowerCase().includes(search))
      .slice(0, 20);
  }, [projectTree, commandSearch, getAllFiles]);

  // Open project (MUST be defined before handlers that use it)
  const handleOpenProject = useCallback(async (pathOverride?: string) => {
    const path = pathOverride || projectPath;
    if (!path.trim()) return;
    
    setProjectLoading(true);
    setError(null);
    setShowRecentProjects(false);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/project/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_path: path, max_depth: 5 })
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to open project');
      }
      
      const data = await response.json();
      setProjectTree(data.tree);
      setProjectStats(data.stats);
      setProjectName(data.project_name);
      setExpandedPaths(new Set(['.']));
      setProjectPath(path);
      
      // Save to recent projects
      saveRecentProject(path);
      setRecentProjects(getRecentProjects());
      
      // Auto-index project in background
      setAutoIndexingDone(false);
      setIndexing(true);
      setIndexStatus({ success: true, message: 'Индексируем проект...' });
      
      try {
        const indexResult = await indexProject({ project_path: path });
        setIndexStatus({
          success: true,
          message: `✓ ${indexResult.files_indexed} файлов проиндексировано`
        });
        setAutoIndexingDone(true);
        // Show analysis suggestion after successful indexing
        setShowAnalysisSuggestion(true);
      } catch (indexErr) {
        setIndexStatus({
          success: false,
          message: 'Индексация не удалась'
        });
      } finally {
        setIndexing(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setProjectLoading(false);
    }
  }, [projectPath]);

  // Handle file deletion
  const handleDeleteFile = useCallback(async (file: FileInfo) => {
    if (!file || file.is_dir) return;
    
    const fullPath = projectPath.endsWith('/') 
      ? `${projectPath}${file.path}` 
      : `${projectPath}/${file.path}`;
    
    try {
      await deleteFile(fullPath);
      
      // Close if open
      setOpenFiles(prev => prev.filter(f => f.path !== file.path));
      if (activeFile === file.path) {
        const remaining = openFiles.filter(f => f.path !== file.path);
        setActiveFile(remaining.length > 0 ? remaining[remaining.length - 1].path : null);
      }
      
      // Refresh project tree
      handleOpenProject();
      
      setContextMenu(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
    }
  }, [projectPath, activeFile, openFiles, handleOpenProject]);

  // Copy file path to clipboard
  const handleCopyPath = useCallback((file: FileInfo) => {
    const fullPath = projectPath.endsWith('/') 
      ? `${projectPath}${file.path}` 
      : `${projectPath}/${file.path}`;
    
    navigator.clipboard.writeText(fullPath);
    setContextMenu(null);
  }, [projectPath]);

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

  // Handle model selection
  const handleModelSelect = useCallback(async (modelName: string | null) => {
    if (modelName === null) {
      // Enable auto-select
      setAutoSelectModel(true);
      setSelectedModel(null);
      setShowModelSelector(false);
      return;
    }
    
    const result = await selectModel({ model: modelName, auto_select: false });
    if (result.success) {
      setSelectedModel(result.selected_model);
      setAutoSelectModel(false);
    }
    setShowModelSelector(false);
  }, []);

  // Browse directory via backend API
  const browseDirViaAPI = useCallback(async (path: string) => {
    setBrowserLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/project/browse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to browse directory');
      }
      
      const data = await response.json();
      setBrowserPath(data.current_path);
      setBrowserDirs(data.directories || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при просмотре директории');
    } finally {
      setBrowserLoading(false);
    }
  }, []);

  // Open folder browser
  const handleOpenBrowser = useCallback(() => {
    setShowBrowser(true);
    setShowRecentProjects(false);
    browseDirViaAPI('~');
  }, [browseDirViaAPI]);

  // Navigate to parent directory
  const handleBrowserGoUp = useCallback(() => {
    const parent = browserPath.split('/').slice(0, -1).join('/') || '/';
    browseDirViaAPI(parent);
  }, [browserPath, browseDirViaAPI]);

  // Select directory from browser
  const handleBrowserSelect = useCallback((dir: {name: string; path: string; has_code: boolean}) => {
    if (dir.has_code) {
      // This looks like a project - open it
      setShowBrowser(false);
      handleOpenProject(dir.path);
    } else {
      // Navigate into directory
      browseDirViaAPI(dir.path);
    }
  }, [browseDirViaAPI, handleOpenProject]);

  // Read file from project
  const handleFileClick = useCallback(async (file: FileInfo) => {
    const existing = openFiles.find(f => f.path === file.path);
    if (existing) {
      setActiveFile(file.path);
      return;
    }
    
    try {
      const fullPath = projectPath.endsWith('/') 
        ? `${projectPath}${file.path}` 
        : `${projectPath}/${file.path}`;
      
      const response = await fetch(`${API_BASE_URL}/api/v1/project/read-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: fullPath })
      });
      
      if (!response.ok) throw new Error('Failed to read file');
      const data = await response.json();
      
      if (data.is_binary) {
        setError(`Cannot open binary file: ${file.name}`);
        return;
      }
      
      const newFile: OpenFile = {
        path: file.path,
        name: file.name,
        content: data.content,
        language: data.language || 'plaintext',
        isDirty: false
      };
      
      setOpenFiles(prev => [...prev, newFile]);
      setActiveFile(file.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read file');
    }
  }, [projectPath, openFiles]);

  // Create new file (for code generation)
  const createNewFile = useCallback((name: string, content: string, lang: string) => {
    const path = `__new__/${name}`;
    const existing = openFiles.find(f => f.path === path);
    
    if (existing) {
      setOpenFiles(prev => prev.map(f => f.path === path ? { ...f, content, isDirty: true } : f));
    } else {
      const newFile: OpenFile = { path, name, content, language: lang, isDirty: true, isNew: true };
      setOpenFiles(prev => [...prev, newFile]);
    }
    setActiveFile(path);
  }, [openFiles]);

  // Close file
  const handleCloseFile = useCallback((path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenFiles(prev => prev.filter(f => f.path !== path));
    if (activeFile === path) {
      const remaining = openFiles.filter(f => f.path !== path);
      setActiveFile(remaining.length > 0 ? remaining[remaining.length - 1].path : null);
    }
  }, [activeFile, openFiles]);

  // Update file content
  const handleEditorChange = useCallback((value: string | undefined, path: string) => {
    setOpenFiles(prev => prev.map(f => 
      f.path === path ? { ...f, content: value || '', isDirty: true } : f
    ));
  }, []);

  // Toggle folder expand
  const toggleExpand = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }, []);

  // Автоопределение языка из кода
  const detectLanguageFromCode = useCallback((code: string, taskText: string): { language: string; extension: string; displayName: string } => {
    const codeLower = code.toLowerCase();
    const taskLower = taskText.toLowerCase();
    
    // Приоритет 1: Явные признаки в задаче
    const taskPatterns: Record<string, { language: string; extension: string; displayName: string }> = {
      'python': { language: 'python', extension: 'py', displayName: 'Python' },
      'питон': { language: 'python', extension: 'py', displayName: 'Python' },
      'javascript': { language: 'javascript', extension: 'js', displayName: 'JavaScript' },
      'typescript': { language: 'typescript', extension: 'ts', displayName: 'TypeScript' },
      'html': { language: 'html', extension: 'html', displayName: 'HTML' },
      'react': { language: 'typescriptreact', extension: 'tsx', displayName: 'React TSX' },
      'vue': { language: 'vue', extension: 'vue', displayName: 'Vue' },
      'go': { language: 'go', extension: 'go', displayName: 'Go' },
      'golang': { language: 'go', extension: 'go', displayName: 'Go' },
      'rust': { language: 'rust', extension: 'rs', displayName: 'Rust' },
      'java': { language: 'java', extension: 'java', displayName: 'Java' },
      'kotlin': { language: 'kotlin', extension: 'kt', displayName: 'Kotlin' },
      'swift': { language: 'swift', extension: 'swift', displayName: 'Swift' },
      'c++': { language: 'cpp', extension: 'cpp', displayName: 'C++' },
      'cpp': { language: 'cpp', extension: 'cpp', displayName: 'C++' },
      'c#': { language: 'csharp', extension: 'cs', displayName: 'C#' },
      'csharp': { language: 'csharp', extension: 'cs', displayName: 'C#' },
      'php': { language: 'php', extension: 'php', displayName: 'PHP' },
      'ruby': { language: 'ruby', extension: 'rb', displayName: 'Ruby' },
      'bash': { language: 'shell', extension: 'sh', displayName: 'Bash' },
      'shell': { language: 'shell', extension: 'sh', displayName: 'Shell' },
      'sql': { language: 'sql', extension: 'sql', displayName: 'SQL' },
    };
    
    for (const [pattern, info] of Object.entries(taskPatterns)) {
      if (taskLower.includes(pattern)) {
        return info;
      }
    }
    
    // Приоритет 2: Анализ кода
    // HTML
    if (code.includes('<!DOCTYPE') || code.includes('<html') || 
        (code.includes('<body') && code.includes('</body>')) ||
        (code.includes('<div') && code.includes('</div>'))) {
      return { language: 'html', extension: 'html', displayName: 'HTML' };
    }
    
    // React/TSX
    if ((code.includes('import React') || code.includes('from "react"') || code.includes("from 'react'")) &&
        (code.includes('tsx') || code.includes('<') && code.includes('/>'))) {
      return { language: 'typescriptreact', extension: 'tsx', displayName: 'React TSX' };
    }
    
    // TypeScript
    if (code.includes(': string') || code.includes(': number') || code.includes(': boolean') ||
        code.includes('interface ') || code.includes(': void') || code.includes('<T>')) {
      return { language: 'typescript', extension: 'ts', displayName: 'TypeScript' };
    }
    
    // Python
    if (code.includes('def ') || code.includes('import ') || code.includes('class ') ||
        code.includes('print(') || code.includes('if __name__') || code.includes('async def')) {
      return { language: 'python', extension: 'py', displayName: 'Python' };
    }
    
    // JavaScript
    if (code.includes('function ') || code.includes('const ') || code.includes('let ') ||
        code.includes('console.') || code.includes('require(') || code.includes('module.exports')) {
      return { language: 'javascript', extension: 'js', displayName: 'JavaScript' };
    }
    
    // Go
    if (code.includes('package main') || code.includes('func ') || code.includes('import "')) {
      return { language: 'go', extension: 'go', displayName: 'Go' };
    }
    
    // Rust
    if (code.includes('fn main') || code.includes('fn ') || code.includes('let mut ') || code.includes('impl ')) {
      return { language: 'rust', extension: 'rs', displayName: 'Rust' };
    }
    
    // Java
    if (code.includes('public class') || code.includes('public static void main')) {
      return { language: 'java', extension: 'java', displayName: 'Java' };
    }
    
    // C++
    if (code.includes('#include <') || code.includes('std::') || code.includes('int main(')) {
      return { language: 'cpp', extension: 'cpp', displayName: 'C++' };
    }
    
    // C#
    if (code.includes('namespace ') || code.includes('using System') || code.includes('public class')) {
      return { language: 'csharp', extension: 'cs', displayName: 'C#' };
    }
    
    // PHP
    if (code.includes('<?php') || code.includes('<?=')) {
      return { language: 'php', extension: 'php', displayName: 'PHP' };
    }
    
    // Ruby
    if (code.includes('def ') && code.includes('end') && !code.includes('python')) {
      return { language: 'ruby', extension: 'rb', displayName: 'Ruby' };
    }
    
    // Bash/Shell
    if (code.includes('#!/bin/bash') || code.includes('#!/bin/sh') || 
        (code.includes('echo ') && code.includes('fi'))) {
      return { language: 'shell', extension: 'sh', displayName: 'Bash' };
    }
    
    // SQL
    if (codeLower.includes('select ') && codeLower.includes('from ')) {
      return { language: 'sql', extension: 'sql', displayName: 'SQL' };
    }
    
    // Дефолт: Python (самый универсальный)
    return { language: 'python', extension: 'py', displayName: 'Python' };
  }, []);

  // Определяет нужен ли специальный анализ проекта (SmartProjectAnalyzer)
  const isProjectAnalysisRequest = useCallback((taskText: string): boolean => {
    const lower = taskText.toLowerCase();
    
    // Паттерны для анализа проекта (запускают SmartProjectAnalyzer)
    const analysisPatterns = [
      'проанализируй проект', 'анализ проекта', 'проанализировать проект',
      'изучи проект', 'посмотри проект', 'расскажи о проекте',
      'что делает проект', 'как устроен проект', 'структура проекта',
      'analyze project', 'project analysis', 'review project',
      'ревью проекта', 'обзор проекта'
    ];
    
    return analysisPatterns.some(pattern => lower.includes(pattern));
  }, []);

  // Generate code or execute task
  const handleGenerate = useCallback(async () => {
    if (!task.trim()) return;
    
    // Если это запрос на анализ проекта и проект открыт - запускаем SmartProjectAnalyzer
    if (isProjectAnalysisRequest(task) && projectPath) {
      setCustomQuestion(task);
      setAnalysisType('comprehensive');
      // Запускаем анализ через небольшую задержку (т.к. handleAnalyze определён ниже)
      setTimeout(() => {
        const analyzeBtn = document.querySelector('[data-analyze-trigger]') as HTMLButtonElement;
        if (analyzeBtn) analyzeBtn.click();
      }, 100);
      return;
    }
    
    setGenerating(true);
    setError(null);
    setDetectedStack(null);
    
    try {
      const activeContent = openFiles.find(f => f.path === activeFile)?.content;
      
      // НЕ указываем agent_type - пусть бэкенд сам выберет через LLMClassifier!
      // Это позволяет использовать быстрые модели для понимания намерения пользователя
      // Бэкенд использует: LLMClassifier -> кэш -> fallback на паттерны
      
      const response = await executeTask({
        task,
        // agent_type НЕ передаём - оркестратор выберет через LLM
        context: { 
          existing_code: activeContent || '',
          project_path: projectPath || undefined,
          has_project: !!projectTree
        },
        model: autoSelectModel ? undefined : selectedModel || undefined,
        provider: autoSelectModel ? undefined : 'ollama'
      });
      
      if (response.success && response.result?.code) {
        const code = response.result.code;
        
        // Автоопределение языка из сгенерированного кода
        const detected = detectLanguageFromCode(code, task);
        setDetectedStack(detected.displayName);
        
        // Генерируем имя файла на основе задачи
        const taskWords = task.toLowerCase().replace(/[^a-zа-яё0-9\s]/gi, '').split(/\s+/).slice(0, 3);
        const baseName = taskWords.length > 0 ? taskWords.join('_').substring(0, 30) : 'generated';
        const fileName = `${baseName}.${detected.extension}`;
        
        createNewFile(fileName, code, detected.language);
        setBottomPanelOpen(true);
        setRunResult(`✅ Код успешно сгенерирован!\n📦 Определён стек: ${detected.displayName}`);
      } else {
        setError('Не удалось сгенерировать код');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }, [task, activeFile, openFiles, createNewFile, detectLanguageFromCode, isProjectAnalysisRequest, projectPath, projectTree, autoSelectModel, selectedModel]);

  // Run code
  const handleRun = useCallback(async () => {
    const activeContent = openFiles.find(f => f.path === activeFile)?.content;
    if (!activeContent) {
      setError('Нет кода для выполнения');
      return;
    }
    
    setRunning(true);
    setRunResult(null);
    setBottomPanelOpen(true);
    
    try {
      const activeLang = openFiles.find(f => f.path === activeFile)?.language || 'python';
      
      // HTML preview
      if (activeLang === 'html' || activeContent.includes('<!DOCTYPE') || activeContent.includes('<html')) {
        if (htmlPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(htmlPreviewUrl);
        const blob = new Blob([activeContent], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        setHtmlPreviewUrl(url);
        setRunResult('✅ HTML открыт в предпросмотре');
        setRunning(false);
        return;
      }
      
      // Execute code
      const langCmd: Record<string, string> = {
        'python': `python3 - <<'PY'\n${activeContent}\nPY`,
        'javascript': `node - <<'JS'\n${activeContent}\nJS`,
        'typescript': `npx ts-node - <<'TS'\n${activeContent}\nTS`,
      };
      
      const command = langCmd[activeLang] || langCmd['python'];
      
      const response = await executeTool({
        tool_name: 'execute_command',
        input: { command }
      });
      
      const stdout = response?.result?.stdout || '';
      const stderr = response?.result?.stderr || '';
      setRunResult([stdout && `stdout:\n${stdout}`, stderr && `stderr:\n${stderr}`].filter(Boolean).join('\n\n') || 'Нет вывода');
    } catch (err) {
      setRunResult(`Ошибка: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setRunning(false);
    }
  }, [activeFile, openFiles, htmlPreviewUrl]);

  // Analyze project with SSE progress streaming
  const handleAnalyze = useCallback(async () => {
    if (!projectPath) {
      setError('Сначала откройте проект');
      return;
    }
    
    // Reset state
    setAnalyzing(true);
    setAnalysisResult(null);
    setError(null);
    setProgressStage('starting');
    setProgressMessage('Начинаем анализ...');
    setProgressPercent(0);
    setProgressDetails(null);
    setBottomPanelOpen(true);
    
    try {
      // Use SSE endpoint for streaming progress
      const response = await fetch(`${API_BASE_URL}/api/v1/project/analyze-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_path: projectPath,
          analysis_type: analysisType,
          specific_question: customQuestion || null
        })
      });
      
      if (!response.ok) {
        throw new Error(`Ошибка: ${response.status}`);
      }
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        throw new Error('Stream not available');
      }
      
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        // Parse SSE events
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              
              // Update progress state
              setProgressStage(event.stage);
              setProgressMessage(event.message);
              setProgressPercent(Math.max(0, event.progress) * 100);
              setProgressDetails(event.details);
              
              // Handle completion
              if (event.stage === 'completed' && event.details?.result) {
                setAnalysisResult(event.details.result);
              } else if (event.stage === 'error') {
                setError(event.message);
                setAnalysisResult({ error: event.message });
              }
            } catch (e) {
              console.debug('Parse error:', e);
            }
          }
        }
      }
      
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка анализа';
      setError(message);
      setProgressStage('error');
      setProgressMessage(message);
      setAnalysisResult({ error: message });
    } finally {
      setAnalyzing(false);
    }
  }, [projectPath, analysisType, customQuestion]);

  // Index project for RAG
  const handleIndexProject = useCallback(async () => {
    if (!projectPath || indexing) return;
    
    setIndexing(true);
    setIndexStatus(null);
    
    try {
      const result = await indexProject({ project_path: projectPath });
      setIndexStatus({
        success: true,
        message: `✓ ${result.files_indexed} файлов, ${result.chunks_created} фрагментов`
      });
    } catch (err) {
      setIndexStatus({
        success: false,
        message: err instanceof Error ? err.message : 'Ошибка индексации'
      });
    } finally {
      setIndexing(false);
    }
  }, [projectPath, indexing]);

  const activeFileContent = openFiles.find(f => f.path === activeFile);

  return (
    <div className="flex h-full bg-[#0f111b] text-white overflow-hidden">
      {/* Sidebar */}
      <div className={`${sidebarCollapsed ? 'w-0' : 'w-64'} bg-[#131524] border-r border-[#1f2236] transition-all duration-300 overflow-hidden flex flex-col`}>
        {/* Project Input */}
        <div className="p-3 border-b border-[#1f2236]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <FolderOpen size={18} strokeWidth={1.5} className="text-blue-400" />
              <span className="text-sm font-semibold text-gray-200">
                {projectName || 'Проект'}
              </span>
            </div>
            {recentProjects.length > 0 && (
              <button
                onClick={() => setShowRecentProjects(!showRecentProjects)}
                className="text-[10px] text-gray-400 hover:text-white transition-colors flex items-center gap-1"
                title="Недавние проекты"
              >
                <History size={10} strokeWidth={1.5} /> Недавние
              </button>
            )}
          </div>
          
          {/* Recent Projects Dropdown */}
          {showRecentProjects && recentProjects.length > 0 && (
            <div className="mb-2 bg-[#0a0c14] border border-[#1f2236] rounded-lg overflow-hidden">
              <div className="px-2 py-1 text-[10px] text-gray-500 border-b border-[#1f2236]">
                Недавние проекты
              </div>
              {recentProjects.map((path, idx) => (
                <button
                  key={idx}
                  onClick={() => handleOpenProject(path)}
                  className="w-full px-2 py-1.5 text-xs text-left text-gray-300 hover:bg-[#1f2236] hover:text-white transition-colors truncate flex items-center gap-2"
                  title={path}
                >
                  <Folder size={12} strokeWidth={1.5} />
                  <span className="truncate">{path.split('/').pop() || path}</span>
                </button>
              ))}
            </div>
          )}
          
          {/* Path Input */}
          <div className="relative">
            <div className="flex gap-1">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={projectPath}
                  onChange={(e) => setProjectPath(e.target.value)}
                  placeholder="Путь к проекту..."
                  className="w-full px-2 py-1.5 pr-8 text-xs bg-[#0f111b] border border-[#1f2236] rounded focus:outline-none focus:border-blue-500 text-white placeholder-gray-500"
                  onKeyPress={(e) => e.key === 'Enter' && handleOpenProject()}
                  onFocus={() => recentProjects.length > 0 && !projectPath && setShowRecentProjects(true)}
                />
                {projectPath && (
                  <button
                    onClick={() => setProjectPath('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs"
                  >
                    ×
                  </button>
                )}
              </div>
              <button
                onClick={handleOpenBrowser}
                className="px-2 py-1.5 bg-[#1f2236] hover:bg-[#2a2f46] rounded text-xs transition-colors"
                title="Обзор..."
              >
                <Folder size={14} strokeWidth={1.5} />
              </button>
              <button
                onClick={() => handleOpenProject()}
                disabled={projectLoading || !projectPath.trim()}
                className="px-2 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-xs transition-colors"
                title="Открыть проект"
              >
                {projectLoading ? (
                  <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
                ) : (
                  <ChevronRight size={14} strokeWidth={1.5} />
                )}
              </button>
            </div>
          </div>
          
          {/* Common paths hint */}
          {!projectPath && !showRecentProjects && (
            <div className="mt-2 space-y-1">
              <div className="text-[10px] text-gray-500">Быстрый доступ:</div>
              <div className="flex flex-wrap gap-1">
                {[
                  { label: '~', path: '~' },
                  { label: 'Documents', path: '~/Documents' },
                  { label: 'Projects', path: '~/Projects' },
                ].map(({ label, path }) => (
                  <button
                    key={path}
                    onClick={() => setProjectPath(path)}
                    className="px-1.5 py-0.5 text-[10px] bg-[#1f2236] hover:bg-[#2a2f46] rounded text-gray-400 hover:text-white transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Project Stats + Status */}
          {projectStats && (
            <div className="mt-2 space-y-2">
              <div className="text-[10px] text-gray-500 flex gap-3">
                <span className="flex items-center gap-1"><Folder size={10} strokeWidth={1.5} /> {projectStats.dirs}</span>
                <span className="flex items-center gap-1"><File size={10} strokeWidth={1.5} /> {projectStats.files}</span>
                <span className="flex items-center gap-1"><FileCode size={10} strokeWidth={1.5} /> {projectStats.code_files}</span>
              </div>
              
              {/* Auto-index status */}
              {indexStatus && (
                <div className={`px-2 py-1.5 text-[10px] rounded-lg flex items-center gap-2 ${
                  indexing 
                    ? 'bg-blue-900/30 text-blue-300 border border-blue-500/20'
                    : indexStatus.success 
                      ? 'bg-green-900/20 text-green-400 border border-green-500/20' 
                      : 'bg-red-900/20 text-red-400 border border-red-500/20'
                }`}>
                  {indexing ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : indexStatus.success ? (
                    <CircleCheck size={10} />
                  ) : (
                    <CircleX size={10} />
                  )}
                  <span className="flex-1">{indexStatus.message}</span>
                  {/* Re-index button (subtle) */}
                  {!indexing && autoIndexingDone && (
                    <button
                      onClick={handleIndexProject}
                      className="text-gray-500 hover:text-blue-400 transition-colors"
                      title="Переиндексировать"
                    >
                      <Database size={10} />
                    </button>
                  )}
                </div>
              )}
              
              {/* Analyzing status */}
              {analyzing && (
                <div className="px-2 py-1.5 text-[10px] rounded-lg flex items-center gap-2 bg-purple-900/30 text-purple-300 border border-purple-500/20">
                  <Loader2 size={10} className="animate-spin" />
                  <span>Анализируем проект...</span>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* File Tree */}
        <div className="flex-1 overflow-y-auto p-2">
          {projectTree ? (
            <FileTree 
              node={projectTree} 
              onFileClick={handleFileClick}
              expandedPaths={expandedPaths} 
              toggleExpand={toggleExpand}
              onContextMenu={(e, file) => setContextMenu({ x: e.clientX, y: e.clientY, file })}
              activeFile={activeFile}
            />
          ) : (
            <div className="text-center text-gray-500 text-xs py-8">
              <FolderOpen size={24} strokeWidth={1} className="mx-auto mb-2 opacity-50" />
              <p>Откройте проект</p>
              <p className="mt-1 text-[10px]">или создайте новый файл</p>
            </div>
          )}
        </div>
        
        {/* Quick Actions */}
        <div className="p-2 border-t border-[#1f2236] space-y-1">
          <button
            onClick={() => createNewFile('untitled.py', '# Новый файл\n', 'python')}
            className="w-full px-2 py-1.5 text-xs text-left hover:bg-[#1f2236] rounded flex items-center gap-2"
          >
            <Plus size={14} strokeWidth={1.5} />
            <span>Новый файл</span>
          </button>
          {!projectTree && (
            <div className="px-2 py-1.5 text-[10px] text-gray-500 italic">
              Откройте проект для анализа и индексации
            </div>
          )}
        </div>
      </div>
      
      {/* Collapse Toggle */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-4 h-12 bg-[#1f2236] hover:bg-[#2a2f46] rounded-r flex items-center justify-center transition-colors"
        style={{ left: sidebarCollapsed ? 0 : 'calc(16rem - 4px)' }}
      >
        {sidebarCollapsed ? 
          <ChevronRight size={10} strokeWidth={1.5} className="text-gray-400" /> : 
          <ChevronLeft size={10} strokeWidth={1.5} className="text-gray-400" />
        }
      </button>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-[#131524] border-b border-[#1f2236]">
          {/* Task Input */}
          <div className="flex-1 flex items-center gap-2 bg-[#0f111b] border border-[#1f2236] rounded-lg px-3 py-1.5 focus-within:border-blue-500/50 transition-colors">
            <Sparkles size={14} strokeWidth={1.5} className="text-purple-400 shrink-0" />
            <input
              type="text"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Создай код, проанализируй проект, объясни как работает..."
              className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
              onKeyPress={(e) => e.key === 'Enter' && handleGenerate()}
            />
            {/* Автоопределённый стек */}
            {detectedStack && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-green-900/30 border border-green-700/50 rounded text-xs text-green-300">
                <Cpu size={12} strokeWidth={1.5} />
                <span>{detectedStack}</span>
              </div>
            )}
            {generating && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-900/30 border border-blue-700/50 rounded text-xs text-blue-300">
                <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
                <span>Определяю стек...</span>
              </div>
            )}
          </div>
          
          {/* Model Selector */}
          <div className="relative">
            <button
              onClick={() => setShowModelSelector(!showModelSelector)}
              className="px-2 py-1.5 bg-[#0f111b] border border-[#1f2236] hover:border-purple-500/50 rounded-lg text-xs transition-colors flex items-center gap-1.5"
              title="Выбор модели"
            >
              <Cpu size={14} strokeWidth={1.5} className="text-purple-400" />
              <span className="text-gray-300 max-w-[100px] truncate">
                {loadingModels ? '...' : autoSelectModel ? 'Авто' : (selectedModel?.split(':')[0] || 'Авто')}
              </span>
              <ChevronUp size={12} className={`text-gray-500 transition-transform ${showModelSelector ? '' : 'rotate-180'}`} />
            </button>
            
            {showModelSelector && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-[#1a1d2e] border border-[#2a2f46] rounded-lg shadow-xl z-50 max-h-[400px] overflow-y-auto">
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
                  onClick={() => handleModelSelect(null)}
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
                    onClick={() => handleModelSelect(model.name)}
                    className={`w-full px-3 py-2 text-left text-xs hover:bg-[#252840] transition-colors flex items-center gap-2 ${
                      !autoSelectModel && selectedModel === model.name ? 'bg-blue-900/30 border-l-2 border-blue-500' : ''
                    }`}
                  >
                    <div className="w-6 h-6 rounded bg-[#0f111b] flex items-center justify-center shrink-0">
                      {model.provider === 'ollama' ? (
                        <Cpu size={12} className="text-blue-400" />
                      ) : model.provider === 'openai' ? (
                        <Brain size={12} className="text-green-400" />
                      ) : (
                        <Sparkles size={12} className="text-orange-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white truncate flex items-center gap-1">
                        {model.name}
                        {model.is_recommended && (
                          <span className="text-[9px] px-1 py-0.5 bg-yellow-900/50 text-yellow-400 rounded">★</span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-500 flex items-center gap-2">
                        {model.size && <span>{model.size}</span>}
                        <span className="text-green-400">Q:{Math.round(model.quality_score * 100)}%</span>
                        <span className="text-blue-400">S:{Math.round(model.speed_score * 100)}%</span>
                      </div>
                    </div>
                    {!autoSelectModel && selectedModel === model.name && (
                      <CircleCheck size={14} className="text-blue-400 shrink-0" />
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
          
          {/* Buttons */}
          <button
            onClick={handleGenerate}
            disabled={generating || !task.trim()}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
            title="Генерировать код или получить ответ (Enter)"
          >
            {generating ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" /> : <Sparkles size={14} strokeWidth={1.5} />}
            <span className="hidden sm:inline">Генерация</span>
          </button>
          <button
            onClick={handleRun}
            disabled={running || !activeFile}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
            title="Запустить текущий код"
          >
            {running ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" /> : <Play size={14} strokeWidth={1.5} />}
            <span className="hidden sm:inline">Запуск</span>
          </button>
          {/* Analysis Button with Dropdown */}
          <div className="relative">
            <div className="flex">
              <button
                data-analyze-trigger
                onClick={handleAnalyze}
                disabled={analyzing || !projectPath}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-l-lg text-xs font-medium transition-colors flex items-center gap-1.5"
                title="AI-анализ проекта"
              >
                {analyzing ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" /> : <Brain size={14} strokeWidth={1.5} />}
                <span className="hidden sm:inline">Анализ</span>
              </button>
              <button
                onClick={() => setShowAnalysisMenu(!showAnalysisMenu)}
                disabled={analyzing || !projectPath}
                className="px-1.5 py-1.5 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 rounded-r-lg text-xs transition-colors border-l border-purple-500"
                title="Выбор типа анализа"
              >
                <ChevronDown size={12} strokeWidth={1.5} />
              </button>
            </div>
            
            {/* Analysis Type Dropdown */}
            {showAnalysisMenu && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-[#1a1d2e] border border-[#2a2f46] rounded-lg shadow-xl z-50 overflow-hidden">
                <div className="px-3 py-2 border-b border-[#2a2f46] text-xs text-gray-400">
                  Тип анализа
                </div>
                {[
                  { id: 'comprehensive', name: 'Полный анализ', desc: 'Архитектура, качество, рекомендации' },
                  { id: 'overview', name: 'Обзор проекта', desc: 'Структура и технологии' },
                  { id: 'quality', name: 'Качество кода', desc: 'Code review и best practices' },
                  { id: 'security', name: 'Безопасность', desc: 'Уязвимости и риски' },
                  { id: 'performance', name: 'Производительность', desc: 'Оптимизация и bottlenecks' },
                ].map(type => (
                  <button
                    key={type.id}
                    onClick={() => {
                      setAnalysisType(type.id);
                      setShowAnalysisMenu(false);
                      handleAnalyze();
                    }}
                    className={`w-full px-3 py-2 text-left text-xs hover:bg-[#252840] transition-colors ${
                      analysisType === type.id ? 'bg-purple-900/30 border-l-2 border-purple-500' : ''
                    }`}
                  >
                    <div className="font-medium text-white">{type.name}</div>
                    <div className="text-[10px] text-gray-500">{type.desc}</div>
                  </button>
                ))}
                
                {/* Custom question */}
                <div className="px-3 py-2 border-t border-[#2a2f46]">
                  <input
                    type="text"
                    value={customQuestion}
                    onChange={(e) => setCustomQuestion(e.target.value)}
                    placeholder="Свой вопрос о проекте..."
                    className="w-full px-2 py-1.5 text-xs bg-[#0f111b] border border-[#1f2236] rounded focus:outline-none focus:border-purple-500 text-white placeholder-gray-500"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && customQuestion.trim()) {
                        setAnalysisType('custom');
                        setShowAnalysisMenu(false);
                        handleAnalyze();
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => handleSaveFile()}
            disabled={saving || !activeFile || !openFiles.find(f => f.path === activeFile)?.isDirty}
            className="px-2 py-1.5 bg-[#1f2236] hover:bg-[#2a2f46] disabled:opacity-30 rounded-lg text-xs transition-colors flex items-center gap-1.5"
            title="Сохранить (Ctrl+S)"
          >
            {saving ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" /> : <Save size={14} strokeWidth={1.5} />}
          </button>
          <button
            onClick={() => setShowCommandPalette(true)}
            className="px-2 py-1.5 bg-[#1f2236] hover:bg-[#2a2f46] rounded-lg text-xs transition-colors flex items-center gap-1.5"
            title="Поиск файла (Ctrl+P)"
          >
            <Command size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center bg-[#1a1d2e] border-b border-[#1f2236] h-9 overflow-x-auto">
          {openFiles.map(file => {
            const TabIcon = file.isNew ? Sparkles : FileCode;
            return (
              <div
                key={file.path}
                onClick={() => setActiveFile(file.path)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-r border-[#1f2236] transition-colors min-w-0 group ${
                  activeFile === file.path ? 'bg-[#0f111b] text-white' : 'bg-[#1a1d2e] text-gray-400 hover:text-white'
                }`}
              >
                <TabIcon size={12} strokeWidth={1.5} className="shrink-0" />
                <span className="truncate max-w-[100px]">{file.name}</span>
                {file.isDirty && !file.isNew && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleSaveFile(file.path); }}
                    className="text-blue-400 hover:text-blue-300 ml-0.5"
                    title="Сохранить (Ctrl+S)"
                  >
                    ●
                  </button>
                )}
                {file.isDirty && file.isNew && <span className="text-yellow-400 ml-0.5">◉</span>}
                <button onClick={(e) => handleCloseFile(file.path, e)} className="ml-1 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"><X size={12} strokeWidth={1.5} /></button>
              </div>
            );
          })}
          {openFiles.length === 0 && (
            <div className="px-3 py-1.5 text-xs text-gray-500">Откройте или создайте файл</div>
          )}
          
          {/* Save status indicator */}
          {saveStatus && (
            <div className={`ml-auto px-2 py-1 text-[10px] ${saveStatus.success ? 'text-green-400' : 'text-red-400'}`}>
              {saving && <Loader2 size={10} className="animate-spin inline mr-1" />}
              {saveStatus.message}
            </div>
          )}
        </div>
        
        {/* Breadcrumbs */}
        {activeFileContent && (
          <div className="flex items-center gap-1 px-3 py-1 bg-[#131524] border-b border-[#1f2236] text-[11px] text-gray-500">
            <Folder size={11} strokeWidth={1.5} className="text-gray-600" />
            {activeFileContent.path.split('/').map((part, idx, arr) => (
              <span key={idx} className="flex items-center gap-1">
                {idx > 0 && <ChevronRight size={10} className="text-gray-600" />}
                <span className={idx === arr.length - 1 ? 'text-gray-300' : 'hover:text-gray-300 cursor-pointer'}>
                  {part}
                </span>
              </span>
            ))}
          </div>
        )}

        {/* Editor */}
        <div className={`flex-1 ${bottomPanelOpen ? 'h-1/2' : ''}`}>
          {activeFileContent ? (
            <Editor
              height="100%"
              language={activeFileContent.language}
              value={activeFileContent.content}
              onChange={(value) => handleEditorChange(value, activeFileContent.path)}
              theme="vs-dark"
              options={{
                minimap: { enabled: true },
                fontSize: 13,
                wordWrap: 'on',
                lineNumbers: 'on',
                folding: true,
                automaticLayout: true,
                scrollBeyondLastLine: false,
                renderLineHighlight: 'all',
                cursorBlinking: 'smooth',
                smoothScrolling: true
              }}
              onMount={(editor) => { 
                editorRef.current = editor;
                // Track cursor position
                editor.onDidChangeCursorPosition((e) => {
                  setCursorPosition({ line: e.position.lineNumber, column: e.position.column });
                });
              }}
            />
          ) : (
            <div className="flex-1 h-full flex items-center justify-center text-gray-500">
              <div className="text-center">
                <Terminal size={48} strokeWidth={1} className="mx-auto mb-4 opacity-40" />
                <p className="text-lg font-medium">IDE</p>
                <p className="text-sm mt-2 text-gray-600">
                  Откройте проект или опишите задачу для генерации кода
                </p>
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-600">
                  <kbd className="px-1.5 py-0.5 bg-[#1f2236] rounded text-gray-400">Ctrl+P</kbd>
                  <span>Поиск файла</span>
                  <span className="text-gray-700">|</span>
                  <kbd className="px-1.5 py-0.5 bg-[#1f2236] rounded text-gray-400">Ctrl+S</kbd>
                  <span>Сохранить</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div className="h-6 bg-[#1a1d2e] border-t border-[#1f2236] flex items-center justify-between px-3 text-[10px] text-gray-500">
          <div className="flex items-center gap-3">
            {/* Git branch placeholder */}
            <div className="flex items-center gap-1">
              <GitBranch size={11} strokeWidth={1.5} />
              <span>main</span>
            </div>
            
            {/* Errors/Warnings */}
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-0.5">
                <CircleX size={10} className="text-red-400" /> 0
              </span>
              <span className="flex items-center gap-0.5">
                <AlertCircle size={10} className="text-yellow-400" /> 0
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Cursor position */}
            {activeFileContent && (
              <div className="flex items-center gap-1">
                <span>Ln {cursorPosition.line}, Col {cursorPosition.column}</span>
              </div>
            )}
            
            {/* Language */}
            {activeFileContent && (
              <div className="text-gray-400">
                {activeFileContent.language}
              </div>
            )}
            
            {/* Encoding */}
            <div>UTF-8</div>
            
            {/* Keyboard shortcuts hint */}
            <button 
              onClick={() => setShowShortcutsHint(prev => !prev)}
              className="flex items-center gap-1 hover:text-gray-300 transition-colors"
              title="Горячие клавиши (Ctrl+K)"
            >
              <Keyboard size={11} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Bottom Panel */}
        {bottomPanelOpen && (
          <div className="h-1/3 min-h-[150px] border-t border-[#1f2236] bg-[#0a0c14] flex flex-col">
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#131524] border-b border-[#1f2236]">
              <div className="flex items-center gap-4 text-xs">
                <button
                  onClick={() => { setRunResult(null); setAnalysisResult(null); }}
                  className={`px-2 py-1 rounded flex items-center gap-1.5 ${!analysisResult ? 'bg-[#1f2236] text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  <Terminal size={12} strokeWidth={1.5} /> Вывод
                </button>
                {analysisResult && (
                  <button className="px-2 py-1 rounded bg-purple-900/30 text-purple-300 flex items-center gap-1.5">
                    <Brain size={12} strokeWidth={1.5} /> Анализ
                  </button>
                )}
              </div>
              <button onClick={() => setBottomPanelOpen(false)} className="text-gray-400 hover:text-white"><X size={14} strokeWidth={1.5} /></button>
            </div>
            
            <div className="flex-1 overflow-auto p-3">
              {/* HTML Preview */}
              {htmlPreviewUrl && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-400">HTML Предпросмотр</span>
                    <div className="flex gap-2">
                      <button onClick={() => window.open(htmlPreviewUrl, '_blank')}
                        className="text-xs px-2 py-1 bg-blue-600/50 hover:bg-blue-600 rounded">
                        Открыть в новом окне
                      </button>
                      <button onClick={() => { URL.revokeObjectURL(htmlPreviewUrl); setHtmlPreviewUrl(null); }}
                        className="text-xs px-2 py-1 bg-red-600/50 hover:bg-red-600 rounded">
                        Закрыть
                      </button>
                    </div>
                  </div>
                  <iframe src={htmlPreviewUrl} className="w-full h-[300px] bg-white rounded border border-[#1f2236]"
                    title="Preview" sandbox="allow-scripts allow-same-origin" />
                </div>
              )}
              
              {/* Run Result */}
              {runResult && !analysisResult && (
                <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">{runResult}</pre>
              )}
              
              {/* Analyzing Progress Indicator */}
              {analyzing && (
                <div className="flex flex-col items-center justify-center py-6 space-y-4">
                  {/* Animated icon based on stage */}
                  <div className="text-purple-400">
                    {progressStage === 'profiling' && <BarChart3 size={40} strokeWidth={1.5} />}
                    {progressStage === 'strategy' && <Target size={40} strokeWidth={1.5} />}
                    {progressStage === 'scanning' && <Files size={40} strokeWidth={1.5} />}
                    {progressStage === 'git' && <GitCommit size={40} strokeWidth={1.5} />}
                    {progressStage === 'rag' && <Search size={40} strokeWidth={1.5} />}
                    {progressStage === 'analyzing' && <Brain size={40} strokeWidth={1.5} className="animate-pulse" />}
                    {progressStage === 'processing' && <Cpu size={40} strokeWidth={1.5} />}
                    {progressStage === 'error' && <CircleX size={40} strokeWidth={1.5} className="text-red-400" />}
                    {(!progressStage || progressStage === 'starting') && <Loader2 size={40} strokeWidth={1.5} className="animate-spin" />}
                  </div>
                  
                  {/* Message */}
                  <div className="text-sm text-purple-300 font-medium">
                    {progressMessage || 'Анализируем проект...'}
                  </div>
                  
                  {/* Progress bar */}
                  <div className="w-full max-w-xs">
                    <div className="h-2 bg-[#1f2236] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-purple-600 to-blue-500 transition-all duration-500 ease-out"
                        style={{ width: `${Math.max(5, progressPercent)}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1 text-[10px] text-gray-500">
                      <span>{progressPercent > 0 ? `${Math.round(progressPercent)}%` : 'Инициализация...'}</span>
                      <span className="capitalize">{progressStage.replace('_', ' ')}</span>
                    </div>
                  </div>
                  
                  {/* Details */}
                  {progressDetails && Object.keys(progressDetails).length > 0 && (
                    <div className="mt-2 p-2 bg-[#1f2236]/50 rounded text-[10px] text-gray-400 max-w-xs">
                      {progressDetails.complexity && (
                        <div>Сложность: <span className="text-purple-300">{progressDetails.complexity}</span></div>
                      )}
                      {progressDetails.files && (
                        <div>Файлов кода: <span className="text-blue-300">{progressDetails.files}</span></div>
                      )}
                      {progressDetails.languages && (
                        <div>Языки: <span className="text-green-300">{progressDetails.languages.join(', ')}</span></div>
                      )}
                      {progressDetails.files_read && (
                        <div>Прочитано: <span className="text-yellow-300">{progressDetails.files_read} файлов</span></div>
                      )}
                      {progressDetails.agents && (
                        <div>Агенты: <span className="text-cyan-300">{progressDetails.agents.join(', ')}</span></div>
                      )}
                      {/* Model info */}
                      {progressDetails.model && (
                        <div className="mt-1 pt-1 border-t border-[#2a2d42]">
                          <div className="flex items-center gap-1">
                            <Cpu size={10} className="text-orange-400" />
                            <span>Модель: </span>
                            <span className="text-orange-300 font-medium">{progressDetails.model}</span>
                            {progressDetails.provider && (
                              <span className="text-gray-500">({progressDetails.provider})</span>
                            )}
                          </div>
                          {progressDetails.available_models && progressDetails.available_models.length > 1 && (
                            <div className="mt-0.5 text-[9px] text-gray-500">
                              Доступно: {progressDetails.available_models.join(', ')}
                            </div>
                          )}
                        </div>
                      )}
                      {progressDetails.model_reason && (
                        <div className="mt-1 text-gray-500 italic text-[9px]">{progressDetails.model_reason}</div>
                      )}
                      {progressDetails.info && !progressDetails.model_reason && (
                        <div className="mt-1 text-gray-500 italic">{progressDetails.info}</div>
                      )}
                    </div>
                  )}
                </div>
              )}
              
              {/* Analysis Result */}
              {analysisResult && !analyzing && (
                <div className="space-y-4">
                  {analysisResult.error ? (
                    <div className="text-red-400 text-sm flex items-center gap-2">
                      <CircleX size={14} strokeWidth={1.5} /> {analysisResult.error}
                    </div>
                  ) : (
                    <>
                      {/* Profile Summary */}
                      <div className="flex flex-wrap gap-3 text-xs">
                        <div className="px-2 py-1 bg-purple-900/30 rounded text-purple-300 flex items-center gap-1">
                          <Target size={12} strokeWidth={1.5} /> {analysisResult.complexity || 'unknown'}
                        </div>
                        <div className="px-2 py-1 bg-blue-900/30 rounded text-blue-300 flex items-center gap-1">
                          <Files size={12} strokeWidth={1.5} /> {analysisResult.files_analyzed || 0} файлов
                        </div>
                        <div className="px-2 py-1 bg-green-900/30 rounded text-green-300 flex items-center gap-1">
                          <Code size={12} strokeWidth={1.5} /> {(analysisResult.total_lines || 0).toLocaleString()} строк
                        </div>
                        {analysisResult.profile?.languages && Object.keys(analysisResult.profile.languages).length > 0 && (
                          <div className="px-2 py-1 bg-yellow-900/30 rounded text-yellow-300 flex items-center gap-1">
                            <Terminal size={12} strokeWidth={1.5} /> {Object.keys(analysisResult.profile.languages).slice(0, 3).join(', ')}
                          </div>
                        )}
                        {analysisResult.profile?.frameworks && analysisResult.profile.frameworks.length > 0 && (
                          <div className="px-2 py-1 bg-cyan-900/30 rounded text-cyan-300 flex items-center gap-1">
                            <Package size={12} strokeWidth={1.5} /> {analysisResult.profile.frameworks.join(', ')}
                          </div>
                        )}
                        {analysisResult.elapsed_seconds && (
                          <div className="px-2 py-1 bg-gray-800 rounded text-gray-400 flex items-center gap-1">
                            <Clock size={12} strokeWidth={1.5} /> {analysisResult.elapsed_seconds}s
                          </div>
                        )}
                      </div>
                      
                      {/* Strategy info */}
                      {analysisResult.strategy_used && (
                        <div className="text-[10px] text-gray-500">
                          Стратегия: {analysisResult.strategy_used}
                        </div>
                      )}
                      
                      {/* Model info */}
                      {analysisResult.model_info && (
                        <div className="p-2 bg-orange-900/20 border border-orange-500/20 rounded-lg">
                          <div className="flex items-center gap-2 text-xs text-orange-300">
                            <Cpu size={14} strokeWidth={1.5} />
                            <span className="font-medium">
                              {analysisResult.model_info.model || 'Неизвестная модель'}
                            </span>
                            {analysisResult.model_info.provider && (
                              <span className="text-orange-400/60">({analysisResult.model_info.provider})</span>
                            )}
                            {analysisResult.model_info.is_local && (
                              <span className="px-1.5 py-0.5 bg-green-900/30 text-green-400 text-[9px] rounded">локальная</span>
                            )}
                          </div>
                          {analysisResult.model_info.reason && (
                            <div className="mt-1 text-[10px] text-gray-400">
                              {analysisResult.model_info.reason}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Main analysis */}
                      <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed prose prose-invert prose-sm max-w-none">
                        {analysisResult.result?.final_answer || analysisResult.result?.analysis || analysisResult.result?.report || analysisResult.analysis || 'Нет результата'}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Folder Browser Modal */}
      {showBrowser && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-[#131524] border border-[#1f2236] rounded-xl shadow-2xl w-[500px] max-h-[70vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#1f2236]">
              <div className="flex items-center gap-2">
                <FolderOpen size={20} strokeWidth={1.5} className="text-blue-400" />
                <span className="font-semibold text-gray-200">Выбор папки проекта</span>
              </div>
              <button
                onClick={() => setShowBrowser(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>
            
            {/* Current Path */}
            <div className="px-4 py-2 bg-[#0a0c14] border-b border-[#1f2236] flex items-center gap-2">
              <button
                onClick={handleBrowserGoUp}
                disabled={browserPath === '/'}
                className="px-2 py-1 bg-[#1f2236] hover:bg-[#2a2f46] disabled:opacity-50 rounded text-xs transition-colors flex items-center gap-1"
              >
                <ChevronUp size={12} strokeWidth={1.5} /> Вверх
              </button>
              <div className="flex-1 text-xs text-gray-400 truncate font-mono">
                {browserPath}
              </div>
            </div>
            
            {/* Directory List */}
            <div className="flex-1 overflow-y-auto p-2">
              {browserLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-400">
                  <Loader2 size={16} strokeWidth={1.5} className="animate-spin mr-2" />
                  Загрузка...
                </div>
              ) : browserDirs.length > 0 ? (
                <div className="space-y-1">
                  {browserDirs.map((dir, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleBrowserSelect(dir)}
                      onDoubleClick={() => {
                        setShowBrowser(false);
                        handleOpenProject(dir.path);
                      }}
                      className={`w-full px-3 py-2 text-left rounded-lg transition-colors flex items-center gap-3 ${
                        dir.has_code
                          ? 'bg-green-900/20 hover:bg-green-900/40 border border-green-500/30'
                          : 'hover:bg-[#1f2236]'
                      }`}
                    >
                      {dir.has_code ? 
                        <Package size={18} strokeWidth={1.5} className="text-green-400 shrink-0" /> : 
                        <Folder size={18} strokeWidth={1.5} className="text-gray-400 shrink-0" />
                      }
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white truncate">{dir.name}</div>
                        {dir.has_code && (
                          <div className="text-[10px] text-green-400">Проект с кодом</div>
                        )}
                      </div>
                      {dir.has_code ? (
                        <span className="text-xs text-green-400">Открыть</span>
                      ) : (
                        <ChevronRight size={14} strokeWidth={1.5} className="text-gray-500" />
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 text-sm">
                  Нет подпапок
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="p-3 border-t border-[#1f2236] flex items-center justify-between">
              <div className="text-[10px] text-gray-500 flex items-center gap-1">
                <AlertCircle size={10} strokeWidth={1.5} /> Двойной клик или "Открыть" для выбора проекта
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowBrowser(false);
                    handleOpenProject(browserPath);
                  }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium transition-colors"
                >
                  Открыть текущую
                </button>
                <button
                  onClick={() => setShowBrowser(false)}
                  className="px-3 py-1.5 bg-[#1f2236] hover:bg-[#2a2f46] rounded text-xs transition-colors"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-900/90 border border-red-500 text-red-200 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50">
          <span>⚠️</span>
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-2 hover:text-white">×</button>
        </div>
      )}
      
      {/* Smart Analysis Suggestion */}
      {showAnalysisSuggestion && autoIndexingDone && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-300">
          <div className="bg-gradient-to-br from-[#1a1d2e] to-[#131524] border border-purple-500/30 rounded-2xl shadow-2xl shadow-purple-500/20 p-6 max-w-md mx-4 animate-in zoom-in-95 duration-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-purple-500/20 rounded-xl">
                <Brain size={28} className="text-purple-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Проект готов к работе!</h3>
                <p className="text-sm text-gray-400">Индексация завершена</p>
              </div>
            </div>
            
            <p className="text-gray-300 text-sm mb-6">
              Хотите выполнить AI-анализ проекта? Я изучу структуру, зависимости и дам рекомендации по улучшению.
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowAnalysisSuggestion(false);
                  handleAnalyze();
                }}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30"
              >
                <Sparkles size={18} />
                Да, анализировать
              </button>
              <button
                onClick={() => setShowAnalysisSuggestion(false)}
                className="px-4 py-2.5 bg-[#1f2236] hover:bg-[#2a2d42] text-gray-300 rounded-xl font-medium transition-all border border-[#2a2d42]"
              >
                Позже
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Command Palette Modal */}
      {showCommandPalette && (
        <div 
          className="fixed inset-0 bg-black/60 flex items-start justify-center pt-[15vh] z-50 backdrop-blur-sm"
          onClick={() => setShowCommandPalette(false)}
        >
          <div 
            className="bg-[#1a1d2e] border border-[#2a2f46] rounded-xl shadow-2xl w-[500px] max-h-[60vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#2a2f46]">
              <Search size={16} strokeWidth={1.5} className="text-gray-400" />
              <input
                ref={commandInputRef}
                type="text"
                value={commandSearch}
                onChange={e => setCommandSearch(e.target.value)}
                placeholder="Найти файл по имени..."
                className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const files = filteredFiles();
                    if (files.length > 0) {
                      handleFileClick(files[0]);
                      setShowCommandPalette(false);
                      setCommandSearch('');
                    }
                  }
                }}
              />
              <kbd className="px-1.5 py-0.5 bg-[#0f111b] rounded text-[10px] text-gray-500">ESC</kbd>
            </div>
            
            {/* Results */}
            <div className="flex-1 overflow-y-auto">
              {projectTree ? (
                filteredFiles().length > 0 ? (
                  filteredFiles().map((file, idx) => {
                    const Icon = getFileIcon(file);
                    return (
                      <button
                        key={`${file.path}-${idx}`}
                        onClick={() => {
                          handleFileClick(file);
                          setShowCommandPalette(false);
                          setCommandSearch('');
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-[#252840] transition-colors flex items-center gap-3 text-sm"
                      >
                        <Icon size={14} strokeWidth={1.5} className="text-gray-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-white truncate">{file.name}</div>
                          <div className="text-[10px] text-gray-500 truncate">{file.path}</div>
                        </div>
                        <CornerDownLeft size={12} className="text-gray-600" />
                      </button>
                    );
                  })
                ) : (
                  <div className="px-4 py-8 text-center text-gray-500 text-sm">
                    Файлы не найдены
                  </div>
                )
              ) : (
                <div className="px-4 py-8 text-center text-gray-500 text-sm">
                  <Folder size={24} className="mx-auto mb-2 opacity-50" />
                  Сначала откройте проект
                </div>
              )}
            </div>
            
            {/* Footer hint */}
            <div className="px-4 py-2 border-t border-[#2a2f46] text-[10px] text-gray-500 flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-1 bg-[#0f111b] rounded">↵</kbd> открыть
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 bg-[#0f111b] rounded">↑↓</kbd> навигация
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="fixed bg-[#1a1d2e] border border-[#2a2f46] rounded-lg shadow-xl z-50 py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={() => setContextMenu(null)}
        >
          {!contextMenu.file.is_dir && (
            <>
              <button
                onClick={() => { handleFileClick(contextMenu.file); setContextMenu(null); }}
                className="w-full px-3 py-1.5 text-left text-xs hover:bg-[#252840] flex items-center gap-2 text-gray-300"
              >
                <Eye size={12} strokeWidth={1.5} /> Открыть
              </button>
              <div className="border-t border-[#2a2f46] my-1" />
            </>
          )}
          <button
            onClick={() => handleCopyPath(contextMenu.file)}
            className="w-full px-3 py-1.5 text-left text-xs hover:bg-[#252840] flex items-center gap-2 text-gray-300"
          >
            <Copy size={12} strokeWidth={1.5} /> Копировать путь
          </button>
          {!contextMenu.file.is_dir && (
            <>
              <div className="border-t border-[#2a2f46] my-1" />
              <button
                onClick={() => handleDeleteFile(contextMenu.file)}
                className="w-full px-3 py-1.5 text-left text-xs hover:bg-red-900/30 flex items-center gap-2 text-red-400"
              >
                <Trash2 size={12} strokeWidth={1.5} /> Удалить
              </button>
            </>
          )}
        </div>
      )}

      {/* Keyboard Shortcuts Hint */}
      {showShortcutsHint && (
        <div className="fixed bottom-12 right-4 bg-[#1a1d2e] border border-[#2a2f46] rounded-lg shadow-xl z-50 p-4 w-64">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-white flex items-center gap-2">
              <Keyboard size={14} /> Горячие клавиши
            </h4>
            <button onClick={() => setShowShortcutsHint(false)} className="text-gray-500 hover:text-white">
              <X size={12} />
            </button>
          </div>
          <div className="space-y-2 text-[11px]">
            <div className="flex justify-between text-gray-400">
              <span>Сохранить</span>
              <kbd className="px-1.5 py-0.5 bg-[#0f111b] rounded text-gray-300">Ctrl+S</kbd>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Поиск файла</span>
              <kbd className="px-1.5 py-0.5 bg-[#0f111b] rounded text-gray-300">Ctrl+P</kbd>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Закрыть вкладку</span>
              <kbd className="px-1.5 py-0.5 bg-[#0f111b] rounded text-gray-300">Ctrl+W</kbd>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Сохранить все</span>
              <kbd className="px-1.5 py-0.5 bg-[#0f111b] rounded text-gray-300">Ctrl+Shift+S</kbd>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Эта подсказка</span>
              <kbd className="px-1.5 py-0.5 bg-[#0f111b] rounded text-gray-300">Ctrl+K</kbd>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close context menu */}
      {contextMenu && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setContextMenu(null)}
        />
      )}
      
      {/* Click outside to close analysis menu */}
      {showAnalysisMenu && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowAnalysisMenu(false)}
        />
      )}
    </div>
  );
}

