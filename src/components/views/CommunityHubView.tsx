import { useState } from 'react';
import { AlertCircle, Check, Copy, Loader2, RefreshCw, Users } from 'lucide-react';
import { AiGroundingBanner } from '../AiGroundingBanner.tsx';
import { FallbackNoticeBanner } from '../FallbackNoticeBanner.tsx';
import { requestCommunityPlan } from '../../services/api.ts';
import type {
  AirQualityData,
  CommunityPlanResponse,
  CommunitySetting,
} from '../../shared/types.ts';

interface CommunityHubViewProps {
  airQuality: AirQualityData | null;
}

const SETTING_OPTIONS: Array<{
  id: CommunitySetting;
  label: string;
  defaultChallenge: string;
}> = [
  {
    id: 'school',
    label: 'School Campus',
    defaultChallenge:
      'Vehicle idling at morning drop-off gates and managing outdoor sports during severe winter smog days',
  },
  {
    id: 'housing_society',
    label: 'Housing Society',
    defaultChallenge:
      'Winter leaf/refuse burning, backup diesel generator exhaust, and dry courtyard dust sweeping',
  },
  {
    id: 'office',
    label: 'Office / Workplace',
    defaultChallenge:
      'Solo commuter traffic emissions and indoor HVAC filtration readiness during winter pollution spikes',
  },
  {
    id: 'neighborhood_group',
    label: 'Neighborhood Group',
    defaultChallenge:
      'Protecting older residents, coordinating clean-air alerts, and reporting uncovered construction dust',
  },
];

export function CommunityHubView({ airQuality }: CommunityHubViewProps) {
  const [setting, setSetting] = useState<CommunitySetting>('school');
  const [groupSize, setGroupSize] = useState<'under_50' | '50_to_250' | '250_to_1000' | 'over_1000'>(
    '250_to_1000'
  );
  const [primaryChallenge, setPrimaryChallenge] = useState<string>(
    SETTING_OPTIONS[0].defaultChallenge
  );
  const [resourcesAvailable, setResourcesAvailable] = useState<string>(
    'Volunteer parent/resident committee, notice boards, messaging group, modest maintenance budget'
  );
  const [plan, setPlan] = useState<CommunityPlanResponse | null>(null);
  const [generatedContextKey, setGeneratedContextKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const currentContextKey = JSON.stringify({
    loc: airQuality?.location.name ?? null,
    mode: airQuality?.mode ?? null,
    aqi: airQuality?.current.usAqi ?? null,
    setting,
    groupSize,
    challenge: primaryChallenge.trim(),
    resources: resourcesAvailable.trim(),
  });
  const contextChanged = Boolean(
    plan && generatedContextKey && generatedContextKey !== currentContextKey
  );

  function handleSelectSetting(nextSetting: CommunitySetting) {
    setSetting(nextSetting);
    const match = SETTING_OPTIONS.find((s) => s.id === nextSetting);
    if (match) {
      setPrimaryChallenge(match.defaultChallenge);
    }
  }

  async function runGeneration() {
    if (primaryChallenge.trim().length < 3) {
      setError('Please describe the main local air-quality challenge (at least 3 characters).');
      return;
    }

    setLoading(true);
    setError(null);
    setCopied(false);
    const keyAtRequest = currentContextKey;
    try {
      const result = await requestCommunityPlan({
        setting,
        groupSize,
        primaryChallenge: primaryChallenge.trim(),
        resourcesAvailable: resourcesAvailable.trim(),
        airQuality,
      });
      setPlan(result);
      setGeneratedContextKey(keyAtRequest);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate community action plan.');
    } finally {
      setLoading(false);
    }
  }

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    void runGeneration();
  }

  async function handleCopyPlan() {
    if (!plan) return;
    const lines = [
      plan.title,
      `Objective: ${plan.objective}`,
      '',
      'Smog-Day Protocol:',
      ...plan.smogDayProtocol.map(
        (s, i) => `${i + 1}. ${s.title} (${s.owner} · ${s.timeframe}) — ${s.description}`
      ),
      '',
      `Awareness Campaign: ${plan.awarenessCampaign.theme}`,
      `Channels: ${plan.awarenessCampaign.channels.join(', ')}`,
      ...plan.awarenessCampaign.keyMessages.map((m) => `- ${m}`),
      '',
      'Emission Reduction Activities:',
      ...plan.emissionReductionActivities.map(
        (s, i) => `${i + 1}. ${s.title} (${s.owner} · ${s.timeframe}) — ${s.description}`
      ),
      '',
      ...(plan.expectedOutcomes && plan.expectedOutcomes.length > 0
        ? ['Expected Outcomes:', ...plan.expectedOutcomes.map((o) => `- ${o}`), '']
        : []),
      'Measurable Indicators:',
      ...plan.measurableIndicators.map((ind) => `- ${ind}`),
    ];

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard API may be unavailable in restricted contexts
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-slate-900">Community Action Hub</h2>
        <p className="text-sm text-slate-600 max-w-3xl">
          Generate structured smog-day protocols, awareness campaigns, and local emission reduction programs for schools, housing societies, offices, and neighborhoods.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <form
          onSubmit={handleGenerate}
          className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-6 space-y-5"
        >
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-700">Community Setting</span>
            <div
              role="group"
              aria-label="Community setting selector"
              className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg"
            >
              {SETTING_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={setting === opt.id}
                  onClick={() => handleSelectSetting(opt.id)}
                  className={`px-2 py-2 min-h-[38px] text-xs font-medium leading-snug rounded-md transition-colors text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    setting === opt.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="community-size" className="block text-xs font-medium text-slate-700 mb-1.5">
              Approximate Group Size
            </label>
            <select
              id="community-size"
              value={groupSize}
              onChange={(e) =>
                setGroupSize(
                  e.target.value as 'under_50' | '50_to_250' | '250_to_1000' | 'over_1000'
                )
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="under_50">Under 50 people</option>
              <option value="50_to_250">50 – 250 people</option>
              <option value="250_to_1000">250 – 1,000 people</option>
              <option value="over_1000">Over 1,000 people</option>
            </select>
          </div>

          <div>
            <label htmlFor="community-challenge" className="block text-xs font-medium text-slate-700 mb-1.5">
              Primary Local Pollution Challenge
            </label>
            <textarea
              id="community-challenge"
              rows={3}
              maxLength={300}
              required
              value={primaryChallenge}
              onChange={(e) => setPrimaryChallenge(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label htmlFor="community-resources" className="block text-xs font-medium text-slate-700 mb-1.5">
              Available Resources & Channels
            </label>
            <textarea
              id="community-resources"
              rows={2}
              maxLength={300}
              value={resourcesAvailable}
              onChange={(e) => setResourcesAvailable(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Building Action Plan...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Generate Community Plan
              </>
            )}
          </button>
        </form>

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
              <Users className="w-8 h-8 text-slate-400 mx-auto" />
              <h3 className="text-base font-bold text-slate-900">
                Design a Local Clean-Air Initiative
              </h3>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                Choose your setting and describe the main pollution challenge on the left to generate a shareable action plan with clear owners, timeframes, and awareness messaging.
              </p>
            </div>
          )}

          {loading && (
            <div className="space-y-4 animate-pulse" aria-busy="true">
              <div className="h-28 rounded-xl bg-slate-100 border border-slate-200" />
              <div className="h-52 rounded-xl bg-slate-100 border border-slate-200" />
              <div className="h-52 rounded-xl bg-slate-100 border border-slate-200" />
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
                contextChangedLabel={`Your active city (${airQuality?.location.name || 'none'}), setting, or challenge details changed since this plan was generated.`}
                onRegenerate={() => void runGeneration()}
                regenerating={loading}
              />

              <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">{plan.title}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyPlan}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Plan
                      </>
                    )}
                  </button>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">{plan.objective}</p>
              </section>

              {/* Smog-Day Protocol */}
              <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200">
                  <h4 className="text-base font-bold text-slate-900">
                    Immediate Smog-Day Response Protocol
                  </h4>
                </div>
                <div className="divide-y divide-slate-100">
                  {plan.smogDayProtocol.map((step, idx) => (
                    <div key={idx} className="p-6 space-y-1.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-bold text-slate-900">
                          0{idx + 1}. {step.title}
                        </span>
                        <span className="text-xs text-slate-500">
                          {step.owner} · {step.timeframe}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed">{step.description}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Awareness Campaign */}
              <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
                <div>
                  <div className="text-xs font-semibold text-blue-800">Awareness Campaign</div>
                  <h4 className="text-base font-bold text-slate-900 mt-0.5">
                    {plan.awarenessCampaign.theme}
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-3 border-t border-slate-100">
                  <div>
                    <div className="text-xs font-semibold text-slate-700 mb-2">
                      Outreach Channels
                    </div>
                    <ul className="space-y-1.5 text-sm text-slate-700 list-disc pl-5">
                      {plan.awarenessCampaign.channels.map((ch, idx) => (
                        <li key={idx}>{ch}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-700 mb-2">
                      Core Community Messages
                    </div>
                    <ul className="space-y-1.5 text-sm text-slate-700 list-disc pl-5">
                      {plan.awarenessCampaign.keyMessages.map((msg, idx) => (
                        <li key={idx}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>

              {/* Ongoing Emission Reduction Activities */}
              <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200">
                  <h4 className="text-base font-bold text-slate-900">
                    Ongoing Pollution Reduction Activities
                  </h4>
                </div>
                <div className="divide-y divide-slate-100">
                  {plan.emissionReductionActivities.map((act, idx) => (
                    <div key={idx} className="p-6 space-y-1.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-bold text-slate-900">{act.title}</span>
                        <span className="text-xs text-slate-500">
                          {act.owner} · {act.timeframe}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed">{act.description}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Expected Outcomes & Measurable Indicators */}
              <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-6 space-y-5">
                {plan.expectedOutcomes && plan.expectedOutcomes.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-bold text-slate-900">Expected Outcomes</h4>
                    <ul className="space-y-1.5 text-sm text-slate-700 list-disc pl-5">
                      {plan.expectedOutcomes.map((outcome, idx) => (
                        <li key={idx}>{outcome}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-slate-900">
                    Observable & Measurable Indicators
                  </h4>
                  <ul className="space-y-1.5 text-sm text-slate-700 list-disc pl-5">
                    {plan.measurableIndicators.map((ind, idx) => (
                      <li key={idx}>{ind}</li>
                    ))}
                  </ul>
                </div>

                <p className="text-xs text-slate-500 pt-2 border-t border-slate-200">
                  {plan.disclaimer}
                </p>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
