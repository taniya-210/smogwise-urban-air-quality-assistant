import type {
  AQICategoryName,
  DataMode,
  HourlyAirQualityPoint,
  PollutantReadings,
} from './types.ts';

export interface DataFreshnessInfo {
  status: 'fresh' | 'recent' | 'stale' | 'demo' | 'unavailable';
  label: string;
  ageMinutes: number | null;
  isStale: boolean;
}

export interface AQICategoryMeta {
  name: AQICategoryName;
  level: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  epaRange: string;
  shortGuidance: string;
  isSevere: boolean;
  /** Semantic color tokens — always paired with explicit category labels for accessibility */
  textClass: string;
  surfaceClass: string;
  borderClass: string;
  barHex: string;
}

export interface SaferWindowResult {
  available: boolean;
  startLabel: string | null;
  endLabel: string | null;
  averageAqi: number | null;
  peakAqi: number | null;
  peakHourLabel: string | null;
  explanation: string;
}

export interface FamilyAdvisoryGroup {
  id: 'children' | 'adults' | 'older_adults' | 'respiratory';
  label: string;
  riskSummary: string;
  outdoorGuidance: string;
  protectiveSteps: string[];
  watchSigns: string[];
}

export interface FamilyHealthAdvisory {
  aqiCategory: AQICategoryMeta;
  severeWarning: string | null;
  medicalDisclaimer: string;
  groups: FamilyAdvisoryGroup[];
}

export const EPA_AQI_SCALE: AQICategoryMeta[] = [
  {
    name: 'Good',
    level: 1,
    epaRange: '0 – 50',
    shortGuidance: 'Air quality is satisfactory and poses little or no risk for most people.',
    isSevere: false,
    textClass: 'text-emerald-800',
    surfaceClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200',
    barHex: '#15803d',
  },
  {
    name: 'Moderate',
    level: 2,
    epaRange: '51 – 100',
    shortGuidance: 'Acceptable air quality; unusually sensitive individuals should consider limiting prolonged outdoor exertion.',
    isSevere: false,
    textClass: 'text-amber-900',
    surfaceClass: 'bg-amber-50',
    borderClass: 'border-amber-200',
    barHex: '#ca8a04',
  },
  {
    name: 'Unhealthy for Sensitive Groups',
    level: 3,
    epaRange: '101 – 150',
    shortGuidance: 'Children, older adults, and people with heart or lung conditions should reduce prolonged or heavy outdoor exertion.',
    isSevere: false,
    textClass: 'text-orange-900',
    surfaceClass: 'bg-orange-50',
    borderClass: 'border-orange-200',
    barHex: '#ea580c',
  },
  {
    name: 'Unhealthy',
    level: 4,
    epaRange: '151 – 200',
    shortGuidance: 'Everyone may begin to experience respiratory irritation; sensitive groups should avoid prolonged outdoor exertion.',
    isSevere: false,
    textClass: 'text-red-900',
    surfaceClass: 'bg-red-50',
    borderClass: 'border-red-200',
    barHex: '#dc2626',
  },
  {
    name: 'Very Unhealthy',
    level: 5,
    epaRange: '201 – 300',
    shortGuidance: 'Health alert: risk of adverse respiratory and cardiovascular effects increases for everyone. Move activities indoors.',
    isSevere: true,
    textClass: 'text-purple-950',
    surfaceClass: 'bg-purple-50',
    borderClass: 'border-purple-200',
    barHex: '#7e22ce',
  },
  {
    name: 'Hazardous',
    level: 6,
    epaRange: '301+',
    shortGuidance: 'Health warning of emergency conditions: everyone should avoid all outdoor physical activity and keep indoor air filtered.',
    isSevere: true,
    textClass: 'text-rose-950',
    surfaceClass: 'bg-rose-100',
    borderClass: 'border-rose-300',
    barHex: '#881337',
  },
];

export const UNAVAILABLE_AQI_META: AQICategoryMeta = {
  name: 'Unavailable',
  level: 0,
  epaRange: 'No reading',
  shortGuidance: 'Live air quality measurements are currently unavailable for this location.',
  isSevere: false,
  textClass: 'text-slate-700',
  surfaceClass: 'bg-slate-50',
  borderClass: 'border-slate-200',
  barHex: '#64748b',
};

export function getAQICategory(aqi: number | null | undefined): AQICategoryMeta {
  if (aqi === null || aqi === undefined || !Number.isFinite(aqi) || aqi < 0) {
    return UNAVAILABLE_AQI_META;
  }
  const rounded = Math.round(aqi);
  if (rounded <= 50) return EPA_AQI_SCALE[0];
  if (rounded <= 100) return EPA_AQI_SCALE[1];
  if (rounded <= 150) return EPA_AQI_SCALE[2];
  if (rounded <= 200) return EPA_AQI_SCALE[3];
  if (rounded <= 300) return EPA_AQI_SCALE[4];
  return EPA_AQI_SCALE[5];
}

/**
 * Official US EPA 2024 Revised PM2.5 (µg/m³, 24-hr equivalent) AQI breakpoint calculation.
 * Returns null if input is negative or non-finite.
 */
export function calculatePm25SubIndex(pm25: number): number | null {
  if (!Number.isFinite(pm25) || pm25 < 0) return null;
  const c = Math.floor(pm25 * 10) / 10; // EPA truncates PM2.5 to 1 decimal place

  const breakpoints: Array<[number, number, number, number]> = [
    [0.0, 9.0, 0, 50],
    [9.1, 35.4, 51, 100],
    [35.5, 55.4, 101, 150],
    [55.5, 125.4, 151, 200],
    [125.5, 225.4, 201, 300],
    [225.5, 325.4, 301, 500],
  ];

  for (const [cLow, cHigh, iLow, iHigh] of breakpoints) {
    if (c >= cLow && c <= cHigh) {
      return Math.round(((iHigh - iLow) / (cHigh - cLow)) * (c - cLow) + iLow);
    }
  }
  // Above 325.4 µg/m³ extends linearly beyond 500
  return Math.round(500 + ((c - 325.4) / 100) * 100);
}

export function formatHourLabel(isoLocalTime: string): string {
  const match = isoLocalTime.match(/T(\d{2}):(\d{2})/);
  if (!match) return isoLocalTime;
  const hour = Number(match[1]);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:00 ${suffix}`;
}

/**
 * Finds the lowest-AQI 3-hour window across available hourly data.
 * Never fabricates a window when hourly AQI points are missing.
 */
export function findSaferOutdoorWindows(hourly: HourlyAirQualityPoint[]): SaferWindowResult {
  const validPoints = hourly.filter(
    (p): p is HourlyAirQualityPoint & { usAqi: number } =>
      p.usAqi !== null && Number.isFinite(p.usAqi)
  );

  if (validPoints.length < 3) {
    return {
      available: false,
      startLabel: null,
      endLabel: null,
      averageAqi: null,
      peakAqi: null,
      peakHourLabel: null,
      explanation:
        'Sufficient hourly air quality readings are not available to identify a safer outdoor time window.',
    };
  }

  let bestStartIdx = 0;
  let bestAvg = Number.POSITIVE_INFINITY;

  for (let i = 0; i <= validPoints.length - 3; i++) {
    const avg = (validPoints[i].usAqi + validPoints[i + 1].usAqi + validPoints[i + 2].usAqi) / 3;
    if (avg < bestAvg) {
      bestAvg = avg;
      bestStartIdx = i;
    }
  }

  let peakPoint = validPoints[0];
  for (const pt of validPoints) {
    if (pt.usAqi > peakPoint.usAqi) {
      peakPoint = pt;
    }
  }

  const startLabel = formatHourLabel(validPoints[bestStartIdx].time);
  const endLabel = formatHourLabel(validPoints[bestStartIdx + 2].time);
  const avgRounded = Math.round(bestAvg);
  const peakRounded = Math.round(peakPoint.usAqi);
  const peakHourLabel = formatHourLabel(peakPoint.time);

  let explanation: string;
  if (avgRounded <= 50) {
    explanation = `Lowest pollution is projected between ${startLabel} and ${endLabel} (avg US AQI ${avgRounded}), suitable for normal outdoor activity.`;
  } else if (avgRounded <= 100) {
    explanation = `Relatively cleaner air occurs between ${startLabel} and ${endLabel} (avg US AQI ${avgRounded}), compared to the daily peak of ${peakRounded} around ${peakHourLabel}.`;
  } else if (avgRounded <= 150) {
    explanation = `The least polluted window is ${startLabel} to ${endLabel} (avg US AQI ${avgRounded}). Keep outdoor errands brief and avoid the ${peakHourLabel} peak (AQI ${peakRounded}).`;
  } else {
    explanation = `Even the lowest 3-hour window (${startLabel}–${endLabel}, avg US AQI ${avgRounded}) remains unhealthy. Restrict outdoor time to essential travel only and avoid peak smog around ${peakHourLabel} (AQI ${peakRounded}).`;
  }

  return {
    available: true,
    startLabel,
    endLabel,
    averageAqi: avgRounded,
    peakAqi: peakRounded,
    peakHourLabel,
    explanation,
  };
}

export interface PollutantDetail {
  key: keyof Omit<PollutantReadings, 'usAqi' | 'europeanAqi'>;
  symbol: string;
  name: string;
  unit: string;
  whoReference: string;
  value: number | null;
  ratioToWho: number | null;
}

export function buildPollutantDetails(current: PollutantReadings): PollutantDetail[] {
  const specs: Array<{
    key: PollutantDetail['key'];
    symbol: string;
    name: string;
    unit: string;
    whoGuideline: number;
    whoReference: string;
  }> = [
    {
      key: 'pm25',
      symbol: 'PM2.5',
      name: 'Fine Particulate Matter',
      unit: 'µg/m³',
      whoGuideline: 15,
      whoReference: 'WHO 24-hr guideline: 15 µg/m³',
    },
    {
      key: 'pm10',
      symbol: 'PM10',
      name: 'Coarse Particulate Matter',
      unit: 'µg/m³',
      whoGuideline: 45,
      whoReference: 'WHO 24-hr guideline: 45 µg/m³',
    },
    {
      key: 'no2',
      symbol: 'NO₂',
      name: 'Nitrogen Dioxide',
      unit: 'µg/m³',
      whoGuideline: 25,
      whoReference: 'WHO 24-hr guideline: 25 µg/m³',
    },
    {
      key: 'o3',
      symbol: 'O₃',
      name: 'Ground-Level Ozone',
      unit: 'µg/m³',
      whoGuideline: 100,
      whoReference: 'WHO 8-hr guideline: 100 µg/m³',
    },
    {
      key: 'so2',
      symbol: 'SO₂',
      name: 'Sulfur Dioxide',
      unit: 'µg/m³',
      whoGuideline: 40,
      whoReference: 'WHO 24-hr guideline: 40 µg/m³',
    },
    {
      key: 'co',
      symbol: 'CO',
      name: 'Carbon Monoxide',
      unit: 'µg/m³',
      whoGuideline: 4000,
      whoReference: 'WHO 24-hr guideline: 4,000 µg/m³',
    },
  ];

  return specs.map((spec) => {
    const val = current[spec.key];
    return {
      key: spec.key,
      symbol: spec.symbol,
      name: spec.name,
      unit: spec.unit,
      whoReference: spec.whoReference,
      value: val !== null && Number.isFinite(val) ? Number(val.toFixed(1)) : null,
      ratioToWho:
        val !== null && Number.isFinite(val) ? Number((val / spec.whoGuideline).toFixed(2)) : null,
    };
  });
}

export function getDominantPollutant(current: PollutantReadings): string | null {
  const details = buildPollutantDetails(current).filter(
    (d): d is PollutantDetail & { ratioToWho: number } => d.ratioToWho !== null
  );
  if (details.length === 0) return null;
  details.sort((a, b) => b.ratioToWho - a.ratioToWho);
  return `${details[0].symbol} (${details[0].value} ${details[0].unit})`;
}

export function getDataFreshness(
  timestamp: string | null,
  fetchedAt: string | null,
  mode: DataMode,
  nowMs: number = Date.now()
): DataFreshnessInfo {
  if (mode === 'demo') {
    return {
      status: 'demo',
      label: 'Illustrative demo dataset (not live)',
      ageMinutes: null,
      isStale: false,
    };
  }
  if (mode === 'unavailable') {
    return {
      status: 'unavailable',
      label: 'No current reading available',
      ageMinutes: null,
      isStale: true,
    };
  }

  // Prefer fetchedAt when reading timestamp lacks timezone offset (e.g. local wall clock "YYYY-MM-DDTHH:mm")
  const hasExplicitTz = Boolean(timestamp && /(Z|[+-]\d{2}:?\d{2})$/.test(timestamp));
  const candidate = hasExplicitTz ? timestamp : fetchedAt || timestamp;

  if (!candidate) {
    return {
      status: 'stale',
      label: 'Freshness unknown (timestamp missing)',
      ageMinutes: null,
      isStale: true,
    };
  }

  const parsedMs = Date.parse(candidate);
  if (Number.isNaN(parsedMs)) {
    return {
      status: 'stale',
      label: 'Freshness unknown (unrecognized timestamp)',
      ageMinutes: null,
      isStale: true,
    };
  }

  const diffMs = Math.max(0, nowMs - parsedMs);
  const ageMinutes = Math.round(diffMs / 60000);

  if (ageMinutes <= 30) {
    return {
      status: 'fresh',
      label: ageMinutes <= 1 ? 'Fresh · Fetched just now' : `Fresh · ${ageMinutes} min ago`,
      ageMinutes,
      isStale: false,
    };
  }
  if (ageMinutes <= 180) {
    const hrs = Math.floor(ageMinutes / 60);
    const mins = ageMinutes % 60;
    const label =
      hrs > 0
        ? `Recent · ${hrs} hr${hrs > 1 ? 's' : ''}${mins > 0 ? ` ${mins} min` : ''} ago`
        : `Recent · ${ageMinutes} min ago`;
    return {
      status: 'recent',
      label,
      ageMinutes,
      isStale: false,
    };
  }

  const hrs = Math.round(ageMinutes / 60);
  return {
    status: 'stale',
    label: `Stale · ${hrs} hr${hrs > 1 ? 's' : ''} old — refresh for latest conditions`,
    ageMinutes,
    isStale: true,
  };
}

export function getFamilyHealthGuidance(aqi: number | null): FamilyHealthAdvisory {
  const meta = getAQICategory(aqi);
  const medicalDisclaimer =
    'General public-health precautionary guidance calibrated to the US EPA AQI scale (0–500; distinct from India’s CPCB NAQI scale). SmogWise does not diagnose medical conditions or replace advice from a licensed healthcare professional. Seek prompt medical care for severe shortness of breath, chest pain, or worsening asthma symptoms.';

  if (meta.level === 0) {
    return {
      aqiCategory: meta,
      severeWarning: null,
      medicalDisclaimer,
      groups: [
        {
          id: 'children',
          label: 'Children',
          riskSummary: 'Local AQI is unavailable; apply visual visibility and local public-health alerts.',
          outdoorGuidance: 'If haze, smoke odor, or local government advisories are present, shift vigorous play indoors.',
          protectiveSteps: [
            'Check official municipal or national air-monitoring bulletins before outdoor sports.',
            'Keep rescue inhalers accessible if a child has diagnosed asthma.',
          ],
          watchSigns: ['Persistent coughing during play', 'Wheezing or unusual fatigue'],
        },
        {
          id: 'adults',
          label: 'Adults',
          riskSummary: 'Unable to quantify current outdoor risk without a live AQI reading.',
          outdoorGuidance: 'Avoid heavy exercise directly beside high-traffic arterial roads during winter inversions.',
          protectiveSteps: [
            'Choose parks or low-traffic streets when walking or cycling.',
            'Use kitchen exhaust fans when cooking at high heat indoors.',
          ],
          watchSigns: ['Throat or eye irritation', 'Headache or chest tightness outdoors'],
        },
        {
          id: 'older_adults',
          label: 'Older Adults',
          riskSummary: 'Older adults face higher cardiovascular sensitivity during winter smog episodes.',
          outdoorGuidance: 'Prefer midday walks when winter temperature inversions typically lift.',
          protectiveSteps: [
            'Keep routine cardiovascular and respiratory medications on schedule.',
            'Limit exposure to roadside traffic queues and wood-burning smoke.',
          ],
          watchSigns: ['Shortness of breath on light exertion', 'Dizziness or chest discomfort'],
        },
        {
          id: 'respiratory',
          label: 'Respiratory Sensitivities',
          riskSummary: 'Follow your written asthma or COPD action plan when local air data is missing.',
          outdoorGuidance: 'Keep a well-fitting N95/KF94 mask available when visible haze or smoke is present.',
          protectiveSteps: [
            'Verify rescue medication supply and follow clinician-prescribed trigger precautions.',
            'Run a True HEPA air cleaner indoors if smog odor enters the home.',
          ],
          watchSigns: ['Increased rescue inhaler use', 'Nighttime coughing or chest tightness'],
        },
      ],
    };
  }

  const severeWarning = meta.isSevere
    ? meta.level === 6
      ? 'Hazardous Air Quality Warning (AQI 301+): Avoid all outdoor physical exertion. Keep doors and windows tightly closed, run True HEPA filtration if available, and use a well-fitting N95/KN95/KF94 respirator if outdoor travel is unavoidable.'
      : 'Severe Smog Health Alert (AQI 201–300): Move exercise and children’s play indoors. Limit outdoor travel to essential trips and wear a well-fitting particulate respirator (N95/KF94) outdoors.'
    : null;

  if (meta.level <= 2) {
    return {
      aqiCategory: meta,
      severeWarning,
      medicalDisclaimer,
      groups: [
        {
          id: 'children',
          label: 'Children',
          riskSummary: meta.level === 1 ? 'Low risk for outdoor play and school sports.' : 'Low to mild risk; most children can stay active outdoors.',
          outdoorGuidance:
            meta.level === 1
              ? 'Normal outdoor play, walking to school, and sports are appropriate.'
              : 'Normal outdoor activity is fine; children with severe asthma should take brief breaks during intense play.',
          protectiveSteps: [
            'Schedule sports away from idling school buses or congested drop-off lanes.',
            'Encourage hydration during outdoor activity.',
          ],
          watchSigns: ['Unusual coughing after vigorous running'],
        },
        {
          id: 'adults',
          label: 'Adults',
          riskSummary: meta.level === 1 ? 'Favorable air quality for commuting and exercise.' : 'Generally acceptable for routine outdoor activities.',
          outdoorGuidance: 'Good window for walking, cycling, and ventilating indoor living spaces.',
          protectiveSteps: [
            'Open windows briefly to refresh indoor air, especially after cooking.',
            'Prefer active travel or public transit to help keep local emissions low.',
          ],
          watchSigns: ['Mild irritation only in unusually sensitive individuals'],
        },
        {
          id: 'older_adults',
          label: 'Older Adults',
          riskSummary: 'Generally safe conditions for daily walks and errands.',
          outdoorGuidance: 'Continue regular outdoor walks; choose quieter green routes away from diesel traffic.',
          protectiveSteps: [
            'Monitor local trends if winter inversion forecasts suggest evening buildup.',
            'Maintain routine medication schedules.',
          ],
          watchSigns: ['Unexplained fatigue or throat dryness'],
        },
        {
          id: 'respiratory',
          label: 'Respiratory Sensitivities',
          riskSummary: meta.level === 1 ? 'Low ambient trigger risk.' : 'Mild sensitivity possible during prolonged outdoor exertion.',
          outdoorGuidance:
            meta.level === 1
              ? 'Normal outdoor activity while following your standard management plan.'
              : 'Consider shortening prolonged high-intensity outdoor workouts if you notice symptoms.',
          protectiveSteps: [
            'Carry prescribed reliever medication during outdoor exercise.',
            'Keep indoor cooking fumes vented with an exhaust hood.',
          ],
          watchSigns: ['Mild wheezing', 'Throat clearing or chest tightness'],
        },
      ],
    };
  }

  if (meta.level <= 4) {
    return {
      aqiCategory: meta,
      severeWarning,
      medicalDisclaimer,
      groups: [
        {
          id: 'children',
          label: 'Children',
          riskSummary:
            meta.level === 3
              ? 'Elevated exposure risk because children breathe faster per body weight.'
              : 'Unhealthy air for prolonged outdoor exertion.',
          outdoorGuidance:
            meta.level === 3
              ? 'Shorten vigorous outdoor sports and schedule breaks indoors.'
              : 'Replace outdoor sports and playground time with indoor physical activities.',
          protectiveSteps: [
            'Avoid waiting near idling vehicles at school pick-up and drop-off.',
            'Wash hands and face after returning from outdoor commutes.',
          ],
          watchSigns: ['Dry cough', 'Watery or itchy eyes', 'Fatigue or shortness of breath'],
        },
        {
          id: 'adults',
          label: 'Adults',
          riskSummary:
            meta.level === 3
              ? 'Moderate precaution advised for long outdoor workouts.'
              : 'Unhealthy for prolonged heavy exertion outdoors.',
          outdoorGuidance:
            meta.level === 3
              ? 'Reduce intensity or duration of outdoor running; avoid rush-hour roadways.'
              : 'Move aerobic workouts indoors and wear a well-fitting N95/KF94 mask for lengthy outdoor commutes.',
          protectiveSteps: [
            'Keep vehicle cabin air on recirculate mode when driving through traffic.',
            'Close windows during peak traffic and morning/evening inversion hours.',
          ],
          watchSigns: ['Scratchy throat', 'Coughing during commute', 'Nasal congestion'],
        },
        {
          id: 'older_adults',
          label: 'Older Adults',
          riskSummary: 'Higher risk of particulate-related respiratory and cardiovascular stress.',
          outdoorGuidance: 'Keep outdoor walks short and strictly during the cleaner midday window, or walk indoors.',
          protectiveSteps: [
            'Avoid outdoor chores like sweeping dust or yard work.',
            'Keep indoor spaces closed and run HEPA filtration in main sitting rooms.',
          ],
          watchSigns: ['Shortness of breath', 'Unusual tiredness', 'Chest discomfort — seek medical care promptly'],
        },
        {
          id: 'respiratory',
          label: 'Respiratory Sensitivities',
          riskSummary: 'High likelihood of airway irritation or symptom flare-ups.',
          outdoorGuidance: 'Avoid prolonged outdoor exertion; keep trips brief and wear a snug particulate respirator (N95/KF94) if tolerated.',
          protectiveSteps: [
            'Follow your clinician-prescribed asthma or COPD action plan closely.',
            'Run a True HEPA air purifier in the bedroom and avoid indoor smoke, incense, or aerosol sprays.',
          ],
          watchSigns: ['Increased reliever inhaler use', 'Wheezing or persistent cough', 'Difficulty speaking in full sentences'],
        },
      ],
    };
  }

  // Level 5 or 6 (Very Unhealthy / Hazardous)
  return {
    aqiCategory: meta,
    severeWarning,
    medicalDisclaimer,
    groups: [
      {
        id: 'children',
        label: 'Children',
        riskSummary: 'High health risk — keep children indoors with filtered air.',
        outdoorGuidance: 'Cancel outdoor sports and playground time completely. Use indoor play spaces.',
        protectiveSteps: [
          'Keep bedroom and living room windows tightly sealed; run HEPA filtration continuously.',
          'Coordinate with schools on indoor recess policies and air-cleaning protocols.',
          'Use a properly sized, well-fitting pediatric particulate mask only if outdoor transit is unavoidable.',
        ],
        watchSigns: ['Persistent coughing', 'Labored or rapid breathing', 'Wheezing — contact a pediatrician'],
      },
      {
        id: 'adults',
        label: 'Adults',
        riskSummary: 'Significant risk of respiratory irritation and systemic inflammation for all adults.',
        outdoorGuidance: 'Avoid outdoor exercise entirely. Work remotely or combine essential errands into a single low-exposure trip.',
        protectiveSteps: [
          'Wear a well-fitting N95, KN95, or KF94 mask (not cloth or loose surgical masks) for any outdoor travel.',
          'Avoid burning candles, incense, or frying without strong exhaust ventilation indoors.',
          'Switch vehicle HVAC to recirculate mode.',
        ],
        watchSigns: ['Chest tightness', 'Persistent cough', 'Dizziness or severe eye/throat burning'],
      },
      {
        id: 'older_adults',
        label: 'Older Adults',
        riskSummary: 'Very high cardiovascular and respiratory vulnerability during severe winter smog.',
        outdoorGuidance: 'Stay indoors in a clean-air room; arrange delivery for groceries and errands where possible.',
        protectiveSteps: [
          'Create a designated clean-air room with closed windows and a running HEPA air purifier.',
          'Stay hydrated and keep all regular medications on hand.',
          'Check in daily with family members or caregivers.',
        ],
        watchSigns: ['Shortness of breath at rest', 'Palpitations or chest pain — seek immediate medical evaluation'],
      },
      {
        id: 'respiratory',
        label: 'Respiratory Sensitivities',
        riskSummary: 'Critical trigger risk for asthma, COPD, and chronic bronchitis flare-ups.',
        outdoorGuidance: 'Remain indoors in filtered air; avoid all non-essential outdoor exposure.',
        protectiveSteps: [
          'Review your written action plan with your healthcare provider if symptoms increase.',
          'Run True HEPA filtration continuously on medium/high speed in occupied rooms.',
          'Avoid ozone-generating air cleaners, which can worsen airway inflammation.',
        ],
        watchSigns: ['Rescue inhaler needed more frequently than usual', 'Worsening wheeze or night waking', 'Seek urgent medical care for breathing distress'],
      },
    ],
  };
}
