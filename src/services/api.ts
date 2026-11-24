import type {
  AirQualityData,
  AQIScaleId,
  ChatApiResponse,
  CommunityPlanRequest,
  CommunityPlanResponse,
  DemoScenarioSummary,
  HealthAdvisoryAiRequest,
  HealthAdvisoryAiResponse,
  HouseholdProfile,
  IndoorGuidanceResponse,
  LocationInfo,
  RoutinePlanResponse,
  SustainableChoicesRequest,
  SustainableChoicesResponse,
} from '../shared/types.ts';

function sanitizeErrorMessage(raw: string, status: number): string {
  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[') ||
    trimmed.startsWith('<') ||
    trimmed.includes('"error":') ||
    trimmed.includes('Stack:')
  ) {
    if (status === 429) {
      return 'Too many requests right now. Please wait a moment and try again.';
    }
    if (status === 503 || status === 502) {
      return 'The service is temporarily unavailable. Please try again shortly.';
    }
    return 'Unable to complete the request right now. Please try again.';
  }
  return trimmed;
}

const inFlightRequests = new Map<string, Promise<unknown>>();

async function fetchJson<T>(url: string, init?: RequestInit, dedupeKey?: string): Promise<T> {
  if (dedupeKey) {
    const existing = inFlightRequests.get(dedupeKey);
    if (existing) {
      return existing as Promise<T>;
    }
  }

  const promise = (async () => {
    const response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const rawMessage =
        payload && typeof payload.error === 'string' ? payload.error : '';
      throw new Error(sanitizeErrorMessage(rawMessage, response.status));
    }

    return payload as T;
  })();

  if (dedupeKey) {
    inFlightRequests.set(dedupeKey, promise);
    promise.finally(() => {
      inFlightRequests.delete(dedupeKey);
    });
  }

  return promise;
}

export interface HealthStatus {
  status: string;
  geminiConfigured: boolean;
  geminiModel?: string;
  waqiConfigured: boolean;
  demoScenariosCount: number;
  timestamp: string;
}

export function fetchHealthStatus(): Promise<HealthStatus> {
  return fetchJson<HealthStatus>('/api/health', undefined, 'GET:/api/health');
}

export function searchCities(query: string): Promise<{ results: LocationInfo[] }> {
  const params = new URLSearchParams({ q: query });
  const url = `/api/locations/search?${params.toString()}`;
  return fetchJson<{ results: LocationInfo[] }>(url, undefined, `GET:${url}`);
}

export function fetchAirQualityForLocation(
  location: LocationInfo,
  options?: { refresh?: boolean }
): Promise<AirQualityData> {
  const params = new URLSearchParams({
    lat: String(location.latitude),
    lon: String(location.longitude),
    name: location.name,
    country: location.country,
    timezone: location.timezone,
  });
  if (location.admin1) {
    params.set('admin1', location.admin1);
  }
  if (options?.refresh) {
    params.set('refresh', 'true');
  }
  const url = `/api/air-quality?${params.toString()}`;
  return fetchJson<AirQualityData>(url, undefined, options?.refresh ? undefined : `GET:${url}`);
}

export function fetchDemoScenarios(): Promise<{ scenarios: DemoScenarioSummary[] }> {
  return fetchJson<{ scenarios: DemoScenarioSummary[] }>(
    '/api/air-quality/demos',
    undefined,
    'GET:/api/air-quality/demos'
  );
}

export function fetchDemoScenarioById(scenarioId: string): Promise<AirQualityData> {
  const url = `/api/air-quality/demo/${encodeURIComponent(scenarioId)}`;
  return fetchJson<AirQualityData>(url, undefined, `GET:${url}`);
}

export function requestRoutinePlan(
  airQuality: AirQualityData | null,
  profile: HouseholdProfile,
  options?: { aqiScale?: AQIScaleId; forceRefresh?: boolean }
): Promise<RoutinePlanResponse> {
  const body = JSON.stringify({
    airQuality,
    profile,
    aqiScale: options?.aqiScale ?? 'us_epa',
    forceRefresh: Boolean(options?.forceRefresh),
  });
  return fetchJson<RoutinePlanResponse>(
    '/api/ai/routine',
    { method: 'POST', body },
    options?.forceRefresh ? undefined : `POST:/api/ai/routine:${body}`
  );
}

export function requestIndoorGuidance(
  airQuality: AirQualityData | null,
  profile: HouseholdProfile,
  options?: { aqiScale?: AQIScaleId; forceRefresh?: boolean }
): Promise<IndoorGuidanceResponse> {
  const body = JSON.stringify({
    airQuality,
    profile,
    aqiScale: options?.aqiScale ?? 'us_epa',
    forceRefresh: Boolean(options?.forceRefresh),
  });
  return fetchJson<IndoorGuidanceResponse>(
    '/api/ai/indoor',
    { method: 'POST', body },
    options?.forceRefresh ? undefined : `POST:/api/ai/indoor:${body}`
  );
}

export function requestHealthAdvisory(
  request: HealthAdvisoryAiRequest
): Promise<HealthAdvisoryAiResponse> {
  const body = JSON.stringify(request);
  return fetchJson<HealthAdvisoryAiResponse>(
    '/api/ai/health-advisory',
    { method: 'POST', body },
    request.forceRefresh ? undefined : `POST:/api/ai/health-advisory:${body}`
  );
}

export function requestSustainableChoices(
  request: SustainableChoicesRequest
): Promise<SustainableChoicesResponse> {
  const body = JSON.stringify(request);
  return fetchJson<SustainableChoicesResponse>(
    '/api/ai/sustainable',
    { method: 'POST', body },
    request.forceRefresh ? undefined : `POST:/api/ai/sustainable:${body}`
  );
}

export function requestCommunityPlan(
  request: CommunityPlanRequest
): Promise<CommunityPlanResponse> {
  const body = JSON.stringify(request);
  return fetchJson<CommunityPlanResponse>(
    '/api/ai/community',
    { method: 'POST', body },
    request.forceRefresh ? undefined : `POST:/api/ai/community:${body}`
  );
}

export function sendAssistantMessage(params: {
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  airQuality: AirQualityData | null;
  profile: HouseholdProfile | null;
  aqiScale?: AQIScaleId;
  forceRefresh?: boolean;
}): Promise<ChatApiResponse> {
  const body = JSON.stringify({
    ...params,
    aqiScale: params.aqiScale ?? 'us_epa',
    forceRefresh: Boolean(params.forceRefresh),
  });
  return fetchJson<ChatApiResponse>(
    '/api/ai/chat',
    { method: 'POST', body },
    params.forceRefresh ? undefined : `POST:/api/ai/chat:${body}`
  );
}
