import React, { memo, useState } from 'react';
import { 
  CheckCircle2, XCircle, AlertTriangle, Clock, 
  ChevronDown, ChevronUp, Play, FlaskConical,
  Bug, Sparkles
} from 'lucide-react';

// Types matching backend TestResult
export interface TestCase {
  name: string;
  status: 'passed' | 'failed' | 'error' | 'timeout' | 'skipped';
  duration?: number;
  output?: string;
  error?: string;
  expected?: string;
  actual?: string;
}

export interface TestResultData {
  success: boolean;
  tests_run: number;
  tests_passed: number;
  tests_failed: number;
  tests_error?: number;
  pass_rate?: number;
  code_ran_successfully: boolean;
  execution_output?: string;
  execution_error?: string;
  execution_time?: number;
  test_cases?: TestCase[];
  has_generated_tests?: boolean;
}

interface TestResultPanelProps {
  testResult: TestResultData;
  isExpanded?: boolean;
}

const StatusIcon: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case 'passed':
      return <CheckCircle2 size={14} className="text-green-400" />;
    case 'failed':
      return <XCircle size={14} className="text-red-400" />;
    case 'error':
      return <AlertTriangle size={14} className="text-orange-400" />;
    case 'timeout':
      return <Clock size={14} className="text-yellow-400" />;
    default:
      return <AlertTriangle size={14} className="text-gray-400" />;
  }
};

export const TestResultPanel: React.FC<TestResultPanelProps> = memo(({ 
  testResult,
  isExpanded: defaultExpanded = false
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  const passRate = testResult.pass_rate ?? 
    (testResult.tests_run > 0 ? testResult.tests_passed / testResult.tests_run : 
     testResult.code_ran_successfully ? 1 : 0);
  
  const getStatusColor = () => {
    if (testResult.success && passRate >= 0.9) return 'from-green-900/40 to-emerald-800/30';
    if (passRate >= 0.6) return 'from-yellow-900/40 to-amber-800/30';
    return 'from-red-900/40 to-rose-800/30';
  };
  
  const getBorderColor = () => {
    if (testResult.success && passRate >= 0.9) return 'border-green-500/40';
    if (passRate >= 0.6) return 'border-yellow-500/40';
    return 'border-red-500/40';
  };
  
  const getTextColor = () => {
    if (testResult.success && passRate >= 0.9) return 'text-green-300';
    if (passRate >= 0.6) return 'text-yellow-300';
    return 'text-red-300';
  };

  return (
    <div className={`mb-4 overflow-hidden rounded-xl border ${getBorderColor()} shadow-lg transition-all duration-300`}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full p-4 bg-gradient-to-br ${getStatusColor()} hover:brightness-110 transition-all duration-200 flex items-center justify-between gap-3`}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <FlaskConical size={18} strokeWidth={1.5} className={getTextColor()} />
            <span className={`text-sm font-semibold ${getTextColor()}`}>
              Результаты тестирования
            </span>
          </div>
          
          {/* Status badge */}
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
            testResult.success 
              ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
              : 'bg-red-500/20 text-red-300 border border-red-500/30'
          }`}>
            {testResult.success ? '✓ Passed' : '✗ Failed'}
          </span>
          
          {/* Auto-generated badge */}
          {testResult.has_generated_tests && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
              <Sparkles size={10} />
              Auto-generated
            </span>
          )}
          
          {/* Stats */}
          <div className="hidden sm:flex items-center gap-2 text-[10px] text-gray-400">
            {testResult.tests_run > 0 && (
              <>
                <span className="text-green-400">{testResult.tests_passed} passed</span>
                {testResult.tests_failed > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-red-400">{testResult.tests_failed} failed</span>
                  </>
                )}
              </>
            )}
            {testResult.execution_time && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  {testResult.execution_time.toFixed(2)}s
                </span>
              </>
            )}
          </div>
        </div>
        
        {/* Pass rate circle + expand */}
        <div className="flex items-center gap-3">
          {/* Mini pass rate indicator */}
          <div className="relative w-10 h-10">
            <svg className="w-10 h-10 -rotate-90">
              <circle
                cx="20"
                cy="20"
                r="16"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                className="text-gray-700"
              />
              <circle
                cx="20"
                cy="20"
                r="16"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                strokeDasharray={`${passRate * 100} 100`}
                strokeLinecap="round"
                className={testResult.success ? 'text-green-400' : 'text-red-400'}
              />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-bold ${getTextColor()}`}>
              {Math.round(passRate * 100)}%
            </span>
          </div>
          
          <div className={`p-1.5 rounded-lg bg-white/10 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
            <ChevronDown size={16} strokeWidth={2} className={getTextColor()} />
          </div>
        </div>
      </button>
      
      {/* Expandable content */}
      <div className={`transition-all duration-300 ease-out ${
        isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
      } overflow-hidden`}>
        <div className="p-4 bg-[#0f111b]/60 border-t border-gray-700/50 space-y-3">
          
          {/* Execution status */}
          {testResult.code_ran_successfully ? (
            <div className="flex items-center gap-2 text-sm text-green-400">
              <Play size={14} />
              <span>Код выполнен успешно</span>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-sm text-red-400">
              <Bug size={14} className="flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-medium">Ошибка выполнения:</span>
                {testResult.execution_error && (
                  <pre className="mt-1 text-xs text-red-300/80 bg-red-900/20 p-2 rounded overflow-x-auto">
                    {testResult.execution_error.slice(0, 300)}
                  </pre>
                )}
              </div>
            </div>
          )}
          
          {/* Test cases */}
          {testResult.test_cases && testResult.test_cases.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-gray-400 font-medium">Тест-кейсы:</div>
              {testResult.test_cases.map((tc, idx) => (
                <div 
                  key={idx}
                  className={`flex items-start gap-2 p-2 rounded-lg text-xs ${
                    tc.status === 'passed' 
                      ? 'bg-green-900/20 border border-green-500/20' 
                      : 'bg-red-900/20 border border-red-500/20'
                  }`}
                >
                  <StatusIcon status={tc.status} />
                  <div className="flex-1 min-w-0">
                    <span className={`font-mono ${
                      tc.status === 'passed' ? 'text-green-300' : 'text-red-300'
                    }`}>
                      {tc.name}
                    </span>
                    {tc.error && (
                      <div className="mt-1 text-red-300/70 truncate">
                        {tc.error}
                      </div>
                    )}
                    {tc.expected && tc.actual && tc.status === 'failed' && (
                      <div className="mt-1 space-y-1 text-[10px]">
                        <div className="text-gray-400">Expected: <span className="text-green-300">{tc.expected}</span></div>
                        <div className="text-gray-400">Got: <span className="text-red-300">{tc.actual}</span></div>
                      </div>
                    )}
                  </div>
                  {tc.duration !== undefined && (
                    <span className="text-[10px] text-gray-500">
                      {tc.duration.toFixed(2)}s
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          
          {/* Execution output */}
          {testResult.execution_output && testResult.code_ran_successfully && (
            <div className="space-y-1">
              <div className="text-xs text-gray-400 font-medium">Вывод:</div>
              <pre className="text-xs text-gray-300 bg-[#0a0c15] p-2 rounded-lg overflow-x-auto max-h-32">
                {testResult.execution_output.slice(0, 500)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

TestResultPanel.displayName = 'TestResultPanel';

export default TestResultPanel;

