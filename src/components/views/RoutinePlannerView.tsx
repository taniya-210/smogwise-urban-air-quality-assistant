import { useState } from 'react';
import { AlertCircle, CalendarClock, Loader2, RefreshCw } from 'lucide-react';
import { AiGroundingBanner } from '../AiGroundingBanner.tsx';
import { FallbackNoticeBanner } from '../FallbackNoticeBanner.tsx';
import { requestRoutinePlan } from '../../services/api.ts';
import { COMMUTE_MODES } from '../../shared/emissions.ts';
import type {
  AirQualityData,
  CommuteModeId,
  HouseholdProfile,
  RoutinePlanResponse,
} from '../../shared/types.ts';

interface RoutinePlannerViewProps {
  airQuality: AirQualityData | null;
  profile: HouseholdProfile;
  onUpdateProfile: (patch: Partial<HouseholdProfile>) => void;
}

export function RoutinePlannerView({
  airQuality,
  profile,
  onUpdateProfile,
}: RoutinePlannerViewProps) {
  const [plan, setPlan] = useState<RoutinePlanResponse | null>(null);
  const [generatedContextKey, setGeneratedContextKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentContextKey = JSON.stringify({
    loc: airQuality?.location.name ?? null,
    mode: airQuality?.mode ?? null,
    aqi: airQuality?.current.usAqi ?? null,
    lifestyle: profile.lifestyle,
    commuteMode: profile.commuteMode,
    dist: profile.commuteDistanceKm,
    days: profile.commuteDaysPerWeek,
    win: profile.preferredOutdoorWindow,
    ch: profile.hasChildren,
    old: profile.hasOlderAdults,
    resp: profile.hasRespiratorySensitivity,
    notes: profile.notes.trim(),
  });
  const contextChanged = Boolean(plan && generatedContextKey && generatedContextKey !== currentContextKey);

  async function runGeneration() {
    setLoading(true);
    setError(null);
    const keyAtRequest = currentContextKey;
    try {
      const result = await requestRoutinePlan(airQuality, profile);
      setPlan(result);
      setGeneratedContextKey(keyAtRequest);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate daily routine.');
    } finally {
      setLoading(false);
    }
  }

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    void runGeneration();
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-slate-900">AI Daily Routine Planner</h2>
        <p className="text-sm text-slate-600 max-w-3xl">
          Tailor outdoor windows, commute choices, and family routines to your active location’s air quality and household needs.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Profile Input Form */}
        <form
          onSubmit={handleGenerate}
          className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-6 space-y-5"
        >
          <div>
            <h3 className="text-base font-bold text-slate-900">Your Daily Profile</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Changes are saved locally in your browser and shared with Indoor Air & Assistant tools.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="routine-lifestyle" className="block text-xs font-medium text-slate-700 mb-1.5">
                Primary Routine Type
              </label>
              <select
                id="routine-lifestyle"
                value={profile.lifestyle}
                onChange={(e) =>
                  onUpdateProfile({
                    lifestyle: e.target.value as HouseholdProfile['lifestyle'],
                  })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="office_commuter">Daily Office Commuter</option>
                <option value="family_with_school_kids">Family with School-Age Children</option>
                <option value="remote_worker">Remote / Hybrid Worker</option>
                <option value="active_outdoor">Regular Outdoor Runner / Cyclist</option>
                <option value="retired_senior">Older Adult / Home-Based Schedule</option>
              </select>
            </div>

            <div>
              <label htmlFor="routine-commute" className="block text-xs font-medium text-slate-700 mb-1.5">
                Primary Commute Mode
              </label>
              <select
                id="routine-commute"
                value={profile.commuteMode}
                onChange={(e) =>
                  onUpdateProfile({ commuteMode: e.target.value as CommuteModeId })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {Object.values(COMMUTE_MODES).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="routine-distance" className="block text-xs font-medium text-slate-700 mb-1.5">
                  One-Way Distance (km)
                </label>
                <input
                  id="routine-distance"
                  type="number"
                  min={0}
                  max={250}
                  step={0.5}
                  value={profile.commuteDistanceKm}
                  onChange={(e) =>
                    onUpdateProfile({
                      commuteDistanceKm: Math.max(0, Math.min(250, Number(e.target.value) || 0)),
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label htmlFor="routine-days" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Days / Week
                </label>
                <input
                  id="routine-days"
                  type="number"
                  min={0}
                  max={7}
                  value={profile.commuteDaysPerWeek}
                  onChange={(e) =>
                    onUpdateProfile({
                      commuteDaysPerWeek: Math.max(0, Math.min(7, Number(e.target.value) || 0)),
                    })
                  }
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div>
              <label htmlFor="routine-window" className="block text-xs font-medium text-slate-700 mb-1.5">
                Preferred Outdoor Activity Window
              </label>
              <select
                id="routine-window"
                value={profile.preferredOutdoorWindow}
                onChange={(e) =>
                  onUpdateProfile({
                    preferredOutdoorWindow: e.target.value as HouseholdProfile['preferredOutdoorWindow'],
                  })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="early_morning">Early Morning (6:00 – 9:00)</option>
                <option value="midday">Midday (11:30 – 14:30)</option>
                <option value="late_afternoon">Late Afternoon (15:00 – 17:30)</option>
                <option value="evening">Evening (18:00 – 20:30)</option>
              </select>
            </div>

            <fieldset className="space-y-2 pt-2 border-t border-slate-100">
              <legend className="text-xs font-medium text-slate-700 mb-1">
                Household Considerations
              </legend>
              <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={profile.hasChildren}
                  onChange={(e) => onUpdateProfile({ hasChildren: e.target.checked })}
                  className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                Children in household
              </label>
              <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={profile.hasOlderAdults}
                  onChange={(e) => onUpdateProfile({ hasOlderAdults: e.target.checked })}
                  className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                Older adults (65+) in household
              </label>
              <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={profile.hasRespiratorySensitivity}
                  onChange={(e) =>
                    onUpdateProfile({ hasRespiratorySensitivity: e.target.checked })
                  }
                  className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                Asthma or respiratory sensitivities
              </label>
            </fieldset>

            <div>
              <label htmlFor="routine-notes" className="block text-xs font-medium text-slate-700 mb-1.5">
                Optional Schedule Notes
              </label>
              <textarea
                id="routine-notes"
                rows={2}
                maxLength={350}
                value={profile.notes}
                onChange={(e) => onUpdateProfile({ notes: e.target.value })}
                placeholder="e.g., School drop-off at 7:45 AM, metro station is 1.2 km away..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating Routine...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Generate Personalized Routine
              </>
            )}
          </button>
        </form>

        {/* Routine Output */}
        <div className="lg:col-span-8 space-y-6">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-900"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!plan && !loading && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center space-y-3">
              <CalendarClock className="w-8 h-8 text-slate-400 mx-auto" />
              <h3 className="text-base font-bold text-slate-900">
                Ready to Build Your Smog-Aware Schedule
              </h3>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                Review your commute and household details on the left, then generate a daily plan grounded in{' '}
                {airQuality?.location.name || 'your selected city'}’s active air-quality profile.
              </p>
            </div>
          )}

          {loading && (
            <div className="space-y-4 animate-pulse" aria-busy="true">
              <div className="h-28 rounded-xl bg-slate-100 border border-slate-200" />
              <div className="h-64 rounded-xl bg-slate-100 border border-slate-200" />
              <div className="h-44 rounded-xl bg-slate-100 border border-slate-200" />
            </div>
          )}

          {plan && !loading && (
            <div className="space-y-6">
              {plan.generatedBy === 'fallback' && (
                <FallbackNoticeBanner
                  reason={plan.fallbackReason}
                  category={plan.errorCategory}
                  onRetry={() => void runGeneration()}
                  retrying={loading}
                />
              )}

              <AiGroundingBanner
                generatedBy={plan.generatedBy}
                dataSourcesUsed={plan.dataSourcesUsed}
                contextChanged={contextChanged}
                contextChangedLabel={`Your active city (${airQuality?.location.name || 'none'}), AQI, or daily profile changed since this routine was generated.`}
                onRegenerate={() => void runGeneration()}
                regenerating={loading}
              />

              <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
                <p className="text-base font-semibold text-slate-900 leading-relaxed">
                  {plan.summary}
                </p>
                <div className="pt-3 border-t border-slate-100">
                  <div className="text-xs font-semibold text-emerald-800">
                    Safer Outdoor Timing
                  </div>
                  <p className="text-sm text-slate-700 mt-1 leading-relaxed">
                    {plan.saferOutdoorWindowSummary}
                  </p>
                </div>
              </section>

              {/* Time-Blocked Schedule */}
              <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200">
                  <h3 className="text-base font-bold text-slate-900">
                    Time-Blocked Daily Recommendations
                  </h3>
                </div>
                <div className="divide-y divide-slate-200">
                  {plan.scheduleBlocks.map((block, idx) => (
                    <div key={idx} className="p-6 space-y-2.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="text-sm font-bold font-mono tabular-nums text-blue-800">
                            {block.timeWindow}
                          </span>
                          <span aria-hidden="true" className="text-slate-300">
                            ·
                          </span>
                          <span className="text-sm font-semibold text-slate-900">
                            {block.activity}
                          </span>
                        </div>
                        <span className="text-xs font-medium text-slate-600">
                          Exposure: {block.exposureLevel}
                        </span>
                      </div>
                      <p className="text-sm text-slate-800 leading-relaxed">
                        {block.recommendation}
                      </p>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        <span className="font-semibold text-slate-700">Why it matters:</span>{' '}
                        {block.whyItMatters}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Lower-Emission Commute Alternatives */}
              <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
                <h3 className="text-base font-bold text-slate-900">
                  Lower-Emission Commute Alternatives
                </h3>
                <div className="divide-y divide-slate-100">
                  {plan.commuteAlternatives.map((alt, idx) => (
                    <div key={idx} className="py-3.5 first:pt-0 last:pb-0 space-y-1">
                      <div className="text-sm font-semibold text-slate-900">{alt.option}</div>
                      <p className="text-sm text-slate-600">{alt.feasibilityNote}</p>
                      <p className="text-xs text-emerald-800 font-medium">
                        Air quality impact: {alt.airQualityBenefit}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Practical Low-Emission Daily Habits */}
              {plan.lowEmissionHabits && plan.lowEmissionHabits.length > 0 && (
                <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
                  <h3 className="text-base font-bold text-slate-900">
                    Practical Low-Emission Daily Habits
                  </h3>
                  <ul className="space-y-2 text-sm text-slate-700 list-disc pl-5">
                    {plan.lowEmissionHabits.map((habit, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {habit}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Key Takeaways */}
              {plan.whyItMattersHighlights.length > 0 && (
                <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-6 space-y-2.5">
                  <h3 className="text-sm font-bold text-slate-900">
                    Why These Adjustments Matter
                  </h3>
                  <ul className="space-y-1.5 text-sm text-slate-700 list-disc pl-5">
                    {plan.whyItMattersHighlights.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-slate-500 pt-2 border-t border-slate-200">
                    {plan.disclaimer}
                  </p>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
