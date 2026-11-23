import { useState } from 'react';
import { AlertCircle, Loader2, ShieldAlert, Sparkles, Stethoscope } from 'lucide-react';
import { AiGroundingBanner } from '../AiGroundingBanner.tsx';
import { FallbackNoticeBanner } from '../FallbackNoticeBanner.tsx';
import { requestHealthAdvisory } from '../../services/api.ts';
import {
  EPA_AQI_SCALE,
  getFamilyHealthGuidance,
  type FamilyAdvisoryGroup,
} from '../../shared/aqi.ts';
import type {
  AirQualityData,
  HealthAdvisoryAiResponse,
  HouseholdProfile,
} from '../../shared/types.ts';

interface HealthAdvisoryViewProps {
  airQuality: AirQualityData | null;
  profile: HouseholdProfile;
}

function buildContextKey(
  airQuality: AirQualityData | null,
  profile: HouseholdProfile,
  focusNote: string
): string {
  return JSON.stringify({
    loc: airQuality?.location.name ?? null,
    mode: airQuality?.mode ?? null,
    aqi: airQuality?.current.usAqi ?? null,
    ts: airQuality?.timestamp ?? null,
    children: profile.hasChildren,
    older: profile.hasOlderAdults,
    resp: profile.hasRespiratorySensitivity,
    focus: focusNote.trim(),
  });
}

export function HealthAdvisoryView({ airQuality, profile }: HealthAdvisoryViewProps) {
  const aqi = airQuality && airQuality.mode !== 'unavailable' ? airQuality.current.usAqi : null;
  const baseline = getFamilyHealthGuidance(aqi);

  const [selectedGroupId, setSelectedGroupId] = useState<FamilyAdvisoryGroup['id']>('children');
  const [focusNote, setFocusNote] = useState('');
  const [aiAdvisory, setAiAdvisory] = useState<HealthAdvisoryAiResponse | null>(null);
  const [generatedContextKey, setGeneratedContextKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentContextKey = buildContextKey(airQuality, profile, focusNote);
  const contextChanged = Boolean(aiAdvisory && generatedContextKey && generatedContextKey !== currentContextKey);

  const displayGroups = aiAdvisory ? aiAdvisory.groups : baseline.groups;
  const displaySevereWarning = aiAdvisory ? aiAdvisory.severeWarning : baseline.severeWarning;
  const displayDisclaimer = aiAdvisory ? aiAdvisory.medicalDisclaimer : baseline.medicalDisclaimer;

  const activeGroup =
    displayGroups.find((g) => g.id === selectedGroupId) ?? displayGroups[0];

  async function runGeneration() {
    setLoading(true);
    setError(null);
    const keyAtRequest = currentContextKey;
    try {
      const result = await requestHealthAdvisory({
        airQuality,
        profile,
        focusNote: focusNote.trim() || undefined,
      });
      setAiAdvisory(result);
      setGeneratedContextKey(keyAtRequest);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to generate AI family health advisory right now.'
      );
    } finally {
      setLoading(false);
    }
  }

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    void runGeneration();
  }

  function handleTabKeyDown(e: React.KeyboardEvent, idx: number) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const delta = e.key === 'ArrowRight' ? 1 : -1;
    const nextIdx = (idx + delta + displayGroups.length) % displayGroups.length;
    setSelectedGroupId(displayGroups[nextIdx].id);
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-slate-900">AI Family Health Advisory</h2>
        <p className="text-sm text-slate-600 max-w-3xl">
          General public-health precautionary guidance calibrated to the US EPA AQI scale (0–500; distinct from India’s CPCB NAQI scale) and tailored by Google Gemini to your household and active air-quality profile.
        </p>
      </div>

      {/* Gemini Personalization Bar */}
      <form
        onSubmit={handleGenerate}
        className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex-1 space-y-1.5">
            <label
              htmlFor="health-focus-note"
              className="block text-xs font-semibold text-slate-700"
            >
              Optional Household Context for AI Tailoring (Non-Diagnostic)
            </label>
            <input
              id="health-focus-note"
              type="text"
              maxLength={300}
              value={focusNote}
              onChange={(e) => setFocusNote(e.target.value)}
              placeholder="e.g., School-age kids have outdoor soccer practice; grandfather takes a morning walk..."
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <p className="text-xs text-slate-500">
              Active profile: {profile.hasChildren ? 'Children' : 'No children'} ·{' '}
              {profile.hasOlderAdults ? 'Older adults (65+)' : 'No older adults'} ·{' '}
              {profile.hasRespiratorySensitivity
                ? 'Respiratory sensitivity noted'
                : 'No respiratory sensitivity noted'}
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[42px] text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                Generating Advisory...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                {aiAdvisory ? 'Regenerate AI Advisory' : 'Generate AI Family Advisory'}
              </>
            )}
          </button>
        </div>
      </form>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-900"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="space-y-4 animate-pulse" aria-busy="true">
          <div className="h-24 rounded-xl bg-slate-100 border border-slate-200" />
          <div className="h-64 rounded-xl bg-slate-100 border border-slate-200" />
        </div>
      )}

      {!loading && aiAdvisory && (
        <div className="space-y-4">
          {aiAdvisory.generatedBy === 'fallback' && (
            <FallbackNoticeBanner
              reason={aiAdvisory.fallbackReason}
              category={aiAdvisory.errorCategory}
              onRetry={() => void runGeneration()}
              retrying={loading}
            />
          )}

          <AiGroundingBanner
            generatedBy={aiAdvisory.generatedBy}
            dataSourcesUsed={aiAdvisory.dataSourcesUsed}
            contextChanged={contextChanged}
            contextChangedLabel={`Active location (${airQuality?.location.name || 'None'}), AQI, or household context changed since this advisory was generated.`}
            onRegenerate={() => void runGeneration()}
            regenerating={loading}
          />
        </div>
      )}

      {/* Severe Pollution Warning Banner */}
      {!loading && displaySevereWarning && (
        <div
          role="alert"
          className={`p-5 rounded-xl border ${baseline.aqiCategory.surfaceClass} ${baseline.aqiCategory.borderClass} ${baseline.aqiCategory.textClass}`}
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <h3 className="text-base font-bold">Severe Air Pollution Warning</h3>
              <p className="text-sm leading-relaxed">{displaySevereWarning}</p>
            </div>
          </div>
        </div>
      )}

      {/* Current Active Tier Summary + Group Switcher */}
      {!loading && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200">
            <div className="space-y-1">
              <div className="text-xs text-slate-500">
                {aiAdvisory
                  ? aiAdvisory.generatedBy === 'gemini'
                    ? 'AI-Tailored Precautionary Guidance (US EPA AQI Scale)'
                    : 'Template Precautionary Guidance (US EPA AQI Scale)'
                  : 'Baseline US EPA AQI Reference Guidance'}{' '}
                · {airQuality?.location.name || 'No location selected'}
              </div>
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-2xl font-extrabold font-mono tabular-nums text-slate-900">
                  {aqi !== null ? `US EPA AQI ${aqi}` : 'Reading Unavailable'}
                </span>
                <span className={`text-sm font-bold ${baseline.aqiCategory.textClass}`}>
                  {baseline.aqiCategory.name}
                </span>
                <span className="text-xs font-mono text-slate-500">
                  ({baseline.aqiCategory.epaRange})
                </span>
              </div>
              {aiAdvisory?.summary && (
                <p className="text-sm text-slate-700 pt-1 leading-relaxed max-w-2xl">
                  {aiAdvisory.summary}
                </p>
              )}
            </div>

            {/* Interactive Segmented Group Selector */}
            <div
              role="tablist"
              aria-label="Family health advisory groups"
              className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg self-start"
            >
              {displayGroups.map((grp, idx) => (
                <button
                  key={grp.id}
                  id={`health-tab-${grp.id}`}
                  role="tab"
                  type="button"
                  aria-selected={selectedGroupId === grp.id}
                  aria-controls={`health-panel-${grp.id}`}
                  onClick={() => setSelectedGroupId(grp.id)}
                  onKeyDown={(e) => handleTabKeyDown(e, idx)}
                  className={`px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-md transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    selectedGroupId === grp.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {grp.label}
                </button>
              ))}
            </div>
          </div>

          {/* Selected Group Advisory Detail */}
          <div
            id={`health-panel-${activeGroup.id}`}
            role="tabpanel"
            aria-labelledby={`health-tab-${activeGroup.id}`}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            <div className="lg:col-span-5 space-y-4">
              <div>
                <div className="text-xs font-semibold text-slate-500">Risk Overview</div>
                <h3 className="text-lg font-bold text-slate-900 mt-1">{activeGroup.label}</h3>
                <p className="text-sm text-slate-700 mt-1.5 leading-relaxed">
                  {activeGroup.riskSummary}
                </p>
              </div>
              <div className="pt-4 border-t border-slate-100">
                <div className="text-xs font-semibold text-blue-800">Outdoor Activity Guidance</div>
                <p className="text-sm text-slate-800 mt-1 leading-relaxed">
                  {activeGroup.outdoorGuidance}
                </p>
              </div>
            </div>

            <div className="lg:col-span-7 lg:border-l lg:border-slate-200 lg:pl-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2.5">
                <h4 className="text-sm font-bold text-slate-900">Practical Protective Steps</h4>
                <ul className="space-y-2 text-sm text-slate-700 list-disc pl-5">
                  {activeGroup.protectiveSteps.map((step, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {step}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2.5">
                <h4 className="text-sm font-bold text-slate-900">
                  Symptoms to Watch (Consult a Clinician)
                </h4>
                <ul className="space-y-2 text-sm text-slate-700 list-disc pl-5">
                  {activeGroup.watchSigns.map((sign, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {sign}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Complete EPA Reference Table */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-base font-bold text-slate-900">
            US EPA Air Quality Index Reference Scale
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-6">Category</th>
                <th className="py-3 px-4">US AQI Range</th>
                <th className="py-3 px-6">Public-Health Meaning</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {EPA_AQI_SCALE.map((tier) => {
                const isCurrent = tier.name === baseline.aqiCategory.name;
                return (
                  <tr
                    key={tier.name}
                    className={isCurrent ? 'bg-blue-50/50' : 'hover:bg-slate-50/70'}
                  >
                    <td className="py-3 px-6 font-semibold text-slate-900 whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: tier.barHex }}
                          aria-hidden="true"
                        />
                        {tier.name}
                        {isCurrent && (
                          <span className="text-xs font-medium text-blue-700">(Current)</span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {tier.epaRange}
                    </td>
                    <td className="py-3 px-6 text-slate-600">{tier.shortGuidance}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Explicit Non-Diagnostic Medical Disclaimer */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-600 leading-relaxed">
        <Stethoscope className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
        <p>{displayDisclaimer}</p>
      </div>
    </div>
  );
}
