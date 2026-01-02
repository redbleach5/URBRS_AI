import React, { memo, useState } from 'react';
import { 
  ShieldCheck, ShieldAlert, ShieldQuestion, Shield,
  ChevronDown, ExternalLink, AlertTriangle, CheckCircle2,
  HelpCircle, XCircle
} from 'lucide-react';

// Types matching backend FactCheckResult
export interface FactClaim {
  text: string;
  category: string;
  confidence: 'verified' | 'likely' | 'uncertain' | 'disputed' | 'hallucination';
  sources: string[];
  evidence?: string;
  correction?: string;
}

export interface FactCheckData {
  claims_checked: number;
  claims_verified: number;
  claims_disputed: number;
  claims_uncertain: number;
  claims?: FactClaim[];
  overall_reliability: number;
  has_corrections?: boolean;
  sources_used?: string[];
}

interface FactCheckBadgeProps {
  factCheck: FactCheckData;
  showDetails?: boolean;
}

const ConfidenceIcon: React.FC<{ confidence: string }> = ({ confidence }) => {
  switch (confidence) {
    case 'verified':
      return <CheckCircle2 size={12} className="text-green-400" />;
    case 'likely':
      return <ShieldCheck size={12} className="text-blue-400" />;
    case 'uncertain':
      return <HelpCircle size={12} className="text-gray-400" />;
    case 'disputed':
      return <AlertTriangle size={12} className="text-orange-400" />;
    case 'hallucination':
      return <XCircle size={12} className="text-red-400" />;
    default:
      return <Shield size={12} className="text-gray-400" />;
  }
};

const getConfidenceLabel = (confidence: string): string => {
  switch (confidence) {
    case 'verified': return 'Подтверждено';
    case 'likely': return 'Вероятно';
    case 'uncertain': return 'Не проверено';
    case 'disputed': return 'Спорно';
    case 'hallucination': return 'Ошибка';
    default: return confidence;
  }
};

const getConfidenceColor = (confidence: string): string => {
  switch (confidence) {
    case 'verified': return 'text-green-400 bg-green-500/20 border-green-500/30';
    case 'likely': return 'text-blue-400 bg-blue-500/20 border-blue-500/30';
    case 'uncertain': return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
    case 'disputed': return 'text-orange-400 bg-orange-500/20 border-orange-500/30';
    case 'hallucination': return 'text-red-400 bg-red-500/20 border-red-500/30';
    default: return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
  }
};

// Compact badge for inline display
export const FactCheckBadge: React.FC<FactCheckBadgeProps> = memo(({ 
  factCheck,
  showDetails = false 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const reliability = factCheck.overall_reliability;
  
  const getReliabilityColor = () => {
    if (reliability >= 0.9) return 'text-green-400';
    if (reliability >= 0.7) return 'text-blue-400';
    if (reliability >= 0.5) return 'text-yellow-400';
    return 'text-red-400';
  };
  
  const getReliabilityBg = () => {
    if (reliability >= 0.9) return 'bg-green-500/20 border-green-500/30 hover:bg-green-500/30';
    if (reliability >= 0.7) return 'bg-blue-500/20 border-blue-500/30 hover:bg-blue-500/30';
    if (reliability >= 0.5) return 'bg-yellow-500/20 border-yellow-500/30 hover:bg-yellow-500/30';
    return 'bg-red-500/20 border-red-500/30 hover:bg-red-500/30';
  };
  
  const getReliabilityIcon = () => {
    if (reliability >= 0.9) return <ShieldCheck size={14} />;
    if (reliability >= 0.7) return <Shield size={14} />;
    if (reliability >= 0.5) return <ShieldQuestion size={14} />;
    return <ShieldAlert size={14} />;
  };
  
  const getReliabilityLabel = () => {
    if (reliability >= 0.9) return 'Высокая достоверность';
    if (reliability >= 0.7) return 'Достоверно';
    if (reliability >= 0.5) return 'Частично проверено';
    return 'Требует проверки';
  };

  // If no claims checked, don't show
  if (factCheck.claims_checked === 0) {
    return null;
  }

  return (
    <div className="relative">
      {/* Badge button */}
      <button
        onClick={() => showDetails && setIsExpanded(!isExpanded)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all duration-200 ${getReliabilityBg()} ${getReliabilityColor()} ${showDetails ? 'cursor-pointer' : 'cursor-default'}`}
        title={`${getReliabilityLabel()} (${Math.round(reliability * 100)}%)`}
      >
        {getReliabilityIcon()}
        <span>{Math.round(reliability * 100)}%</span>
        {factCheck.claims_disputed > 0 && (
          <span className="ml-1 px-1 py-0.5 rounded text-[9px] bg-red-500/30 text-red-300">
            {factCheck.claims_disputed} спорных
          </span>
        )}
        {showDetails && factCheck.claims && factCheck.claims.length > 0 && (
          <ChevronDown size={12} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        )}
      </button>
      
      {/* Expanded details */}
      {showDetails && isExpanded && factCheck.claims && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-[#1a1d2e] border border-[#2a2f46] rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-3 border-b border-[#2a2f46]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-200">Проверка фактов</span>
              <span className={`text-xs ${getReliabilityColor()}`}>
                {getReliabilityLabel()}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
              <span className="text-green-400">✓ {factCheck.claims_verified} подтверждено</span>
              {factCheck.claims_disputed > 0 && (
                <span className="text-red-400">✗ {factCheck.claims_disputed} спорно</span>
              )}
              {factCheck.claims_uncertain > 0 && (
                <span className="text-gray-400">? {factCheck.claims_uncertain} не проверено</span>
              )}
            </div>
          </div>
          
          <div className="max-h-60 overflow-y-auto p-2 space-y-2">
            {factCheck.claims.map((claim, idx) => (
              <div 
                key={idx}
                className={`p-2 rounded-lg border text-xs ${getConfidenceColor(claim.confidence)}`}
              >
                <div className="flex items-start gap-2">
                  <ConfidenceIcon confidence={claim.confidence} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] border ${getConfidenceColor(claim.confidence)}`}>
                        {getConfidenceLabel(claim.confidence)}
                      </span>
                      <span className="text-[9px] text-gray-500">{claim.category}</span>
                    </div>
                    <p className="text-gray-300 line-clamp-2">{claim.text}</p>
                    
                    {claim.correction && (
                      <div className="mt-1 text-[10px] text-green-300/80 bg-green-900/20 p-1 rounded">
                        Исправление: {claim.correction}
                      </div>
                    )}
                    
                    {claim.sources.length > 0 && (
                      <div className="mt-1 flex items-center gap-1 text-[9px] text-blue-400">
                        <ExternalLink size={9} />
                        <span>{claim.sources.length} источник{claim.sources.length > 1 ? 'а' : ''}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {/* Sources */}
          {factCheck.sources_used && factCheck.sources_used.length > 0 && (
            <div className="p-2 border-t border-[#2a2f46]">
              <div className="text-[10px] text-gray-400 mb-1">Источники:</div>
              <div className="flex flex-wrap gap-1">
                {factCheck.sources_used.slice(0, 3).map((source, idx) => (
                  <a
                    key={idx}
                    href={source}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[9px] text-blue-400 hover:text-blue-300 truncate max-w-[150px]"
                    title={source}
                  >
                    {new URL(source).hostname}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

FactCheckBadge.displayName = 'FactCheckBadge';

// Full panel version for larger displays
export const FactCheckPanel: React.FC<{ factCheck: FactCheckData }> = memo(({ factCheck }) => {
  const reliability = factCheck.overall_reliability;
  
  const getGradient = () => {
    if (reliability >= 0.9) return 'from-green-900/40 to-emerald-800/30';
    if (reliability >= 0.7) return 'from-blue-900/40 to-cyan-800/30';
    if (reliability >= 0.5) return 'from-yellow-900/40 to-amber-800/30';
    return 'from-red-900/40 to-rose-800/30';
  };
  
  const getBorder = () => {
    if (reliability >= 0.9) return 'border-green-500/40';
    if (reliability >= 0.7) return 'border-blue-500/40';
    if (reliability >= 0.5) return 'border-yellow-500/40';
    return 'border-red-500/40';
  };

  if (factCheck.claims_checked === 0) {
    return null;
  }

  return (
    <div className={`mb-4 p-4 bg-gradient-to-br ${getGradient()} border ${getBorder()} rounded-xl shadow-lg`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} strokeWidth={1.5} className="text-blue-400" />
          <span className="text-sm font-semibold text-gray-200">Проверка фактов</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-20 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                reliability >= 0.9 ? 'bg-gradient-to-r from-green-500 to-emerald-400' :
                reliability >= 0.7 ? 'bg-gradient-to-r from-blue-500 to-cyan-400' :
                reliability >= 0.5 ? 'bg-gradient-to-r from-yellow-500 to-amber-400' :
                'bg-gradient-to-r from-red-500 to-orange-400'
              }`}
              style={{ width: `${reliability * 100}%` }}
            />
          </div>
          <span className={`text-sm font-bold ${
            reliability >= 0.9 ? 'text-green-400' :
            reliability >= 0.7 ? 'text-blue-400' :
            reliability >= 0.5 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {Math.round(reliability * 100)}%
          </span>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="bg-green-900/30 p-2 rounded-lg border border-green-500/20">
          <div className="text-lg font-bold text-green-400">{factCheck.claims_verified}</div>
          <div className="text-green-300/70">Подтверждено</div>
        </div>
        <div className="bg-gray-900/30 p-2 rounded-lg border border-gray-500/20">
          <div className="text-lg font-bold text-gray-400">{factCheck.claims_uncertain}</div>
          <div className="text-gray-300/70">Не проверено</div>
        </div>
        <div className="bg-red-900/30 p-2 rounded-lg border border-red-500/20">
          <div className="text-lg font-bold text-red-400">{factCheck.claims_disputed}</div>
          <div className="text-red-300/70">Спорно</div>
        </div>
      </div>
      
      {factCheck.has_corrections && (
        <div className="mt-2 text-xs text-amber-400 flex items-center gap-1">
          <AlertTriangle size={12} />
          <span>Ответ был исправлен на основе проверки фактов</span>
        </div>
      )}
    </div>
  );
});

FactCheckPanel.displayName = 'FactCheckPanel';

export default FactCheckBadge;

