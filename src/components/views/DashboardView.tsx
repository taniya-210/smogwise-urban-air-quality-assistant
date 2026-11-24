import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Droplets,
  FlaskConical,
  Info,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Thermometer,
  Wind,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  buildPollutantDetails,
  findSaferOutdoorWindows,
  formatHourLabel,
  getDominantPollutant,
  getHourlyAqiForScale,
  getScaleAQI,
  getScaleDisplayLabel,
  getScaleReferenceTable,
  getScaleShortLabel,
} from '../../shared/aqi.ts';
import type { AirQualityData, AQIScaleId } from '../../shared/types.ts';

interface DashboardViewProps {
  airQuality: AirQualityData | null;
  aqiScale: AQIScaleId;
  loading: boolean;
  onRefresh: () => void;
  onOpenLocationPicker: () => void;
  onSelectDemoScenario: (scenarioId: string) => void;
  onNavigate: (tab: string) => void;
}

type ChartMetric = 'activeAqi' | 'pm25' | 'no2';

export function DashboardView({
  airQuality,
  aqiScale,
  loading,
  onRefresh,
  onOpenLocationPicker,
  onSelectDemoScenario,
  onNavigate,
}: DashboardViewProps) {
  const [chartMetric, setChartMetric] = useState<ChartMetric>('activeAqi');

  const scaleAqi = useMemo(
    () => getScaleAQI(airQuality, aqiScale),
    [airQuality, aqiScale]
  );

  const dominant = useMemo(
    () =>
      airQuality && airQuality.mode !== 'unavailable'
        ? getDominantPollutant(airQuality.current)
        : null,
    [airQuality]
  );

  const saferWindow = useMemo(
    () =>
      airQuality && airQuality.mode !== 'unavailable'
        ? findSaferOutdoorWindows(airQuality.hourly, aqiScale)
        : {
            available: false,
            startLabel: null,
            endLabel: null,
            averageAqi: null,
            peakHourLabel: null,
            peakAqi: null,
            explanation: 'Hourly air quality data is unavailable.',
          },
    [airQuality, aqiScale]
  );

  const pollutants = useMemo(
    () =>
      airQuality && airQuality.mode !== 'unavailable'
        ? buildPollutantDetails(airQuality.current)
        : [],
    [airQuality]
  );

  const chartData = useMemo(
    () =>
      airQuality && airQuality.mode !== 'unavailable'
        ? airQuality.hourly.map((pt) => ({
            label: formatHourLabel(pt.time),
            activeAqi: getHourlyAqiForScale(pt, aqiScale),
            pm25: pt.pm25,
            no2: pt.no2,
          }))
        : [],
    [airQuality, aqiScale]
  );

  const scaleTiers = useMemo(() => getScaleReferenceTable(aqiScale), [aqiScale]);

  if (loading && !airQuality) {
    return (
      <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading air quality dashboard">
        <div className="h-44 rounded-xl bg-slate-100 border border-slate-200" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-80 rounded-xl bg-slate-100 border border-slate-200" />
          <div className="h-80 rounded-xl bg-slate-100 border border-slate-200" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="h-28 rounded-xl bg-slate-100 border border-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  if (!airQuality || airQuality.mode === 'unavailable') {
    return (
      <div className="space-y-6">
        <div className="p-8 rounded-xl border border-slate-200 bg-slate-50/70 max-w-3xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">
                Live Air Quality Data Unavailable
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                {airQuality?.unavailableReason ||
                  'No live air quality readings could be retrieved for the selected location. SmogWise never fabricates live AQI readings or pollutant figures.'}
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={onRefresh}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <RefreshCw className="w-4 h-4" aria-hidden="true" />
                  Retry Live Fetch
                </button>
                <button
                  type="button"
                  onClick={onOpenLocationPicker}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <MapPin className="w-4 h-4" aria-hidden="true" />
                  Try Another City
                </button>
                <button
                  type="button"
                  onClick={() => onSelectDemoScenario('delhi-winter-smog')}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-950 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <FlaskConical className="w-4 h-4" aria-hidden="true" />
                  Load Demo Scenario (Illustrative)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const aqi = scaleAqi.value;
  const cat = scaleAqi.category;
  const scaleLabel = getScaleDisplayLabel(aqiScale);
  const scaleShort = getScaleShortLabel(aqiScale);

  const hasChartData = chartData.some((d) => d[chartMetric] !== null);

  const metricConfig: Record<
    ChartMetric,
    { label: string; unit: string; color: string }
  > = {
    activeAqi: {
      label: aqiScale === 'india_cpcb' ? 'CPCB NAQI' : 'US AQI',
      unit: aqiScale === 'india_cpcb' ? 'NAQI' : 'AQI',
      color: '#1d4ed8',
    },
    pm25: { label: 'PM2.5', unit: 'µg/m³', color: '#15803d' },
    no2: { label: 'NO₂', unit: 'µg/m³', color: '#0f1d38' },
  };

  const meterMax = aqiScale === 'india_cpcb' ? 450 : 350;
  const aqiPercent = aqi !== null ? Math.min(100, Math.round((aqi / meterMax) * 100)) : 0;

  const hasWeather =
    airQuality.weather &&
    (airQuality.weather.temperatureC !== null ||
      airQuality.weather.relativeHumidityPct !== null ||
      airQuality.weather.windSpeedKmh !== null);

  return (
    <div className="space-y-6">
      {/* Severe Smog Alert Banner */}
      {cat.isSevere && aqi !== null && (
        <div
          role="alert"
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border ${cat.surfaceClass} ${cat.borderClass} ${cat.textClass}`}
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold">
                {cat.name} Air Quality Alert ({scaleShort} {aqi})
              </p>
              <p className="text-sm mt-0.5 opacity-90">{cat.shortGuidance}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('health')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white text-slate-900 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 self-start sm:self-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            View Family Health Advisory
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Primary Focal Anchor: Current AQI Overview */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-5 flex flex-col justify-between space-y-5">
            <div>
              <p className="text-xs font-medium text-slate-500">
                {scaleLabel} · {airQuality.location.name}
              </p>
              <div className="flex items-baseline gap-4 mt-2">
                <span className="text-6xl font-extrabold tracking-tight font-mono tabular-nums text-slate-900">
                  {aqi !== null ? aqi : '—'}
                </span>
                <div>
                  <div className={`text-lg font-bold ${cat.textClass}`}>{cat.name}</div>
                  <div className="text-xs font-mono tabular-nums text-slate-500">
                    {aqiScale === 'india_cpcb' ? 'India CPCB Range' : 'US EPA Range'}: {cat.epaRange}
                  </div>
                </div>
              </div>
              <p className="text-sm text-slate-600 mt-3 leading-relaxed">
                {cat.shortGuidance}
              </p>

              {scaleAqi.limitationNote && (
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-600 leading-relaxed">
                  <Info className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{scaleAqi.limitationNote}</span>
                </div>
              )}
            </div>

            {/* Accessible Linear Scale Meter */}
            <div className="space-y-1.5">
              <div
                role="meter"
                aria-label={`${scaleLabel} severity meter`}
                aria-valuemin={0}
                aria-valuemax={meterMax}
                aria-valuenow={aqi ?? 0}
                aria-valuetext={aqi !== null ? `${scaleShort} ${aqi} — ${cat.name}` : 'Reading unavailable'}
                className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden"
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${aqiPercent}%`, backgroundColor: cat.barHex }}
                />
              </div>
              {aqiScale === 'india_cpcb' ? (
                <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-500">
                  <span>0 Good</span>
                  <span>100 Sat</span>
                  <span>200 Mod</span>
                  <span>300 Poor</span>
                  <span>401+ Sev</span>
                </div>
              ) : (
                <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-500">
                  <span>0 Good</span>
                  <span>100 Mod</span>
                  <span>200 Unhealthy</span>
                  <span>301+ Haz</span>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-7 lg:border-l lg:border-slate-200 lg:pl-6 flex flex-col justify-between space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-4 border-b border-slate-100">
              <div>
                <div className="text-xs text-slate-500">
                  {aqiScale === 'india_cpcb' && scaleAqi.dominantSubIndexPollutant
                    ? 'Sub-Index Driver'
                    : 'Dominant Pollutant'}
                </div>
                <div className="text-base font-semibold text-slate-900 font-mono tabular-nums mt-1">
                  {(aqiScale === 'india_cpcb' ? scaleAqi.dominantSubIndexPollutant : null) ??
                    dominant ??
                    'Unavailable'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">
                  {aqiScale === 'india_cpcb' ? 'US EPA AQI (Ref.)' : 'European AQI'}
                </div>
                <div className="text-base font-semibold text-slate-900 font-mono tabular-nums mt-1">
                  {aqiScale === 'india_cpcb'
                    ? airQuality.current.usAqi !== null
                      ? airQuality.current.usAqi
                      : 'Unavailable'
                    : airQuality.current.europeanAqi !== null
                      ? airQuality.current.europeanAqi
                      : 'Unavailable'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Lowest 3-Hr Window</div>
                <div className="text-base font-semibold text-slate-900 font-mono tabular-nums mt-1">
                  {saferWindow.available
                    ? `${saferWindow.startLabel} – ${saferWindow.endLabel}`
                    : 'Unavailable'}
                </div>
              </div>
            </div>

            {hasWeather && airQuality.weather && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-4 border-b border-slate-100 text-xs text-slate-600">
                <span className="font-semibold text-slate-700">Live Weather</span>
                {airQuality.weather.temperatureC !== null && (
                  <span className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-800">
                    <Thermometer className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                    {airQuality.weather.temperatureC}°C
                  </span>
                )}
                {airQuality.weather.relativeHumidityPct !== null && (
                  <span className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-800">
                    <Droplets className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                    {airQuality.weather.relativeHumidityPct}% RH
                  </span>
                )}
                {airQuality.weather.windSpeedKmh !== null && (
                  <span className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-800">
                    <Wind className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                    {airQuality.weather.windSpeedKmh} km/h
                  </span>
                )}
                <span className="text-[11px] text-slate-400 ml-auto">
                  {airQuality.weather.sourceName}
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                <Clock className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                <span>Diurnal Window Analysis</span>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                {saferWindow.explanation}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => onNavigate('routine')}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                Plan Today’s Low-Exposure Routine
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('indoor')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                Indoor Air Checklist
              </button>
              <button
                type="button"
                onClick={() => onNavigate('assistant')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-emerald-800 bg-emerald-50/70 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                Ask SmogWise AI
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive 24-Hour Trend Chart + Active Scale Severity Tiers */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 rounded-xl border border-slate-200 bg-white p-6 flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                24-Hour Air Quality Trend
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Hourly profile for {airQuality.location.name} ({airQuality.location.timezone}) · {scaleLabel}
              </p>
            </div>

            <div
              role="group"
              aria-label="Chart metric selector"
              className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start"
            >
              {(['activeAqi', 'pm25', 'no2'] as ChartMetric[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={chartMetric === m}
                  onClick={() => setChartMetric(m)}
                  className={`px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-md transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    chartMetric === m
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {metricConfig[m].label}
                </button>
              ))}
            </div>
          </div>

          {hasChartData ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="aqAreaFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={metricConfig[chartMetric].color} stopOpacity={0.22} />
                      <stop offset="95%" stopColor={metricConfig[chartMetric].color} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    interval={3}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(val: unknown) => [
                      val !== null && val !== undefined
                        ? `${val} ${metricConfig[chartMetric].unit}`
                        : 'Unavailable',
                      metricConfig[chartMetric].label,
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey={chartMetric}
                    stroke={metricConfig[chartMetric].color}
                    strokeWidth={2}
                    fill="url(#aqAreaFill)"
                    connectNulls
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center rounded-lg bg-slate-50 border border-dashed border-slate-200 p-8 text-sm text-slate-500 text-center">
              Hourly {metricConfig[chartMetric].label} values cannot be computed from the active data source’s available hourly pollutants.
            </div>
          )}
        </div>

        <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {aqiScale === 'india_cpcb' ? 'India CPCB NAQI Tiers' : 'US EPA Severity Tiers'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Color indicators paired with explicit numeric range and category
            </p>
            <div className="mt-4 divide-y divide-slate-100">
              {scaleTiers.map((tier) => {
                const isActive = tier.name === cat.name;
                return (
                  <div
                    key={tier.name}
                    className={`py-2.5 flex items-center justify-between gap-2 text-xs ${
                      isActive ? 'font-semibold text-slate-900' : 'text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: tier.barHex }}
                        aria-hidden="true"
                      />
                      <span className="truncate">{tier.name}</span>
                    </div>
                    <span className="font-mono tabular-nums text-slate-500 shrink-0">
                      {tier.epaRange}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-[11px] text-slate-500 pt-4 border-t border-slate-100 leading-relaxed">
            {airQuality.source.note}
          </p>
        </div>
      </section>

      {/* Pollutant Breakdown Table / Grid */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-bold text-slate-900">Pollutant Concentrations</h3>
          <span className="text-xs text-slate-500">
            Compared against World Health Organization (WHO 2021) guideline thresholds
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pollutants.map((p) => {
            const exceedsWho = p.ratioToWho !== null && p.ratioToWho > 1;
            return (
              <div
                key={p.key}
                className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between gap-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-slate-900">{p.symbol}</div>
                    <div className="text-xs text-slate-500">{p.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold font-mono tabular-nums text-slate-900">
                      {p.value !== null ? p.value : '—'}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500">{p.unit}</div>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-500">{p.whoReference}</span>
                  <span
                    className={`font-mono tabular-nums font-medium shrink-0 ${
                      p.ratioToWho === null
                        ? 'text-slate-400'
                        : exceedsWho
                          ? 'text-amber-800'
                          : 'text-emerald-700'
                    }`}
                  >
                    {p.ratioToWho !== null ? `${p.ratioToWho}× WHO` : 'Unavailable'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
