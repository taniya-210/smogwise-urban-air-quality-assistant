import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  CalendarClock,
  HeartPulse,
  Home,
  Leaf,
  MapPin,
  Menu,
  MessageSquare,
  Users,
  X,
} from 'lucide-react';
import { DataProvenanceBar } from './components/DataProvenanceBar.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import {
  LocationPickerModal,
  PRESET_LIVE_CITIES,
} from './components/LocationPickerModal.tsx';
import { SmogWiseBrand } from './components/SmogWiseBrand.tsx';
import { AssistantChatView } from './components/views/AssistantChatView.tsx';
import { CommunityHubView } from './components/views/CommunityHubView.tsx';
import { DashboardView } from './components/views/DashboardView.tsx';
import { HealthAdvisoryView } from './components/views/HealthAdvisoryView.tsx';
import { IndoorAQView } from './components/views/IndoorAQView.tsx';
import { RoutinePlannerView } from './components/views/RoutinePlannerView.tsx';
import { SustainableImpactView } from './components/views/SustainableImpactView.tsx';
import {
  fetchAirQualityForLocation,
  fetchDemoScenarioById,
} from './services/api.ts';
import {
  getScaleAQI,
  getScaleShortLabel,
  isLocationInIndia,
} from './shared/aqi.ts';
import type {
  AirQualityData,
  AQIScaleId,
  HouseholdProfile,
  LocationInfo,
} from './shared/types.ts';

type NavTabId =
  | 'dashboard'
  | 'routine'
  | 'indoor'
  | 'health'
  | 'sustainable'
  | 'community'
  | 'assistant';

const NAV_ITEMS: Array<{
  id: NavTabId;
  label: string;
  icon: typeof Activity;
}> = [
  { id: 'dashboard', label: 'Overview Dashboard', icon: Activity },
  { id: 'routine', label: 'AI Routine Planner', icon: CalendarClock },
  { id: 'indoor', label: 'Indoor Air Quality', icon: Home },
  { id: 'health', label: 'Family Health Advisory', icon: HeartPulse },
  { id: 'sustainable', label: 'Sustainable Choices', icon: Leaf },
  { id: 'community', label: 'Community Action Hub', icon: Users },
  { id: 'assistant', label: 'Gemini AI Assistant', icon: MessageSquare },
];

const DEFAULT_PROFILE: HouseholdProfile = {
  lifestyle: 'family_with_school_kids',
  commuteMode: 'solo_petrol_car',
  commuteDistanceKm: 12,
  commuteDaysPerWeek: 5,
  preferredOutdoorWindow: 'early_morning',
  hasChildren: true,
  hasOlderAdults: false,
  hasRespiratorySensitivity: false,
  cookingFuel: 'gas_stove',
  hasAirPurifier: false,
  hasRangeHoodExhaust: true,
  buildingType: 'apartment',
  notes: '',
};

const PROFILE_STORAGE_KEY = 'smogwise_household_profile_v1';
const LOCATION_STORAGE_KEY = 'smogwise_last_location_v1';
const SCALE_SESSION_KEY = 'smogwise_aqi_scale_session_v1';
const SCALE_MANUAL_SESSION_KEY = 'smogwise_aqi_scale_manual_v1';

function loadStoredProfile(): HouseholdProfile {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PROFILE;
  }
}

function loadStoredLocation(): LocationInfo {
  try {
    const raw = localStorage.getItem(LOCATION_STORAGE_KEY);
    if (!raw) return PRESET_LIVE_CITIES[0];
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.name === 'string' &&
      typeof parsed.latitude === 'number' &&
      typeof parsed.longitude === 'number'
    ) {
      return parsed;
    }
    return PRESET_LIVE_CITIES[0];
  } catch {
    return PRESET_LIVE_CITIES[0];
  }
}

function loadInitialScale(initialLocation: LocationInfo): {
  scale: AQIScaleId;
  manuallySelected: boolean;
} {
  try {
    const saved = sessionStorage.getItem(SCALE_SESSION_KEY);
    const manual = sessionStorage.getItem(SCALE_MANUAL_SESSION_KEY) === 'true';
    if (saved === 'us_epa' || saved === 'india_cpcb') {
      return { scale: saved, manuallySelected: manual };
    }
  } catch {
    // Ignore sessionStorage restrictions
  }
  return {
    scale: isLocationInIndia(initialLocation) ? 'india_cpcb' : 'us_epa',
    manuallySelected: false,
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTabId>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);

  const [selectedLocation, setSelectedLocation] = useState<LocationInfo>(loadStoredLocation);
  const [scaleState, setScaleState] = useState<{
    scale: AQIScaleId;
    manuallySelected: boolean;
  }>(() => loadInitialScale(loadStoredLocation()));

  const aqiScale = scaleState.scale;

  const [airQuality, setAirQuality] = useState<AirQualityData | null>(null);
  const [aqLoading, setAqLoading] = useState<boolean>(true);
  const [profile, setProfile] = useState<HouseholdProfile>(loadStoredProfile);

  const handleSelectAqiScale = useCallback((nextScale: AQIScaleId) => {
    setScaleState({ scale: nextScale, manuallySelected: true });
    try {
      sessionStorage.setItem(SCALE_SESSION_KEY, nextScale);
      sessionStorage.setItem(SCALE_MANUAL_SESSION_KEY, 'true');
    } catch {
      // Ignore storage errors
    }
  }, []);

  const syncScaleForLocation = useCallback((location: LocationInfo) => {
    setScaleState((prev) => {
      if (prev.manuallySelected) return prev;
      const defaultScale: AQIScaleId = isLocationInIndia(location) ? 'india_cpcb' : 'us_epa';
      try {
        sessionStorage.setItem(SCALE_SESSION_KEY, defaultScale);
      } catch {
        // Ignore storage errors
      }
      return { scale: defaultScale, manuallySelected: false };
    });
  }, []);

  const loadLiveAirQuality = useCallback(
    async (location: LocationInfo, refresh = false) => {
      setAqLoading(true);
      try {
        const data = await fetchAirQualityForLocation(location, { refresh });
        setAirQuality(data);
        syncScaleForLocation(data.location);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to fetch air quality data.';
        setAirQuality({
          location,
          mode: 'unavailable',
          source: {
            name: 'Unavailable',
            provider: 'none',
            isEstimated: false,
            note: 'Could not connect to backend air quality service.',
          },
          timestamp: null,
          fetchedAt: new Date().toISOString(),
          current: {
            usAqi: null,
            europeanAqi: null,
            pm25: null,
            pm10: null,
            no2: null,
            o3: null,
            so2: null,
            co: null,
          },
          hourly: [],
          unavailableReason: message,
        });
      } finally {
        setAqLoading(false);
      }
    },
    [syncScaleForLocation]
  );

  useEffect(() => {
    void loadLiveAirQuality(selectedLocation, false);
  }, [selectedLocation, loadLiveAirQuality]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  function handleSelectLiveLocation(location: LocationInfo) {
    // Clone so selecting the same preset city after viewing a Demo Scenario always triggers a live fetch
    const nextLocation: LocationInfo = { ...location };
    setSelectedLocation(nextLocation);
    syncScaleForLocation(nextLocation);
    try {
      localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(nextLocation));
    } catch {
      // Ignore storage quota errors
    }
  }

  async function handleSelectDemoScenario(scenarioId: string) {
    setAqLoading(true);
    try {
      const demoData = await fetchDemoScenarioById(scenarioId);
      setAirQuality(demoData);
      syncScaleForLocation(demoData.location);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load demo scenario.';
      setAirQuality({
        location: selectedLocation,
        mode: 'unavailable',
        source: {
          name: 'Unavailable',
          provider: 'none',
          isEstimated: false,
          note: 'Demo scenario fetch failed.',
        },
        timestamp: null,
        fetchedAt: new Date().toISOString(),
        current: {
          usAqi: null,
          europeanAqi: null,
          pm25: null,
          pm10: null,
          no2: null,
          o3: null,
          so2: null,
          co: null,
        },
        hourly: [],
        unavailableReason: message,
      });
    } finally {
      setAqLoading(false);
    }
  }

  function handleUpdateProfile(patch: Partial<HouseholdProfile>) {
    setProfile((prev) => {
      const updated = { ...prev, ...patch };
      try {
        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Ignore storage quota errors
      }
      return updated;
    });
  }

  function handleNavigate(tab: string) {
    const valid = NAV_ITEMS.some((item) => item.id === tab);
    if (valid) {
      setActiveTab(tab as NavTabId);
      setMobileMenuOpen(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  const activeNavMeta = NAV_ITEMS.find((n) => n.id === activeTab) ?? NAV_ITEMS[0];
  const scaleAqi = getScaleAQI(airQuality, aqiScale);
  const aqiCat = scaleAqi.category;

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200 shrink-0">
        <button
          type="button"
          onClick={() => handleNavigate('dashboard')}
          aria-label="SmogWise — Go to Overview Dashboard"
          className="flex items-center text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-md py-1"
        >
          <SmogWiseBrand variant="lockup" />
        </button>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto" aria-label="Primary navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 min-h-[42px] rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Active Location Summary Footer inside Sidebar */}
      <div className="p-4 border-t border-slate-200 space-y-2">
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>Active Location</span>
          <span className="font-medium text-slate-600">
            {aqiScale === 'india_cpcb' ? 'India CPCB' : 'US EPA'}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-sm font-bold text-slate-900 truncate">
            {airQuality?.location.name || selectedLocation.name}
          </div>
          <div className={`text-xs font-mono tabular-nums font-semibold shrink-0 ${aqiCat.textClass}`}>
            {scaleAqi.value !== null ? `${aqiScale === 'india_cpcb' ? 'NAQI' : 'AQI'} ${scaleAqi.value}` : 'No data'}
          </div>
        </div>
        <div className="text-xs text-slate-500 truncate">
          {airQuality?.mode === 'demo'
            ? `Demo Mode · ${aqiCat.name}`
            : airQuality?.mode === 'live'
              ? aqiCat.name
              : 'Live data unavailable'}
        </div>
        <button
          type="button"
          onClick={() => {
            setMobileMenuOpen(false);
            setLocationModalOpen(true);
          }}
          className="w-full mt-1 px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          Change City / Demo Mode
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white text-slate-900 flex">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-slate-900 focus:text-white focus:text-sm focus:font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        Skip to main content
      </a>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div
            className="fixed inset-0 bg-slate-950/40"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[82vw] h-full z-10">{sidebarContent}</aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="min-h-16 py-2 px-4 sm:px-8 border-b border-slate-200 bg-white sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => handleNavigate('dashboard')}
              aria-label="SmogWise Home"
              className="lg:hidden shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <SmogWiseBrand variant="icon" />
            </button>

            <div className="flex items-center gap-2 text-sm min-w-0 truncate">
              <span className="font-semibold text-slate-500 hidden md:inline">SmogWise</span>
              <span className="text-slate-300 hidden md:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-bold text-slate-900 truncate">{activeNavMeta.label}</h1>
            </div>
          </div>

          {/* Right Controls: AQI Scale Selector + Active City Picker */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 ml-auto">
            <div
              role="group"
              aria-label="AQI scale selection"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5"
            >
              <button
                type="button"
                onClick={() => handleSelectAqiScale('us_epa')}
                aria-pressed={aqiScale === 'us_epa'}
                title="US EPA AQI (0–500)"
                className={`px-2.5 py-1.5 min-h-[32px] text-[11px] sm:text-xs font-semibold rounded-md transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  aqiScale === 'us_epa'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900 border border-transparent'
                }`}
              >
                US EPA
              </button>
              <button
                type="button"
                onClick={() => handleSelectAqiScale('india_cpcb')}
                aria-pressed={aqiScale === 'india_cpcb'}
                title="India CPCB NAQI (0–500, calculated from pollutant breakpoints)"
                className={`px-2.5 py-1.5 min-h-[32px] text-[11px] sm:text-xs font-semibold rounded-md transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  aqiScale === 'india_cpcb'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900 border border-transparent'
                }`}
              >
                India CPCB
              </button>
            </div>

            <button
              type="button"
              onClick={() => setLocationModalOpen(true)}
              aria-label={`Change active city or demo scenario, currently ${airQuality?.location.name || selectedLocation.name}, scale ${getScaleShortLabel(aqiScale)}`}
              className="inline-flex items-center gap-2 px-3 sm:px-3.5 py-2 min-h-[38px] text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
            >
              <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="max-w-[110px] sm:max-w-[140px] truncate">
                {airQuality?.location.name || selectedLocation.name}
              </span>
            </button>
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 w-full max-w-[1200px] mx-auto px-4 sm:px-8 py-6 space-y-6 focus:outline-none"
        >
          <div role="status" aria-live="polite" className="sr-only">
            {aqLoading
              ? `Loading air quality data for ${selectedLocation.name}.`
              : `${airQuality?.location.name || selectedLocation.name}, ${getScaleShortLabel(aqiScale)}${scaleAqi.value !== null ? ` ${scaleAqi.value}, ${aqiCat.name}` : ', reading unavailable'}.`}
          </div>

          <DataProvenanceBar
            airQuality={airQuality}
            aqiScale={aqiScale}
            loading={aqLoading}
            onRefresh={() => void loadLiveAirQuality(selectedLocation, true)}
            onOpenLocationPicker={() => setLocationModalOpen(true)}
          />

          <ErrorBoundary resetKey={activeTab} sectionLabel={activeNavMeta.label}>
            {activeTab === 'dashboard' && (
              <DashboardView
                airQuality={airQuality}
                aqiScale={aqiScale}
                loading={aqLoading}
                onRefresh={() => void loadLiveAirQuality(selectedLocation, true)}
                onOpenLocationPicker={() => setLocationModalOpen(true)}
                onSelectDemoScenario={(id) => void handleSelectDemoScenario(id)}
                onNavigate={handleNavigate}
              />
            )}

            {activeTab === 'routine' && (
              <RoutinePlannerView
                airQuality={airQuality}
                aqiScale={aqiScale}
                profile={profile}
                onUpdateProfile={handleUpdateProfile}
              />
            )}

            {activeTab === 'indoor' && (
              <IndoorAQView
                airQuality={airQuality}
                aqiScale={aqiScale}
                profile={profile}
                onUpdateProfile={handleUpdateProfile}
              />
            )}

            {activeTab === 'health' && (
              <HealthAdvisoryView
                airQuality={airQuality}
                aqiScale={aqiScale}
                profile={profile}
              />
            )}

            {activeTab === 'sustainable' && (
              <SustainableImpactView
                airQuality={airQuality}
                aqiScale={aqiScale}
                profile={profile}
              />
            )}

            {activeTab === 'community' && (
              <CommunityHubView airQuality={airQuality} aqiScale={aqiScale} />
            )}

            {activeTab === 'assistant' && (
              <AssistantChatView
                airQuality={airQuality}
                aqiScale={aqiScale}
                profile={profile}
              />
            )}
          </ErrorBoundary>
        </main>

        <footer className="mt-12 border-t border-slate-200 px-4 sm:px-8 py-5 text-xs text-slate-500">
          <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <span>SmogWise – Your Urban Air Quality Companion</span>
            <span>
              Air quality readings are sourced transparently from Open-Meteo / WAQI or clearly marked Demo Scenarios. General guidance does not replace medical care.
            </span>
          </div>
        </footer>
      </div>

      <LocationPickerModal
        isOpen={locationModalOpen}
        onClose={() => setLocationModalOpen(false)}
        onSelectLiveLocation={handleSelectLiveLocation}
        onSelectDemoScenario={(id) => void handleSelectDemoScenario(id)}
      />
    </div>
  );
}
