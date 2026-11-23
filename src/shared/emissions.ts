import type { CommuteModeId } from './types.ts';

export interface CommuteModeSpec {
  id: CommuteModeId;
  label: string;
  /** Emission factor in kg CO2e per passenger-kilometer */
  kgCo2ePerPassengerKm: number;
  sourceCitation: string;
  localPollutantNote: string;
}

/**
 * Transparent average emission factors (kg CO2e per passenger-km).
 * Sources: UK DESNZ / DEFRA Greenhouse Gas Conversion Factors (2024) & US EPA Passenger Vehicle Averages.
 */
export const COMMUTE_MODES: Record<CommuteModeId, CommuteModeSpec> = {
  solo_petrol_car: {
    id: 'solo_petrol_car',
    label: 'Solo Petrol / Gasoline Car',
    kgCo2ePerPassengerKm: 0.171,
    sourceCitation: 'UK DESNZ/DEFRA 2024 average medium petrol car (single occupant)',
    localPollutantNote: 'Emits tailpipe NOx, CO, and brake/tire particulate matter (PM2.5/PM10).',
  },
  city_bus: {
    id: 'city_bus',
    label: 'City Bus / Public Transit',
    kgCo2ePerPassengerKm: 0.103,
    sourceCitation: 'UK DESNZ/DEFRA 2024 average local urban bus per passenger-km',
    localPollutantNote: 'Replaces dozens of solo cars per corridor, reducing total per-passenger road emissions.',
  },
  two_wheeler: {
    id: 'two_wheeler',
    label: 'Petrol Scooter / Motorbike',
    kgCo2ePerPassengerKm: 0.083,
    sourceCitation: 'UK DESNZ/DEFRA 2024 small/average petrol motorbike per passenger-km',
    localPollutantNote: 'Lower CO2 than a solo car, though tailpipe hydrocarbons and rider smog exposure remain high.',
  },
  carpool_3: {
    id: 'carpool_3',
    label: 'Carpool (3 Occupants)',
    kgCo2ePerPassengerKm: 0.057,
    sourceCitation: 'Derived: 0.171 kg CO2e/km divided equally across 3 occupants',
    localPollutantNote: 'Cuts per-commuter vehicle-kilometers and congestion idling by two-thirds.',
  },
  electric_car: {
    id: 'electric_car',
    label: 'Electric Vehicle (Grid Average)',
    kgCo2ePerPassengerKm: 0.047,
    sourceCitation: 'UK DESNZ/DEFRA 2024 battery electric car (grid electricity average)',
    localPollutantNote: 'Zero tailpipe NO2/CO emissions in urban streets; tire/brake wear still contributes minor PM.',
  },
  metro_rail: {
    id: 'metro_rail',
    label: 'Metro / Urban Rail',
    kgCo2ePerPassengerKm: 0.035,
    sourceCitation: 'UK DESNZ/DEFRA 2024 national/urban rail per passenger-km',
    localPollutantNote: 'Zero street-level tailpipe exhaust along densely populated urban corridors.',
  },
  cycling_walking: {
    id: 'cycling_walking',
    label: 'Cycling / Walking',
    kgCo2ePerPassengerKm: 0,
    sourceCitation: 'Zero operational tailpipe or grid emissions',
    localPollutantNote: 'Zero emissions; best practiced on low-traffic streets when AQI is Good or Moderate.',
  },
  remote_work: {
    id: 'remote_work',
    label: 'Remote / Hybrid Workday',
    kgCo2ePerPassengerKm: 0,
    sourceCitation: 'Zero commute transport emissions (home heating/cooling excluded)',
    localPollutantNote: 'Eliminates commute tailpipe emissions and personal rush-hour smog exposure.',
  },
};

export interface CommuteImpactInput {
  currentMode: CommuteModeId;
  targetMode: CommuteModeId;
  oneWayDistanceKm: number;
  daysPerWeek: number;
  weeksPerYear: number;
}

export interface CommuteImpactResult {
  valid: boolean;
  error?: string;
  annualRoundTripKm: number;
  currentWeeklyKgCo2e: number;
  targetWeeklyKgCo2e: number;
  weeklySavedKgCo2e: number;
  monthlySavedKgCo2e: number;
  annualCurrentKgCo2e: number;
  annualTargetKgCo2e: number;
  annualSavedKgCo2e: number;
  percentReduction: number;
  formulaDescription: string;
  assumptions: string[];
}

export function calculateCommuteImpact(input: CommuteImpactInput): CommuteImpactResult {
  const { currentMode, targetMode, oneWayDistanceKm, daysPerWeek, weeksPerYear } = input;

  if (
    !Number.isFinite(oneWayDistanceKm) ||
    oneWayDistanceKm <= 0 ||
    oneWayDistanceKm > 300
  ) {
    return {
      valid: false,
      error: 'One-way distance must be between 0.1 and 300 km.',
      annualRoundTripKm: 0,
      currentWeeklyKgCo2e: 0,
      targetWeeklyKgCo2e: 0,
      weeklySavedKgCo2e: 0,
      monthlySavedKgCo2e: 0,
      annualCurrentKgCo2e: 0,
      annualTargetKgCo2e: 0,
      annualSavedKgCo2e: 0,
      percentReduction: 0,
      formulaDescription: '',
      assumptions: [],
    };
  }

  if (!Number.isFinite(daysPerWeek) || daysPerWeek < 1 || daysPerWeek > 7) {
    return {
      valid: false,
      error: 'Commute days per week must be between 1 and 7.',
      annualRoundTripKm: 0,
      currentWeeklyKgCo2e: 0,
      targetWeeklyKgCo2e: 0,
      weeklySavedKgCo2e: 0,
      monthlySavedKgCo2e: 0,
      annualCurrentKgCo2e: 0,
      annualTargetKgCo2e: 0,
      annualSavedKgCo2e: 0,
      percentReduction: 0,
      formulaDescription: '',
      assumptions: [],
    };
  }

  if (!Number.isFinite(weeksPerYear) || weeksPerYear < 1 || weeksPerYear > 52) {
    return {
      valid: false,
      error: 'Commute weeks per year must be between 1 and 52.',
      annualRoundTripKm: 0,
      currentWeeklyKgCo2e: 0,
      targetWeeklyKgCo2e: 0,
      weeklySavedKgCo2e: 0,
      monthlySavedKgCo2e: 0,
      annualCurrentKgCo2e: 0,
      annualTargetKgCo2e: 0,
      annualSavedKgCo2e: 0,
      percentReduction: 0,
      formulaDescription: '',
      assumptions: [],
    };
  }

  const currentSpec = COMMUTE_MODES[currentMode];
  const targetSpec = COMMUTE_MODES[targetMode];

  const weeklyKm = oneWayDistanceKm * 2 * daysPerWeek;
  const annualRoundTripKm = Number((weeklyKm * weeksPerYear).toFixed(1));

  const currentWeeklyKgCo2e = Number((weeklyKm * currentSpec.kgCo2ePerPassengerKm).toFixed(2));
  const targetWeeklyKgCo2e = Number((weeklyKm * targetSpec.kgCo2ePerPassengerKm).toFixed(2));
  const weeklySavedKgCo2e = Number((currentWeeklyKgCo2e - targetWeeklyKgCo2e).toFixed(2));
  const monthlySavedKgCo2e = Number(((weeklySavedKgCo2e * weeksPerYear) / 12).toFixed(1));

  const annualCurrentKgCo2e = Number((annualRoundTripKm * currentSpec.kgCo2ePerPassengerKm).toFixed(1));
  const annualTargetKgCo2e = Number((annualRoundTripKm * targetSpec.kgCo2ePerPassengerKm).toFixed(1));
  const annualSavedKgCo2e = Number((annualCurrentKgCo2e - annualTargetKgCo2e).toFixed(1));

  const percentReduction =
    annualCurrentKgCo2e > 0
      ? Number(((annualSavedKgCo2e / annualCurrentKgCo2e) * 100).toFixed(1))
      : 0;

  const formulaDescription = `Annual CO₂e Saved = (${oneWayDistanceKm} km × 2 trips/day × ${daysPerWeek} days/wk × ${weeksPerYear} wks/yr) × (${currentSpec.kgCo2ePerPassengerKm} − ${targetSpec.kgCo2ePerPassengerKm}) kg CO₂e/km = ${annualSavedKgCo2e} kg CO₂e/yr`;

  const assumptions = [
    `Current mode factor (${currentSpec.label}): ${currentSpec.kgCo2ePerPassengerKm} kg CO₂e/passenger-km — ${currentSpec.sourceCitation}.`,
    `Alternative mode factor (${targetSpec.label}): ${targetSpec.kgCo2ePerPassengerKm} kg CO₂e/passenger-km — ${targetSpec.sourceCitation}.`,
    `Round-trip distance assumed to be 2 × one-way distance (${(oneWayDistanceKm * 2).toFixed(1)} km/day) across ${daysPerWeek} days/week and ${weeksPerYear} weeks/year.`,
    'Estimates cover operational transport CO₂e only; lifecycle vehicle manufacturing, local grid carbon intensity variations, and remote-work home heating/cooling are excluded.',
  ];

  return {
    valid: true,
    annualRoundTripKm,
    currentWeeklyKgCo2e,
    targetWeeklyKgCo2e,
    weeklySavedKgCo2e,
    monthlySavedKgCo2e,
    annualCurrentKgCo2e,
    annualTargetKgCo2e,
    annualSavedKgCo2e,
    percentReduction,
    formulaDescription,
    assumptions,
  };
}
