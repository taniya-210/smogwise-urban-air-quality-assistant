import { useMemo, useRef, useState } from 'react';
import { AlertCircle, Leaf, Loader2, Sparkles } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AiStatusStrip, CollapsibleDataGrounding } from '../AiGroundingBanner.tsx';
import { requestSustainableChoices } from '../../services/api.ts';
import { calculateCommuteImpact, COMMUTE_MODES } from '../../shared/emissions.ts';
import type {
  AirQualityData,
  AQIScaleId,
  CommuteModeId,
  HouseholdProfile,
  SustainableChoicesResponse,
} from '../../shared/types.ts';

interface SustainableImpactViewProps {
  airQuality: AirQualityData | null;
  profile: HouseholdProfile;
  aqiScale: AQIScaleId;
}

const BASELINE_SUSTAINABLE_HABITS = [
  {
    category: 'Public Transit',
    action: 'Shift 2+ weekly commutes to metro, urban rail, or bus',
    urbanBenefit: 'Removes peak-hour tailpipe NO₂ and exhaust PM2.5 along dense commuter arteries.',
    feasibility: 'High where transit corridors exist; park-and-ride works for outer suburbs.',
  },
  {
    category: 'Carpooling',
    action: 'Form a 3-person workplace or school carpool',
    urbanBenefit: 'Cuts per-rider vehicle-kilometers and curbside school/office idling by two-thirds.',
    feasibility: 'Immediate zero-capital option using neighborhood or parent directories.',
  },
  {
    category: 'Reduced Vehicle Use',
    action: 'Combine errands into a single warm-engine trip (trip chaining) and avoid idling > 60s',
    urbanBenefit: 'Cold catalytic converters emit disproportionately higher NOx and hydrocarbons in the first 3–5 km.',
    feasibility: 'Zero cost; saves fuel immediately and reduces local curbside exhaust.',
  },
  {
    category: 'Energy Saving',
    action: 'Seal exterior window/door drafts and moderate winter thermostat setpoints',
    urbanBenefit: 'Reduces household space-heating demand and lowers winter gas/coal power-plant emissions while keeping outdoor smog out.',
    feasibility: 'Low-cost weatherstripping tape delivers both indoor air sealing and energy savings.',
  },
  {
    category: 'Energy Saving',
    action: 'Use electric kettles, induction cooktops, LED lighting, and cold-water laundry',
    urbanBenefit: 'Cuts indoor gas combustion NO₂ and lowers peak winter electricity demand.',
    feasibility: 'High for routine daily tasks with immediate utility-bill benefits.',
  },
];

export function SustainableImpactView({
  airQuality,
  profile,
  aqiScale,
}: SustainableImpactViewProps) {
  const [currentMode, setCurrentMode] = useState<CommuteModeId>(
    profile.commuteMode === 'cycling_walking' || profile.commuteMode === 'remote_work'
      ? 'solo_petrol_car'
      : profile.commuteMode
  );
  const [targetMode, setTargetMode] = useState<CommuteModeId>('metro_rail');
  const [oneWayDistanceKm, setOneWayDistanceKm] = useState<number>(
    profile.commuteDistanceKm > 0 ? profile.commuteDistanceKm : 12
  );
  const [daysPerWeek, setDaysPerWeek] = useState<number>(
    profile.commuteDaysPerWeek > 0 ? profile.commuteDaysPerWeek : 5
  );
  const [weeksPerYear, setWeeksPerYear] = useState<number>(46);
  const [householdGoal, setHouseholdGoal] = useState<string>('');

  const [aiPlan, setAiPlan] = useState<SustainableChoicesResponse | null>(null);
  const [generatedContextKey, setGeneratedContextKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const impact = useMemo(
    () =>
      calculateCommuteImpact({
        currentMode,
        targetMode,
        oneWayDistanceKm,
        daysPerWeek,
        weeksPerYear,
      }),
    [currentMode, targetMode, oneWayDistanceKm, daysPerWeek, weeksPerYear]
  );

  const currentContextKey = JSON.stringify({
    loc: airQuality?.location.name ?? null,
    mode: airQuality?.mode ?? null,
    aqi: airQuality?.current.usAqi ?? null,
    scale: aqiScale,
    currentMode,
    targetMode,
    oneWayDistanceKm,
    daysPerWeek,
    weeksPerYear,
    goal: householdGoal.trim(),
  });
  const contextChanged = Boolean(aiPlan && generatedContextKey && generatedContextKey !== currentContextKey);

  async function runGeneration(forceRefresh = false) {
    if (inFlightRef.current) return;
    if (!impact.valid) {
      setError(impact.error || 'Please enter valid commute calculator values first.');
      return;
    }

    inFlightRef.current = true;
    setLoading(true);
    setError(null);
    const keyAtRequest = currentContextKey;
    try {
      const result = await requestSustainableChoices({
        airQuality,
        profile,
        commuteScenario: {
          currentMode,
          targetMode,
          oneWayDistanceKm,
          daysPerWeek,
          weeksPerYear,
        },
        householdGoal: householdGoal.trim() || undefined,
        aqiScale,
        forceRefresh,
      });
      setAiPlan(result);
      setGeneratedContextKey(keyAtRequest);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to generate AI sustainable choices plan right now.'
      );
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    void runGeneration(false);
  }

  const comparisonData = useMemo(
    () =>
      impact.valid
        ? [
            {
              name: COMMUTE_MODES[currentMode].label,
              kgCo2e: impact.annualCurrentKgCo2e,
              fill: '#0f1d38',
            },
            {
              name: COMMUTE_MODES[targetMode].label,
              kgCo2e: impact.annualTargetKgCo2e,
              fill: '#15803d',
            },
          ]
        : [],
    [impact, currentMode, targetMode]
  );

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-slate-900">AI Sustainable Choices & Impact</h2>
        <p className="text-sm text-slate-600 max-w-3xl">
          Model lower-emission commuting switches using transparent, cited DESNZ/DEFRA factors, then generate a Gemini-powered transit, active-mobility, and energy-saving plan grounded in your location and calculated metrics.
        </p>
      </div>

      {/* Interactive Transparent Calculator */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <h3 className="text-base font-bold text-slate-900">Commute Emissions Calculator</h3>

          <div>
            <label htmlFor="impact-current" className="block text-xs font-medium text-slate-700 mb-1.5">
              Current Commute Mode
            </label>
            <select
              id="impact-current"
              value={currentMode}
              onChange={(e) => setCurrentMode(e.target.value as CommuteModeId)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {Object.values(COMMUTE_MODES).map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.label} ({mode.kgCo2ePerPassengerKm} kg CO₂e/km)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="impact-target" className="block text-xs font-medium text-slate-700 mb-1.5">
              Lower-Emission Alternative
            </label>
            <select
              id="impact-target"
              value={targetMode}
              onChange={(e) => setTargetMode(e.target.value as CommuteModeId)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {Object.values(COMMUTE_MODES).map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.label} ({mode.kgCo2ePerPassengerKm} kg CO₂e/km)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="impact-dist" className="block text-xs font-medium text-slate-700 mb-1.5">
                One-Way (km)
              </label>
              <input
                id="impact-dist"
                type="number"
                min={0.5}
                max={300}
                step={0.5}
                value={oneWayDistanceKm}
                onChange={(e) => setOneWayDistanceKm(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label htmlFor="impact-days" className="block text-xs font-medium text-slate-700 mb-1.5">
                Days / Wk
              </label>
              <input
                id="impact-days"
                type="number"
                min={1}
                max={7}
                value={daysPerWeek}
                onChange={(e) => setDaysPerWeek(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label htmlFor="impact-weeks" className="block text-xs font-medium text-slate-700 mb-1.5">
                Weeks / Yr
              </label>
              <input
                id="impact-weeks"
                type="number"
                min={1}
                max={52}
                value={weeksPerYear}
                onChange={(e) => setWeeksPerYear(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-2 text-xs text-slate-600">
            <div>
              <span className="font-semibold text-slate-800">Local air quality note ({COMMUTE_MODES[targetMode].label}):</span>{' '}
              {COMMUTE_MODES[targetMode].localPollutantNote}
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 space-y-6">
          {!impact.valid ? (
            <div className="p-6 rounded-xl border border-red-200 bg-red-50 text-sm text-red-900">
              {impact.error}
            </div>
          ) : (
            <>
              {/* Key Transparent Numerical Metrics */}
              <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pb-6 border-b border-slate-100">
                  <div>
                    <div className="text-xs text-slate-500">Estimated Annual CO₂e Change</div>
                    <div
                      className={`text-3xl font-extrabold font-mono tabular-nums mt-1 ${
                        impact.annualSavedKgCo2e >= 0 ? 'text-emerald-700' : 'text-amber-800'
                      }`}
                    >
                      {impact.annualSavedKgCo2e >= 0 ? '−' : '+'}
                      {Math.abs(impact.annualSavedKgCo2e).toLocaleString()} kg
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {impact.annualSavedKgCo2e >= 0
                        ? `${impact.percentReduction}% operational CO₂e reduction`
                        : 'Selected alternative has higher factor'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Weekly Savings</div>
                    <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                      {impact.weeklySavedKgCo2e >= 0 ? '−' : '+'}
                      {Math.abs(impact.weeklySavedKgCo2e)} kg
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                      ~{Math.abs(impact.monthlySavedKgCo2e)} kg / month
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Annual Distance Shifted</div>
                    <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                      {impact.annualRoundTripKm.toLocaleString()} km
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Round-trip commute distance
                    </div>
                  </div>
                </div>

                {/* Comparison Chart */}
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-slate-900">
                    Annual Operational Emissions Comparison (kg CO₂e / year)
                  </h4>
                  <div className="h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={comparisonData}
                        layout="vertical"
                        margin={{ top: 6, right: 24, left: 10, bottom: 6 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          axisLine={{ stroke: '#cbd5e1' }}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={125}
                          tick={{ fontSize: 11, fill: '#0f1d38' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          formatter={(val: unknown) => [`${val} kg CO₂e/yr`, 'Annual Emissions']}
                          contentStyle={{
                            backgroundColor: '#ffffff',
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            fontSize: '12px',
                          }}
                        />
                        <Bar dataKey="kgCo2e" radius={[0, 6, 6, 0]} barSize={28}>
                          {comparisonData.map((entry, idx) => (
                            <Cell key={idx} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Transparent Methodology & Formula */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-6 space-y-3">
                <h4 className="text-sm font-bold text-slate-900">
                  Calculation Formula & Stated Assumptions
                </h4>
                <p className="text-xs font-mono bg-white border border-slate-200 rounded-lg p-3 text-slate-800 overflow-x-auto">
                  {impact.formulaDescription}
                </p>
                <ul className="space-y-1.5 text-xs text-slate-600 list-disc pl-5">
                  {impact.assumptions.map((assumption, idx) => (
                    <li key={idx}>{assumption}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Gemini AI Sustainable Lifestyle Generator */}
      <section className="space-y-6">
        <form
          onSubmit={handleGenerate}
          className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
        >
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <Leaf className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                <h3 className="text-base font-bold text-slate-900">
                  Gemini-Powered Sustainable Lifestyle Plan
                </h3>
              </div>
              <p className="text-xs text-slate-600">
                Generates personalized public transport, carpooling, walking/cycling, reduced vehicle-use, and energy-saving recommendations grounded in your active location ({airQuality?.location.name || 'none'}) and calculator results above.
              </p>
              <label htmlFor="sustainable-goal" className="block text-xs font-medium text-slate-700 pt-1">
                Optional Household Sustainability Focus
              </label>
              <input
                id="sustainable-goal"
                type="text"
                maxLength={300}
                value={householdGoal}
                onChange={(e) => setHouseholdGoal(e.target.value)}
                placeholder="e.g., Cut winter heating energy, coordinate a school carpool, and avoid peak-hour driving..."
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !impact.valid}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[42px] text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  Generating Plan...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  {aiPlan ? 'Regenerate AI Plan' : 'Generate AI Sustainable Plan'}
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
            <div className="h-28 rounded-xl bg-slate-100 border border-slate-200" />
            <div className="h-64 rounded-xl bg-slate-100 border border-slate-200" />
          </div>
        )}

        {aiPlan && !loading && (
          <div className="space-y-6">
            <AiStatusStrip
              generatedBy={aiPlan.generatedBy}
              fromCache={aiPlan.fromCache}
              cachedAt={aiPlan.cachedAt}
              modelUsed={aiPlan.modelUsed}
              fallbackReason={aiPlan.fallbackReason}
              errorCategory={aiPlan.errorCategory}
              diagnosticDetail={aiPlan.diagnosticDetail}
              contextChanged={contextChanged}
              contextChangedLabel="Your active city, AQI scale, or commute calculator parameters changed since this plan was generated."
              onRegenerate={() => void runGeneration(false)}
              onRetryGemini={() => void runGeneration(true)}
              regenerating={loading}
            />

            <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
              <h3 className="text-lg font-bold text-slate-900">{aiPlan.headline}</h3>
              <p className="text-sm text-slate-700 leading-relaxed">{aiPlan.summary}</p>
              <div className="p-3.5 rounded-lg bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-950 leading-relaxed">
                <span className="font-semibold">Verified Calculator Context:</span>{' '}
                {aiPlan.calculatedImpactSummary}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {aiPlan.recommendations.map((rec, idx) => (
                <article
                  key={idx}
                  className="rounded-xl border border-slate-200 bg-white p-5 space-y-2.5 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-emerald-800">{rec.category}</div>
                    <h4 className="text-base font-bold text-slate-900">{rec.title}</h4>
                    <p className="text-sm text-slate-800 leading-relaxed">{rec.action}</p>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      <span className="font-semibold text-slate-900">Environmental benefit:</span>{' '}
                      {rec.environmentalBenefit}
                    </p>
                  </div>
                  <div className="pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                    <p>
                      <span className="font-semibold text-slate-700">Smog-day calibration:</span>{' '}
                      {rec.smogConditionNote}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-700">Assumptions &amp; limits:</span>{' '}
                      {rec.assumptionsAndLimits}
                    </p>
                  </div>
                </article>
              ))}
            </div>

            <CollapsibleDataGrounding
              generatedBy={aiPlan.generatedBy}
              fromCache={aiPlan.fromCache}
              cachedAt={aiPlan.cachedAt}
              modelUsed={aiPlan.modelUsed}
              airQuality={airQuality}
              aqiScale={aiPlan.aqiScale ?? aqiScale}
              dataSourcesUsed={aiPlan.dataSourcesUsed}
              assumptions={aiPlan.assumptionsDisclosure}
              disclaimer={aiPlan.disclaimer}
            />
          </div>
        )}
      </section>

      {/* Baseline Practical Low-Emission & Energy-Saving Reference Table */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-base font-bold text-slate-900">
            Reference Transit, Reduced Vehicle-Use & Energy-Saving Habits
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Qualitative urban air-quality and energy co-benefits (numerical savings are shown only where transparently calculated above).
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-6">Category</th>
                <th className="py-3 px-6">Action</th>
                <th className="py-3 px-6">Urban Air-Quality & Energy Co-Benefit</th>
                <th className="py-3 px-6">Practicality</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {BASELINE_SUSTAINABLE_HABITS.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/70">
                  <td className="py-3.5 px-6 text-xs font-semibold text-emerald-800 whitespace-nowrap">
                    {row.category}
                  </td>
                  <td className="py-3.5 px-6 font-medium text-slate-900">{row.action}</td>
                  <td className="py-3.5 px-6 text-slate-700">{row.urbanBenefit}</td>
                  <td className="py-3.5 px-6 text-slate-600">{row.feasibility}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
