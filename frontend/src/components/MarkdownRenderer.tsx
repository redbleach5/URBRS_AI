import React from 'react';

/**
 * Renders markdown text to HTML with styling
 */
export function renderMarkdown(text: string): string {
  if (!text) return '';
  
  let html = text;
  
  // Блоки кода (обрабатываем первыми, чтобы не затронуть их содержимое)
  const codeBlocks: string[] = [];
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_match, lang, code) => {
    const id = `CODE_BLOCK_${codeBlocks.length}`;
    const langLabel = lang ? `<span class="absolute top-2 right-3 text-xs text-gray-400 font-medium">${lang}</span>` : '';
    codeBlocks.push(`<div class="relative my-4"><pre class="bg-[#0a0a0f] p-4 rounded-xl overflow-x-auto border-2 border-[#1a1d2e] shadow-inner"><code class="text-sm font-mono text-gray-200">${code.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>${langLabel}</div>`);
    return id;
  });
  
  // Код в обратных кавычках (только если не внутри блока кода)
  html = html.replace(/`([^`\n]+)`/g, '<code class="bg-[#0f111b] px-2 py-1 rounded-lg text-sm font-mono text-blue-300 border border-[#1f2236]">$1</code>');
  
  // Заголовки
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold mt-6 mb-3 text-gray-100 border-b border-[#2a2f46] pb-2">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-8 mb-4 text-gray-100 border-b border-[#2a2f46] pb-2">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-10 mb-5 text-gray-100 border-b-2 border-[#2a2f46] pb-3">$1</h1>');
  
  // Жирный текст
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-gray-100">$1</strong>');
  
  // Курсив (только если не часть жирного)
  html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em class="italic">$1</em>');
  
  // Ссылки в формате [текст](URL)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 underline break-words transition-colors">$1</a>');
  
  // Разделители
  html = html.replace(/^---$/gim, '<hr class="my-6 border-[#2a2f46]" />');
  
  // Обрабатываем списки построчно
  const lines = html.split('\n');
  const processedLines: string[] = [];
  let inList = false;
  let listType: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Проверяем, является ли строка элементом списка
    const ulMatch = trimmed.match(/^[\*\-\+]\s+(.+)$/);
    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    
    if (ulMatch || olMatch) {
      const itemText = ulMatch ? ulMatch[1] : olMatch![1];
      const currentListType = ulMatch ? 'ul' : 'ol';
      
      if (!inList || listType !== currentListType) {
        // Закрываем предыдущий список
        if (inList && listItems.length > 0) {
          const tag = listType === 'ul' ? 'ul' : 'ol';
          processedLines.push(`<${tag} class="list-${listType === 'ul' ? 'disc' : 'decimal'} ml-6 my-3 space-y-1">`);
          listItems.forEach(item => processedLines.push(`  <li class="mb-1">${item}</li>`));
          processedLines.push(`</${tag}>`);
          listItems = [];
        }
        inList = true;
        listType = currentListType;
      }
      listItems.push(itemText);
    } else {
      // Закрываем список, если он был открыт
      if (inList && listItems.length > 0) {
        const tag = listType === 'ul' ? 'ul' : 'ol';
        processedLines.push(`<${tag} class="list-${listType === 'ul' ? 'disc' : 'decimal'} ml-6 my-3 space-y-1">`);
        listItems.forEach(item => processedLines.push(`  <li class="mb-1">${item}</li>`));
        processedLines.push(`</${tag}>`);
        listItems = [];
        inList = false;
        listType = null;
      }
      
      if (trimmed) {
        // Если строка не пустая и не начинается с HTML тега, оборачиваем в параграф
        if (!trimmed.startsWith('<')) {
          processedLines.push(`<p class="mb-3 leading-relaxed">${trimmed}</p>`);
        } else {
          processedLines.push(line);
        }
      } else {
        processedLines.push('');
      }
    }
  }
  
  // Закрываем список, если он остался открытым
  if (inList && listItems.length > 0) {
    const tag = listType === 'ul' ? 'ul' : 'ol';
    processedLines.push(`<${tag} class="list-${listType === 'ul' ? 'disc' : 'decimal'} ml-6 my-3 space-y-1">`);
    listItems.forEach(item => processedLines.push(`  <li class="mb-1">${item}</li>`));
    processedLines.push(`</${tag}>`);
  }
  
  html = processedLines.join('\n');
  
  // Восстанавливаем блоки кода
  codeBlocks.forEach((block, index) => {
    html = html.replace(`CODE_BLOCK_${index}`, block);
  });
  
  return html;
}

interface MarkdownContentProps {
  content: string;
  className?: string;
}

/**
 * Component to render markdown content
 */
export const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, className = '' }) => {
  return (
    <div className={`prose prose-invert max-w-none ${className}`}>
      <div 
        className="text-[15px] leading-relaxed markdown-content"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
      />
    </div>
  );
};

export default MarkdownContent;

