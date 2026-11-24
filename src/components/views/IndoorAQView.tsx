import { useRef, useState } from 'react';
import { AlertCircle, Home, Loader2, RefreshCw } from 'lucide-react';
import { AiStatusStrip, CollapsibleDataGrounding } from '../AiGroundingBanner.tsx';
import { requestIndoorGuidance } from '../../services/api.ts';
import type {
  AirQualityData,
  AQIScaleId,
  BuildingType,
  CookingFuelType,
  HouseholdProfile,
  IndoorGuidanceResponse,
} from '../../shared/types.ts';

interface IndoorAQViewProps {
  airQuality: AirQualityData | null;
  aqiScale: AQIScaleId;
  profile: HouseholdProfile;
  onUpdateProfile: (patch: Partial<HouseholdProfile>) => void;
}

export function IndoorAQView({
  airQuality,
  aqiScale,
  profile,
  onUpdateProfile,
}: IndoorAQViewProps) {
  const [guidance, setGuidance] = useState<IndoorGuidanceResponse | null>(null);
  const [generatedContextKey, setGeneratedContextKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const currentContextKey = JSON.stringify({
    loc: airQuality?.location.name ?? null,
    mode: airQuality?.mode ?? null,
    aqi: airQuality?.current.usAqi ?? null,
    scale: aqiScale,
    bldg: profile.buildingType,
    fuel: profile.cookingFuel,
    hood: profile.hasRangeHoodExhaust,
    hepa: profile.hasAirPurifier,
  });
  const contextChanged = Boolean(
    guidance && generatedContextKey && generatedContextKey !== currentContextKey
  );

  async function runGeneration(forceRefresh = false) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setError(null);
    const keyAtRequest = currentContextKey;
    try {
      const result = await requestIndoorGuidance(airQuality, profile, {
        aqiScale,
        forceRefresh,
      });
      setGuidance(result);
      setGeneratedContextKey(keyAtRequest);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate indoor guidance.');
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    void runGeneration(false);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-slate-900">Indoor Air Quality Assistant</h2>
        <p className="text-sm text-slate-600 max-w-3xl">
          Evidence-based guidance for ventilation timing, cooking emissions, dust control, and mechanical filtration—without unsupported purification claims.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <form
          onSubmit={handleGenerate}
          className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-6 space-y-5"
        >
          <div>
            <h3 className="text-base font-bold text-slate-900">Household Setup</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Adapt ventilation and emission control steps to your actual home environment.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="indoor-building" className="block text-xs font-medium text-slate-700 mb-1.5">
                Building &amp; Envelope Type
              </label>
              <select
                id="indoor-building"
                value={profile.buildingType}
                onChange={(e) =>
                  onUpdateProfile({ buildingType: e.target.value as BuildingType })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="apartment">Modern Sealed Apartment</option>
                <option value="detached_house">Detached House / Townhouse</option>
                <option value="older_drafty">Older Building with Drafty Windows</option>
                <option value="office_shared">Shared Indoor Workspace / Studio</option>
              </select>
            </div>

            <div>
              <label htmlFor="indoor-cooking" className="block text-xs font-medium text-slate-700 mb-1.5">
                Primary Cooking Fuel
              </label>
              <select
                id="indoor-cooking"
                value={profile.cookingFuel}
                onChange={(e) =>
                  onUpdateProfile({ cookingFuel: e.target.value as CookingFuelType })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="gas_stove">Gas / LPG Stove</option>
                <option value="electric_induction">Electric / Induction Cooktop</option>
                <option value="biomass_wood">Solid Fuel / Biomass / Wood</option>
                <option value="mixed">Mixed Gas &amp; Electric Appliances</option>
              </select>
            </div>

            <fieldset className="space-y-2.5 pt-2 border-t border-slate-100">
              <legend className="text-xs font-medium text-slate-700 mb-1">
                Ventilation &amp; Filtration Equipment
              </legend>
              <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={profile.hasRangeHoodExhaust}
                  onChange={(e) =>
                    onUpdateProfile({ hasRangeHoodExhaust: e.target.checked })
                  }
                  className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                Ducted kitchen exhaust / range hood
              </label>
              <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={profile.hasAirPurifier}
                  onChange={(e) => onUpdateProfile({ hasAirPurifier: e.target.checked })}
                  className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                True HEPA air purifier available
              </label>
            </fieldset>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                Analyzing Indoor Air...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                Generate Indoor Action Plan
              </>
            )}
          </button>
        </form>

        <div className="lg:col-span-8 space-y-5">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-900"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {!guidance && !loading && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center space-y-3">
              <Home className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
              <h3 className="text-base font-bold text-slate-900">
                Configure Your Home for Tailored Guidance
              </h3>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                Select your building type, cooking fuel, and equipment on the left to receive AQI-calibrated ventilation, cooking, and filtration advice.
              </p>
            </div>
          )}

          {loading && (
            <div className="space-y-4 animate-pulse" aria-busy="true">
              <div className="h-28 rounded-xl bg-slate-100 border border-slate-200" />
              <div className="h-56 rounded-xl bg-slate-100 border border-slate-200" />
              <div className="h-56 rounded-xl bg-slate-100 border border-slate-200" />
            </div>
          )}

          {guidance && !loading && (
            <div className="space-y-5">
              {/* Compact AI Status Strip */}
              <AiStatusStrip
                generatedBy={guidance.generatedBy}
                fromCache={guidance.fromCache}
                cachedAt={guidance.cachedAt}
                modelUsed={guidance.modelUsed}
                fallbackReason={guidance.fallbackReason}
                errorCategory={guidance.errorCategory}
                diagnosticDetail={guidance.diagnosticDetail}
                contextChanged={contextChanged}
                contextChangedLabel={`Your active city (${airQuality?.location.name || 'none'}), AQI scale, or home setup changed since this indoor plan was generated.`}
                onRegenerate={() => void runGeneration(false)}
                onRetryGemini={() => void runGeneration(true)}
                regenerating={loading}
              />

              {/* Ventilation Callout First */}
              <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-2.5">
                <h3 className="text-base font-bold text-slate-900">
                  Ventilation Recommendation: {guidance.ventilationStatus}
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {guidance.ventilationGuidance}
                </p>
              </section>

              {/* Cooking + Cleaning Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
                  <h3 className="text-base font-bold text-slate-900">Cooking Emissions Control</h3>
                  <div className="divide-y divide-slate-100">
                    {guidance.cookingActions.map((item, idx) => (
                      <div key={idx} className="py-3 first:pt-0 last:pb-0 space-y-1">
                        <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                        <p className="text-sm text-slate-700">{item.action}</p>
                        <p className="text-xs text-slate-500">{item.rationale}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
                  <h3 className="text-base font-bold text-slate-900">Dust &amp; Cleaning Practices</h3>
                  <div className="divide-y divide-slate-100">
                    {guidance.cleaningActions.map((item, idx) => (
                      <div key={idx} className="py-3 first:pt-0 last:pb-0 space-y-1">
                        <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                        <p className="text-sm text-slate-700">{item.action}</p>
                        <p className="text-xs text-slate-500">{item.rationale}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {/* Filtration */}
              <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
                <h3 className="text-base font-bold text-slate-900">
                  Mechanical Filtration &amp; Clean-Air Room Strategy
                </h3>
                <div className="divide-y divide-slate-100">
                  {guidance.filtrationGuidance.map((item, idx) => (
                    <div key={idx} className="py-3.5 first:pt-0 last:pb-0 space-y-1">
                      <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                      <p className="text-sm text-slate-700">{item.action}</p>
                      <p className="text-xs text-slate-500">{item.rationale}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Evidence-Based Myth Check */}
              <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-6 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Evidence Check: Avoiding Unsupported Air-Cleaning Claims
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Focusing budget and effort strictly on methods validated by building science.
                  </p>
                </div>
                <div className="divide-y divide-slate-200">
                  {guidance.mythCheck.map((m, idx) => (
                    <div key={idx} className="py-3 first:pt-0 last:pb-0 space-y-1">
                      <div className="text-sm font-semibold text-slate-900">
                        Common claim: “{m.claim}”
                      </div>
                      <p className="text-sm text-slate-700">{m.evidenceReality}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Collapsible Data Grounding Below Actionable Recommendations */}
              <CollapsibleDataGrounding
                generatedBy={guidance.generatedBy}
                fromCache={guidance.fromCache}
                cachedAt={guidance.cachedAt}
                modelUsed={guidance.modelUsed}
                airQuality={airQuality}
                aqiScale={guidance.aqiScale ?? aqiScale}
                dataSourcesUsed={guidance.dataSourcesUsed}
                disclaimer={guidance.disclaimer}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
