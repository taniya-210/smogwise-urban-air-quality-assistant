import type { AirQualityData, DemoScenarioSummary, HourlyAirQualityPoint } from './types.ts';

function buildDemoHourlyCurve(
  datePrefix: string,
  baseAqi: number,
  basePm25: number,
  basePm10: number,
  baseNo2: number,
  baseO3: number,
  winterInversionShape: boolean
): HourlyAirQualityPoint[] {
  // Realistic winter diurnal pattern: higher morning/late-evening inversion trapping, lower afternoon mixing
  const factors = winterInversionShape
    ? [
        1.14, 1.12, 1.08, 1.05, 1.06, 1.11, 1.18, 1.22, 1.16, 1.02, 0.88, 0.78,
        0.72, 0.69, 0.71, 0.76, 0.85, 0.98, 1.10, 1.19, 1.24, 1.22, 1.18, 1.15,
      ]
    : [
        0.88, 0.86, 0.84, 0.82, 0.85, 0.90, 0.96, 1.05, 1.08, 1.02, 0.95, 0.92,
        0.94, 0.98, 1.02, 1.04, 1.06, 1.10, 1.05, 0.98, 0.94, 0.90, 0.88, 0.86,
      ];

  return factors.map((f, hour) => {
    const hh = String(hour).padStart(2, '0');
    const o3Factor = hour >= 12 && hour <= 17 ? 1.35 : 0.75;
    return {
      time: `${datePrefix}T${hh}:00`,
      usAqi: Math.round(baseAqi * f),
      pm25: Number((basePm25 * f).toFixed(1)),
      pm10: Number((basePm10 * f).toFixed(1)),
      no2: Number((baseNo2 * f).toFixed(1)),
      o3: Number((baseO3 * o3Factor).toFixed(1)),
    };
  });
}

const DEMO_SCENARIOS_MAP: Record<string, () => AirQualityData> = {
  'delhi-winter-smog': () => ({
    location: {
      name: 'New Delhi',
      admin1: 'Delhi',
      country: 'India',
      latitude: 28.6139,
      longitude: 77.209,
      timezone: 'Asia/Kolkata',
    },
    mode: 'demo',
    demoScenarioId: 'delhi-winter-smog',
    source: {
      name: 'Demo Scenario — Severe Winter Inversion (Illustrative, Not Live)',
      provider: 'demo',
      isEstimated: true,
      aqiScale: 'US EPA AQI (0–500)',
      note: 'Illustrative sample dataset simulating a severe northern winter thermal inversion episode. Not a live sensor reading or official CPCB index.',
    },
    timestamp: '2026-11-23T08:00',
    fetchedAt: new Date().toISOString(),
    current: {
      usAqi: 312,
      europeanAqi: 185,
      pm25: 238.4,
      pm10: 364.0,
      no2: 68.5,
      o3: 32.0,
      so2: 18.2,
      co: 1940,
    },
    hourly: buildDemoHourlyCurve('2026-11-23', 280, 210, 320, 62, 34, true),
  }),
  'lahore-haze': () => ({
    location: {
      name: 'Lahore',
      admin1: 'Punjab',
      country: 'Pakistan',
      latitude: 31.5204,
      longitude: 74.3587,
      timezone: 'Asia/Karachi',
    },
    mode: 'demo',
    demoScenarioId: 'lahore-haze',
    source: {
      name: 'Demo Scenario — Very Unhealthy Urban Smog (Illustrative, Not Live)',
      provider: 'demo',
      isEstimated: true,
      aqiScale: 'US EPA AQI (0–500)',
      note: 'Illustrative sample dataset simulating persistent winter particulate haze. Not a live sensor reading.',
    },
    timestamp: '2026-11-23T08:00',
    fetchedAt: new Date().toISOString(),
    current: {
      usAqi: 248,
      europeanAqi: 152,
      pm25: 174.2,
      pm10: 268.5,
      no2: 59.4,
      o3: 28.6,
      so2: 21.0,
      co: 1620,
    },
    hourly: buildDemoHourlyCurve('2026-11-23', 225, 155, 240, 54, 30, true),
  }),
  'beijing-moderate': () => ({
    location: {
      name: 'Beijing',
      admin1: 'Beijing',
      country: 'China',
      latitude: 39.9042,
      longitude: 116.4074,
      timezone: 'Asia/Shanghai',
    },
    mode: 'demo',
    demoScenarioId: 'beijing-moderate',
    source: {
      name: 'Demo Scenario — Moderate Winter Commute (Illustrative, Not Live)',
      provider: 'demo',
      isEstimated: true,
      aqiScale: 'US EPA AQI (0–500)',
      note: 'Illustrative sample dataset showing moderate winter particulate levels with midday clearing. Not a live sensor reading.',
    },
    timestamp: '2026-11-23T08:00',
    fetchedAt: new Date().toISOString(),
    current: {
      usAqi: 88,
      europeanAqi: 54,
      pm25: 29.4,
      pm10: 52.8,
      no2: 34.1,
      o3: 48.0,
      so2: 9.5,
      co: 620,
    },
    hourly: buildDemoHourlyCurve('2026-11-23', 82, 26, 48, 31, 46, true),
  }),
  'london-clean': () => ({
    location: {
      name: 'London',
      admin1: 'England',
      country: 'United Kingdom',
      latitude: 51.5072,
      longitude: -0.1276,
      timezone: 'Europe/London',
    },
    mode: 'demo',
    demoScenarioId: 'london-clean',
    source: {
      name: 'Demo Scenario — Good Breezy Urban Day (Illustrative, Not Live)',
      provider: 'demo',
      isEstimated: true,
      aqiScale: 'US EPA AQI (0–500)',
      note: 'Illustrative sample dataset simulating well-dispersed coastal winter air. Not a live sensor reading.',
    },
    timestamp: '2026-11-23T08:00',
    fetchedAt: new Date().toISOString(),
    current: {
      usAqi: 34,
      europeanAqi: 24,
      pm25: 7.4,
      pm10: 14.2,
      no2: 18.6,
      o3: 54.0,
      so2: 3.1,
      co: 260,
    },
    hourly: buildDemoHourlyCurve('2026-11-23', 34, 7.4, 14.2, 18.6, 54, false),
  }),
};

export const DEMO_SCENARIOS_LIST: DemoScenarioSummary[] = [
  {
    id: 'delhi-winter-smog',
    label: 'Severe Winter Inversion',
    city: 'New Delhi',
    country: 'India',
    summary: 'Hazardous particulate trapping (US AQI 312)',
    usAqi: 312,
  },
  {
    id: 'lahore-haze',
    label: 'Very Unhealthy Haze',
    city: 'Lahore',
    country: 'Pakistan',
    summary: 'Persistent winter smog episode (US AQI 248)',
    usAqi: 248,
  },
  {
    id: 'beijing-moderate',
    label: 'Moderate Urban Day',
    city: 'Beijing',
    country: 'China',
    summary: 'Mild morning haze with midday clearing (US AQI 88)',
    usAqi: 88,
  },
  {
    id: 'london-clean',
    label: 'Good Urban Air',
    city: 'London',
    country: 'United Kingdom',
    summary: 'Well-dispersed air quality (US AQI 34)',
    usAqi: 34,
  },
];

export function getDemoScenario(scenarioId: string): AirQualityData | null {
  const factory = DEMO_SCENARIOS_MAP[scenarioId];
  return factory ? factory() : null;
}
