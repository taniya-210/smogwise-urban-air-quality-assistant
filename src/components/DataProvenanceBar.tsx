import { AlertTriangle, Clock, Info, RefreshCw } from 'lucide-react';
import { getDataFreshness, getScaleDisplayLabel } from '../shared/aqi.ts';
import type { AirQualityData, AQIScaleId } from '../shared/types.ts';

interface DataProvenanceBarProps {
  airQuality: AirQualityData | null;
  aqiScale: AQIScaleId;
  loading: boolean;
  onRefresh: () => void;
  onOpenLocationPicker: () => void;
}

function formatReadableTimestamp(iso: string | null): string {
  if (!iso) return 'Timestamp unavailable';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DataProvenanceBar({
  airQuality,
  aqiScale,
  loading,
  onRefresh,
  onOpenLocationPicker,
}: DataProvenanceBarProps) {
  if (!airQuality) return null;

  const freshness = getDataFreshness(
    airQuality.timestamp,
    airQuality.fetchedAt,
    airQuality.mode
  );

  const statusLabel =
    airQuality.mode === 'demo'
      ? 'Demo Mode (Illustrative — Not Live)'
      : airQuality.mode === 'unavailable'
        ? 'Live Data Unavailable'
        : airQuality.source.isEstimated
          ? 'Live Modelled Estimate (Not Official Station)'
          : 'Live Ground Station Reading';

  const activeScaleLabel = getScaleDisplayLabel(aqiScale);
  const scaleSuffix =
    aqiScale === 'india_cpcb'
      ? 'derived from pollutants · not official CPCB CAAQMS'
      : 'distinct from India CPCB NAQI';

  return (
    <div className="space-y-3">
      {airQuality.mode === 'demo' && (
        <div
          role="status"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 text-xs sm:text-sm"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
            <div>
              <span className="font-semibold">Demo Mode Active (Illustrative — Not Live Data):</span>{' '}
              Viewing sample pollutant data for {airQuality.location.name} evaluated on the{' '}
              {activeScaleLabel} scale. These values are not live atmospheric measurements or official
              government station readings.
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenLocationPicker}
            className="px-3.5 py-2 text-xs font-semibold text-amber-950 bg-white border border-amber-300 rounded-md hover:bg-amber-100 transition-colors whitespace-nowrap shrink-0 self-start sm:self-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Switch to Live City
          </button>
        </div>
      )}

      {airQuality.mode === 'live' && freshness.isStale && (
        <div
          role="status"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-xs"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-semibold">Freshness Notice:</span> {freshness.label}. Local smog
              conditions can shift quickly during winter inversions.
            </span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-semibold text-blue-800 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0 self-start sm:self-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Refresh Reading
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 border-b border-slate-200 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
          <span className="font-semibold text-slate-900">
            {airQuality.location.name}
            {airQuality.location.admin1 ? `, ${airQuality.location.admin1}` : ''}
            {airQuality.location.country ? `, ${airQuality.location.country}` : ''}
          </span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span
            className={
              airQuality.mode === 'live'
                ? 'font-semibold text-emerald-700'
                : airQuality.mode === 'demo'
                  ? 'font-semibold text-amber-800'
                  : 'font-semibold text-slate-700'
            }
          >
            {statusLabel}
          </span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span>Provider: {airQuality.source.name}</span>
          {airQuality.mode !== 'unavailable' && (
            <>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span title={scaleSuffix}>
                Scale: <span className="font-medium text-slate-800">{activeScaleLabel}</span>
              </span>
            </>
          )}
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span className="font-mono tabular-nums text-slate-500">
            Reading: {formatReadableTimestamp(airQuality.timestamp)}
          </span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span
            className={`font-mono tabular-nums ${
              freshness.isStale ? 'text-amber-800 font-medium' : 'text-slate-500'
            }`}
          >
            {freshness.label}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {airQuality.mode === 'live' && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900 disabled:opacity-50 transition-colors whitespace-nowrap py-1 px-1.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              Refresh
            </button>
          )}
          <span
            className="hidden 2xl:inline-flex items-center gap-1 text-slate-400"
            title={airQuality.source.note}
          >
            <Info className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              {airQuality.mode === 'demo'
                ? 'Demo sample'
                : airQuality.source.isEstimated
                  ? 'Modelled estimate'
                  : 'Station sensor'}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
