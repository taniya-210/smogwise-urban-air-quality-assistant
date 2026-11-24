import { useId, useState } from 'react';
import { ChevronDown, ChevronUp, Database, RefreshCw, Sparkles } from 'lucide-react';
import {
  buildPollutantDetails,
  getDataFreshness,
  getScaleDisplayLabel,
} from '../shared/aqi.ts';
import type { AirQualityData, AQIScaleId, FallbackErrorCategory } from '../shared/types.ts';
import { FallbackNoticeBanner } from './FallbackNoticeBanner.tsx';

export interface AiStatusStripProps {
  generatedBy: 'gemini' | 'fallback';
  fromCache?: boolean;
  cachedAt?: string;
  modelUsed?: string;
  fallbackReason?: string;
  errorCategory?: FallbackErrorCategory;
  diagnosticDetail?: string;
  contextChanged?: boolean;
  contextChangedLabel?: string;
  onRegenerate?: () => void;
  onRetryGemini?: () => void;
  regenerating?: boolean;
}

function formatShortTime(iso?: string | null): string {
  if (!iso) return 'Unavailable';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function AiStatusStrip({
  generatedBy,
  fromCache = false,
  cachedAt,
  modelUsed,
  fallbackReason,
  errorCategory,
  diagnosticDetail,
  contextChanged = false,
  contextChangedLabel,
  onRegenerate,
  onRetryGemini,
  regenerating = false,
}: AiStatusStripProps) {
  return (
    <div className="space-y-2.5">
      {contextChanged && onRegenerate && (
        <div
          role="status"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-950 text-xs"
        >
          <span>
            <span className="font-semibold">Inputs or scale changed:</span>{' '}
            {contextChangedLabel ||
              'Your city, AQI scale, or preferences changed since this plan was generated.'}
          </span>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0 self-start sm:self-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Regenerate Fresh Plan
          </button>
        </div>
      )}

      {generatedBy === 'fallback' ? (
        <FallbackNoticeBanner
          reason={fallbackReason}
          category={errorCategory}
          diagnosticDetail={diagnosticDetail}
          modelUsed={modelUsed}
          onRetry={onRetryGemini ?? onRegenerate}
          retrying={regenerating}
          compact
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-lg border border-slate-200 bg-slate-50/70 text-xs">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
            <span className="inline-flex items-center gap-1.5 font-semibold text-blue-800">
              <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              {fromCache ? 'Cached Gemini AI' : 'Gemini AI'}
            </span>
            {modelUsed && (
              <>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <span className="font-mono text-[11px] text-slate-500">{modelUsed}</span>
              </>
            )}
            {fromCache && cachedAt && (
              <>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <span className="text-[11px] text-slate-500">
                  Reused verified response from {formatShortTime(cachedAt)}
                </span>
              </>
            )}
          </div>
          {fromCache && onRetryGemini && (
            <button
              type="button"
              onClick={onRetryGemini}
              disabled={regenerating}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-50 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded px-1.5 py-0.5"
            >
              <RefreshCw
                className={`w-3 h-3 ${regenerating ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              Refresh live
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export interface CollapsibleDataGroundingProps {
  generatedBy: 'gemini' | 'fallback';
  fromCache?: boolean;
  cachedAt?: string;
  modelUsed?: string;
  airQuality: AirQualityData | null;
  aqiScale: AQIScaleId;
  dataSourcesUsed?: string[];
  assumptions?: string[];
  disclaimer?: string;
  compact?: boolean;
}

export function CollapsibleDataGrounding({
  generatedBy,
  fromCache = false,
  cachedAt,
  modelUsed,
  airQuality,
  aqiScale,
  dataSourcesUsed,
  assumptions,
  disclaimer,
  compact = false,
}: CollapsibleDataGroundingProps) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  const freshness = airQuality
    ? getDataFreshness(airQuality.timestamp, airQuality.fetchedAt, airQuality.mode)
    : null;

  const dataModeLabel = !airQuality
    ? 'No air-quality dataset loaded'
    : airQuality.mode === 'demo'
      ? 'Demo Scenario (Illustrative — Not Live)'
      : airQuality.mode === 'unavailable'
        ? 'Unavailable (No fabricated values)'
        : airQuality.source.isEstimated
          ? 'Live Modelled Atmospheric Estimate'
          : 'Live Ground Monitoring Station';

  const pollutantsUsed =
    airQuality && airQuality.mode !== 'unavailable'
      ? buildPollutantDetails(airQuality.current)
          .filter((p) => p.value !== null)
          .map((p) => `${p.symbol} ${p.value} ${p.unit}`)
      : [];

  const aiModeLabel =
    generatedBy === 'gemini'
      ? fromCache
        ? `Cached Gemini AI${modelUsed ? ` (${modelUsed})` : ''}${cachedAt ? ` · cached ${formatShortTime(cachedAt)}` : ''}`
        : `Live Gemini AI${modelUsed ? ` (${modelUsed})` : ''}`
      : 'Smart Rule Engine · Template guidance (Fallback mode)';

  const sources = dataSourcesUsed && dataSourcesUsed.length > 0 ? dataSourcesUsed : [];

  return (
    <div
      className={`rounded-lg border border-slate-200 bg-slate-50/70 ${
        compact ? 'text-[11px]' : 'text-xs'
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className={`w-full flex items-center justify-between gap-2 text-left font-semibold text-slate-700 hover:text-slate-900 transition-colors rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
          compact ? 'px-3 py-2 min-h-[34px]' : 'px-4 py-2.5 min-h-[40px]'
        }`}
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          <Database className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
          <span className="truncate">View Data Sources &amp; Grounding</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 shrink-0">
          <span className="hidden sm:inline">{expanded ? 'Hide details' : 'Show details'}</span>
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
          )}
        </span>
      </button>

      {expanded && (
        <div
          id={panelId}
          className={`border-t border-slate-200/90 space-y-3 text-slate-600 ${
            compact ? 'px-3 py-2.5' : 'px-4 py-3.5'
          }`}
        >
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Location
              </dt>
              <dd className="text-slate-800 font-medium">
                {airQuality
                  ? `${airQuality.location.name}${airQuality.location.country ? `, ${airQuality.location.country}` : ''}`
                  : 'No location selected'}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Data Provider &amp; Status
              </dt>
              <dd className="text-slate-800">
                {airQuality?.source.name || 'None'} · {dataModeLabel}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Active AQI Scale
              </dt>
              <dd className="text-slate-800">
                {getScaleDisplayLabel(aqiScale)}
                {aqiScale === 'india_cpcb'
                  ? ' (derived from pollutant breakpoints; not official CPCB CAAQMS)'
                  : ' (distinct from India CPCB NAQI)'}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Reading Timestamp &amp; Freshness
              </dt>
              <dd className="text-slate-800 font-mono tabular-nums">
                {airQuality?.timestamp
                  ? `${new Date(airQuality.timestamp).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })} · ${freshness?.label ?? ''}`
                  : 'Timestamp unavailable'}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Pollutants Grounded
              </dt>
              <dd className="text-slate-800">
                {pollutantsUsed.length > 0
                  ? pollutantsUsed.join(', ')
                  : 'No live pollutant concentrations available'}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Generation Engine
              </dt>
              <dd className="text-slate-800">{aiModeLabel}</dd>
            </div>
          </dl>

          {sources.length > 0 && (
            <div className="pt-2 border-t border-slate-200/80 space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Verified Context Summary Passed to Engine
              </div>
              <ul className="space-y-0.5 list-disc pl-4 text-slate-600">
                {sources.map((item, idx) => (
                  <li key={idx} className="leading-relaxed break-words">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {assumptions && assumptions.length > 0 && (
            <div className="pt-2 border-t border-slate-200/80 space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Assumptions &amp; Limitations
              </div>
              <ul className="space-y-0.5 list-disc pl-4 text-slate-600">
                {assumptions.map((item, idx) => (
                  <li key={idx} className="leading-relaxed break-words">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {disclaimer && (
            <p className="pt-2 border-t border-slate-200/80 text-[11px] text-slate-500 leading-relaxed">
              {disclaimer}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Backward-compatible wrapper exporting compact status bar + collapsible grounding.
 */
interface AiGroundingBannerProps {
  generatedBy: 'gemini' | 'fallback';
  fromCache?: boolean;
  cachedAt?: string;
  modelUsed?: string;
  dataSourcesUsed?: string[];
  airQuality?: AirQualityData | null;
  aqiScale?: AQIScaleId;
  contextChanged?: boolean;
  contextChangedLabel?: string;
  onRegenerate?: () => void;
  regenerating?: boolean;
}

export function AiGroundingBanner({
  generatedBy,
  fromCache,
  cachedAt,
  modelUsed,
  dataSourcesUsed,
  airQuality = null,
  aqiScale = 'us_epa',
  contextChanged = false,
  contextChangedLabel,
  onRegenerate,
  regenerating = false,
}: AiGroundingBannerProps) {
  return (
    <div className="space-y-2.5">
      <AiStatusStrip
        generatedBy={generatedBy}
        fromCache={fromCache}
        cachedAt={cachedAt}
        modelUsed={modelUsed}
        contextChanged={contextChanged}
        contextChangedLabel={contextChangedLabel}
        onRegenerate={onRegenerate}
        regenerating={regenerating}
      />
      <CollapsibleDataGrounding
        generatedBy={generatedBy}
        fromCache={fromCache}
        cachedAt={cachedAt}
        modelUsed={modelUsed}
        airQuality={airQuality}
        aqiScale={aqiScale}
        dataSourcesUsed={dataSourcesUsed}
      />
    </div>
  );
}
