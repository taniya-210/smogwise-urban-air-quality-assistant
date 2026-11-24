import { useId, useState } from 'react';
import { ChevronDown, ChevronUp, Cpu, RefreshCw } from 'lucide-react';
import type { FallbackErrorCategory } from '../shared/types.ts';

interface FallbackNoticeBannerProps {
  reason?: string;
  category?: FallbackErrorCategory;
  diagnosticDetail?: string;
  modelUsed?: string;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
}

function getShortReason(category?: FallbackErrorCategory): string {
  switch (category) {
    case 'rate_limit':
      return 'Gemini quota or rate limit reached — showing structured rule-based guidance.';
    case 'service_unavailable':
      return 'Gemini service is temporarily busy — showing structured rule-based guidance.';
    case 'missing_key':
      return 'Live Gemini API key is not configured on this server — showing rule-based guidance.';
    case 'invalid_key':
      return 'Gemini API key could not be verified — showing structured rule-based guidance.';
    case 'network_error':
      return 'Temporary network issue reaching Gemini — showing structured rule-based guidance.';
    default:
      return 'Live Gemini generation temporarily unavailable — showing rule-based guidance.';
  }
}

function getSafeFullReason(reason?: string, category?: FallbackErrorCategory): string {
  const trimmed = (reason || '').trim();
  const looksTechnical =
    !trimmed ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[') ||
    trimmed.includes('"error":') ||
    trimmed.includes('{"code"');

  if (!looksTechnical) {
    return trimmed;
  }
  return getShortReason(category);
}

export function FallbackNoticeBanner({
  reason,
  category,
  diagnosticDetail,
  modelUsed,
  onRetry,
  retrying = false,
  compact = false,
}: FallbackNoticeBannerProps) {
  const [showDetails, setShowDetails] = useState(false);
  const detailsId = useId();
  const shortText = getShortReason(category);
  const safeFullReason = getSafeFullReason(reason, category);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-lg bg-slate-50 border border-slate-200 text-slate-800 ${
        compact ? 'px-3 py-2 text-xs' : 'px-3.5 py-2.5 text-xs'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-start sm:items-center gap-2 min-w-0">
          <Cpu className="w-3.5 h-3.5 shrink-0 mt-0.5 sm:mt-0 text-slate-500" aria-hidden="true" />
          <div className="min-w-0 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span className="font-semibold text-slate-900 whitespace-nowrap">
              Smart Rule Engine · Template guidance
            </span>
            <span aria-hidden="true" className="text-slate-300 hidden sm:inline">
              ·
            </span>
            <span className="text-slate-600 leading-snug">{shortText}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
            aria-controls={detailsId}
            className="inline-flex items-center gap-1 px-2 py-1 min-h-[30px] text-[11px] font-medium text-slate-600 hover:text-slate-900 rounded hover:bg-slate-200/60 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <span>Details</span>
            {showDetails ? (
              <ChevronUp className="w-3 h-3" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3 h-3" aria-hidden="true" />
            )}
          </button>

          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 min-h-[30px] text-[11px] font-semibold text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-100 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <RefreshCw
                className={`w-3 h-3 ${retrying ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              {retrying ? 'Retrying...' : 'Retry with Gemini'}
            </button>
          )}
        </div>
      </div>

      {showDetails && (
        <div
          id={detailsId}
          className="mt-2 pt-2 border-t border-slate-200/80 text-[11px] text-slate-600 space-y-1"
        >
          <p className="leading-relaxed text-slate-700">{safeFullReason}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500 font-mono">
            <span>Status: {category || 'provider_error'}</span>
            {modelUsed && <span>Model: {modelUsed}</span>}
            {diagnosticDetail && <span>Note: {diagnosticDetail}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
