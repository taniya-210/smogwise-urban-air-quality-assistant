export type DataMode = 'live' | 'demo' | 'unavailable';

export type AQICategoryName =
  | 'Good'
  | 'Moderate'
  | 'Unhealthy for Sensitive Groups'
  | 'Unhealthy'
  | 'Very Unhealthy'
  | 'Hazardous'
  | 'Unavailable';

export interface LocationInfo {
  name: string;
  admin1?: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface DataSourceInfo {
  name: string;
  provider: 'open-meteo' | 'waqi' | 'demo' | 'none';
  isEstimated: boolean;
  aqiScale?: string;
  note: string;
}

export type FallbackErrorCategory =
  | 'missing_key'
  | 'invalid_key'
  | 'rate_limit'
  | 'service_unavailable'
  | 'provider_error';

export interface PollutantReadings {
  usAqi: number | null;
  europeanAqi: number | null;
  pm25: number | null; // µg/m³
  pm10: number | null; // µg/m³
  no2: number | null; // µg/m³
  o3: number | null; // µg/m³
  so2: number | null; // µg/m³
  co: number | null; // µg/m³
}

export interface HourlyAirQualityPoint {
  time: string; // ISO local timestamp string e.g. "2026-11-23T14:00"
  usAqi: number | null;
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  o3: number | null;
}

export interface WeatherContext {
  temperatureC: number | null;
  relativeHumidityPct: number | null;
  windSpeedKmh: number | null;
  sourceName: string;
}

export interface AirQualityData {
  location: LocationInfo;
  mode: DataMode;
  demoScenarioId?: string;
  source: DataSourceInfo;
  timestamp: string | null;
  fetchedAt: string;
  current: PollutantReadings;
  hourly: HourlyAirQualityPoint[];
  weather?: WeatherContext | null;
  unavailableReason?: string;
}

export type CommuteModeId =
  | 'solo_petrol_car'
  | 'carpool_3'
  | 'two_wheeler'
  | 'city_bus'
  | 'metro_rail'
  | 'electric_car'
  | 'cycling_walking'
  | 'remote_work';

export type CookingFuelType = 'gas_stove' | 'electric_induction' | 'biomass_wood' | 'mixed';
export type BuildingType = 'apartment' | 'detached_house' | 'older_drafty' | 'office_shared';

export interface HouseholdProfile {
  lifestyle: 'office_commuter' | 'remote_worker' | 'family_with_school_kids' | 'active_outdoor' | 'retired_senior';
  commuteMode: CommuteModeId;
  commuteDistanceKm: number;
  commuteDaysPerWeek: number;
  preferredOutdoorWindow: 'early_morning' | 'midday' | 'late_afternoon' | 'evening';
  hasChildren: boolean;
  hasOlderAdults: boolean;
  hasRespiratorySensitivity: boolean;
  cookingFuel: CookingFuelType;
  hasAirPurifier: boolean;
  hasRangeHoodExhaust: boolean;
  buildingType: BuildingType;
  notes: string;
}

export interface RoutineScheduleItem {
  timeWindow: string;
  activity: string;
  recommendation: string;
  whyItMatters: string;
  exposureLevel: 'Lower' | 'Moderate' | 'Elevated' | 'Data Unavailable';
}

export interface CommuteAlternative {
  option: string;
  feasibilityNote: string;
  airQualityBenefit: string;
}

export interface RoutinePlanResponse {
  generatedBy: 'gemini' | 'fallback';
  fallbackReason?: string;
  errorCategory?: FallbackErrorCategory;
  dataContextSummary: string;
  dataSourcesUsed: string[];
  summary: string;
  saferOutdoorWindowSummary: string;
  scheduleBlocks: RoutineScheduleItem[];
  commuteAlternatives: CommuteAlternative[];
  lowEmissionHabits: string[];
  whyItMattersHighlights: string[];
  disclaimer: string;
}

export interface IndoorActionItem {
  title: string;
  action: string;
  rationale: string;
}

export interface IndoorGuidanceResponse {
  generatedBy: 'gemini' | 'fallback';
  fallbackReason?: string;
  errorCategory?: FallbackErrorCategory;
  dataContextSummary: string;
  dataSourcesUsed: string[];
  ventilationStatus: 'Ventilate Normally' | 'Short Timed Ventilation' | 'Keep Windows Closed' | 'Check Local Conditions';
  ventilationGuidance: string;
  cookingActions: IndoorActionItem[];
  cleaningActions: IndoorActionItem[];
  filtrationGuidance: IndoorActionItem[];
  mythCheck: {
    claim: string;
    evidenceReality: string;
  }[];
  disclaimer: string;
}

export interface HealthAdvisoryGroupGuidance {
  id: 'children' | 'adults' | 'older_adults' | 'respiratory';
  label: string;
  riskSummary: string;
  outdoorGuidance: string;
  protectiveSteps: string[];
  watchSigns: string[];
}

export interface HealthAdvisoryAiRequest {
  airQuality: AirQualityData | null;
  profile: HouseholdProfile;
  focusNote?: string;
}

export interface HealthAdvisoryAiResponse {
  generatedBy: 'gemini' | 'fallback';
  fallbackReason?: string;
  errorCategory?: FallbackErrorCategory;
  dataContextSummary: string;
  dataSourcesUsed: string[];
  summary: string;
  severeWarning: string | null;
  groups: HealthAdvisoryGroupGuidance[];
  medicalDisclaimer: string;
}

export interface SustainableCommuteScenario {
  currentMode: CommuteModeId;
  targetMode: CommuteModeId;
  oneWayDistanceKm: number;
  daysPerWeek: number;
  weeksPerYear: number;
}

export interface SustainableChoicesRequest {
  airQuality: AirQualityData | null;
  profile: HouseholdProfile;
  commuteScenario: SustainableCommuteScenario;
  householdGoal?: string;
}

export interface SustainableRecommendationItem {
  category:
    | 'Public Transport'
    | 'Carpooling'
    | 'Walking & Cycling'
    | 'Reduced Vehicle Use'
    | 'Energy Saving';
  title: string;
  action: string;
  environmentalBenefit: string;
  assumptionsAndLimits: string;
  smogConditionNote: string;
}

export interface SustainableChoicesResponse {
  generatedBy: 'gemini' | 'fallback';
  fallbackReason?: string;
  errorCategory?: FallbackErrorCategory;
  dataContextSummary: string;
  dataSourcesUsed: string[];
  headline: string;
  summary: string;
  calculatedImpactSummary: string;
  recommendations: SustainableRecommendationItem[];
  assumptionsDisclosure: string[];
  disclaimer: string;
}

export type CommunitySetting = 'school' | 'housing_society' | 'office' | 'neighborhood_group';

export interface CommunityPlanRequest {
  setting: CommunitySetting;
  groupSize: 'under_50' | '50_to_250' | '250_to_1000' | 'over_1000';
  primaryChallenge: string;
  resourcesAvailable: string;
  airQuality: AirQualityData | null;
}

export interface CommunityActionStep {
  title: string;
  description: string;
  owner: string;
  timeframe: string;
}

export interface CommunityPlanResponse {
  generatedBy: 'gemini' | 'fallback';
  fallbackReason?: string;
  errorCategory?: FallbackErrorCategory;
  dataSourcesUsed: string[];
  setting: CommunitySetting;
  title: string;
  objective: string;
  smogDayProtocol: CommunityActionStep[];
  awarenessCampaign: {
    theme: string;
    channels: string[];
    keyMessages: string[];
  };
  emissionReductionActivities: CommunityActionStep[];
  expectedOutcomes: string[];
  measurableIndicators: string[];
  disclaimer: string;
}

export interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  generatedBy?: 'gemini' | 'fallback';
  verifiedDataUsed?: string[];
  generalGuidanceNote?: string;
  followUpSuggestions?: string[];
  errorNotice?: string;
  errorCategory?: FallbackErrorCategory;
  promptForRetry?: string;
}

export interface ChatApiResponse {
  generatedBy: 'gemini' | 'fallback';
  reply: string;
  verifiedDataUsed: string[];
  generalGuidanceNote: string;
  followUpSuggestions: string[];
  errorNotice?: string;
  errorCategory?: FallbackErrorCategory;
}

export interface DemoScenarioSummary {
  id: string;
  label: string;
  city: string;
  country: string;
  summary: string;
  usAqi: number;
}
