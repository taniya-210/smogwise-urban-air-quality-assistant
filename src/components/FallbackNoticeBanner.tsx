import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { FallbackErrorCategory } from '../shared/types.ts';

interface FallbackNoticeBannerProps {
  reason?: string;
  category?: FallbackErrorCategory;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
}

function getSafeNoticeText(reason?: string, category?: FallbackErrorCategory): string {
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

  switch (category) {
    case 'rate_limit':
      return 'Live Gemini AI has temporarily reached its usage or rate limit. Showing template guidance right now — wait a moment and select Retry.';
    case 'service_unavailable':
      return 'Live Gemini AI is temporarily unavailable due to high service demand. Showing template guidance instead — select Retry shortly.';
    case 'missing_key':
      return 'Live Gemini AI is not configured on this server yet. Showing template guidance while live AI generation is unavailable.';
    case 'invalid_key':
      return 'The server’s Gemini API credentials could not be verified. Showing template guidance meanwhile.';
    default:
      return 'Live Gemini AI is temporarily unavailable. Showing template guidance while service recovers — you can select Retry shortly.';
  }
}

export function FallbackNoticeBanner({
  reason,
  category,
  onRetry,
  retrying = false,
  compact = false,
}: FallbackNoticeBannerProps) {
  const safeText = getSafeNoticeText(reason, category);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-lg bg-amber-50 border border-amber-200 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
        compact ? 'px-3.5 py-2.5 text-xs' : 'px-4 py-3.5 text-xs sm:text-sm'
      }`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <AlertTriangle
          className="w-4 h-4 shrink-0 mt-0.5 text-amber-700"
          aria-hidden="true"
        />
        <div className="space-y-0.5 min-w-0">
          <div className="font-bold tracking-tight text-amber-950">
            AI FALLBACK MODE · DEMO / TEMPLATE GUIDANCE
          </div>
          <p className="text-amber-900 leading-relaxed break-words">{safeText}</p>
        </div>
      </div>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-semibold text-amber-950 bg-white border border-amber-300 rounded-md hover:bg-amber-100 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 self-start sm:self-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} aria-hidden="true" />
          {retrying ? 'Retrying...' : 'Retry with Gemini'}
        </button>
      )}
    </div>
  );
}
