import { useEffect, useRef, useState } from 'react';
import { FlaskConical, MapPin, Search, X } from 'lucide-react';
import { searchCities } from '../services/api.ts';
import { DEMO_SCENARIOS_LIST } from '../shared/demoScenarios.ts';
import { getAQICategory } from '../shared/aqi.ts';
import type { LocationInfo } from '../shared/types.ts';

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLiveLocation: (location: LocationInfo) => void;
  onSelectDemoScenario: (scenarioId: string) => void;
}

export const PRESET_LIVE_CITIES: LocationInfo[] = [
  {
    name: 'New Delhi',
    admin1: 'Delhi',
    country: 'India',
    latitude: 28.6139,
    longitude: 77.209,
    timezone: 'Asia/Kolkata',
  },
  {
    name: 'Lahore',
    admin1: 'Punjab',
    country: 'Pakistan',
    latitude: 31.5204,
    longitude: 74.3587,
    timezone: 'Asia/Karachi',
  },
  {
    name: 'Beijing',
    admin1: 'Beijing',
    country: 'China',
    latitude: 39.9042,
    longitude: 116.4074,
    timezone: 'Asia/Shanghai',
  },
  {
    name: 'London',
    admin1: 'England',
    country: 'United Kingdom',
    latitude: 51.5072,
    longitude: -0.1276,
    timezone: 'Europe/London',
  },
  {
    name: 'Los Angeles',
    admin1: 'California',
    country: 'United States',
    latitude: 34.0522,
    longitude: -118.2437,
    timezone: 'America/Los_Angeles',
  },
  {
    name: 'Milan',
    admin1: 'Lombardy',
    country: 'Italy',
    latitude: 45.4642,
    longitude: 9.19,
    timezone: 'Europe/Rome',
  },
];

export function LocationPickerModal({
  isOpen,
  onClose,
  onSelectLiveLocation,
  onSelectDemoScenario,
}: LocationPickerModalProps) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<LocationInfo[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    searchInputRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchError('Enter at least 2 characters to search for a city.');
      return;
    }
    if (trimmed.length > 100) {
      setSearchError('City query must be 100 characters or fewer.');
      return;
    }

    setSearching(true);
    setSearchError(null);
    setHasSearched(true);
    try {
      const data = await searchCities(trimmed);
      setResults(data.results);
    } catch (err) {
      setResults([]);
      setSearchError(err instanceof Error ? err.message : 'Unable to search cities.');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl bg-white rounded-xl border border-slate-200 shadow-lg max-h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="location-modal-title" className="text-lg font-bold text-slate-900">
              Select City or Demo Scenario
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Query live atmospheric estimates via Open-Meteo (or WAQI if configured), or explore clearly labeled Demo Mode scenarios.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close location selector"
            className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {/* Live City Search */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Search Any City (Live Data)</h3>
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <label htmlFor="city-search-input" className="sr-only">
                  Search city name for live air quality
                </label>
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  id="city-search-input"
                  type="text"
                  maxLength={100}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search city name for live air quality"
                  aria-invalid={Boolean(searchError)}
                  aria-describedby={searchError ? 'city-search-error' : undefined}
                  placeholder="Enter city name (e.g., Delhi, Warsaw, Mexico City, Seattle)..."
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
              <button
                type="submit"
                disabled={searching}
                className="px-4 py-2.5 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
              >
                {searching ? 'Searching...' : 'Search'}
              </button>
            </form>

            {searchError && (
              <p
                id="city-search-error"
                role="alert"
                className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-md px-3 py-2"
              >
                {searchError}
              </p>
            )}

            {results.length > 0 && (
              <div
                aria-live="polite"
                className="border border-slate-200 rounded-lg divide-y divide-slate-100"
              >
                {results.map((loc) => (
                  <button
                    key={`${loc.name}-${loc.latitude}-${loc.longitude}`}
                    type="button"
                    onClick={() => {
                      onSelectLiveLocation(loc);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <MapPin className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />
                      <div className="truncate">
                        <span className="text-sm font-medium text-slate-900">{loc.name}</span>
                        <span className="text-xs text-slate-600 ml-1.5">
                          {[loc.admin1, loc.country].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-slate-600 shrink-0 ml-3">
                      {loc.latitude.toFixed(2)}, {loc.longitude.toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {hasSearched && !searching && !searchError && results.length === 0 && (
              <p role="status" aria-live="polite" className="text-xs text-slate-600">
                No matching cities found for “{query}”. Try a nearby major city name.
              </p>
            )}
          </section>

          {/* Quick Live City Presets */}
          <section className="space-y-3 pt-4 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">Quick Live Cities</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PRESET_LIVE_CITIES.map((city) => (
                <button
                  key={city.name}
                  type="button"
                  onClick={() => {
                    onSelectLiveLocation(city);
                    onClose();
                  }}
                  className="px-3 py-2.5 text-left rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <div className="text-sm font-medium text-slate-900 truncate">{city.name}</div>
                  <div className="text-xs text-slate-600 truncate">{city.country}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Clearly Labeled Demo Scenarios */}
          <section className="space-y-3 pt-4 border-t border-slate-200">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-amber-700" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-900">
                Demo Mode Scenarios (Illustrative — Not Live Data)
              </h3>
            </div>
            <p className="text-xs text-slate-600">
              Use these labeled sample datasets to test severe winter smog advisories or when external data sources are unavailable.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {DEMO_SCENARIOS_LIST.map((sc) => {
                const cat = getAQICategory(sc.usAqi);
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => {
                      onSelectDemoScenario(sc.id);
                      onClose();
                    }}
                    className="p-3 text-left rounded-lg border border-amber-200 bg-amber-50/40 hover:bg-amber-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900">{sc.label}</span>
                      <span className={`text-xs font-mono tabular-nums font-semibold ${cat.textClass}`}>
                        US AQI {sc.usAqi} · {cat.name}
                      </span>
                    </div>
                    <div className="text-xs text-slate-700 mt-1">
                      {sc.city}, {sc.country}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">{sc.summary}</div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
