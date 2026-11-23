import { z } from 'zod';
import type {
  AirQualityData,
  HourlyAirQualityPoint,
  LocationInfo,
  PollutantReadings,
  WeatherContext,
} from '../../src/shared/types.ts';

const OPEN_METEO_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const OPEN_METEO_AQ_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const OPEN_METEO_WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const WAQI_GEO_BASE_URL = 'https://api.waqi.info/feed/geo:';

const GeocodingResultSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        admin1: z.string().optional(),
        country: z.string().default(''),
        latitude: z.number(),
        longitude: z.number(),
        timezone: z.string().default('UTC'),
      })
    )
    .optional(),
});

const OpenMeteoAqSchema = z.object({
  timezone: z.string().optional(),
  current: z
    .object({
      time: z.string().optional(),
      us_aqi: z.number().nullable().optional(),
      european_aqi: z.number().nullable().optional(),
      pm2_5: z.number().nullable().optional(),
      pm10: z.number().nullable().optional(),
      nitrogen_dioxide: z.number().nullable().optional(),
      ozone: z.number().nullable().optional(),
      sulphur_dioxide: z.number().nullable().optional(),
      carbon_monoxide: z.number().nullable().optional(),
    })
    .optional(),
  hourly: z
    .object({
      time: z.array(z.string()).default([]),
      us_aqi: z.array(z.number().nullable()).optional(),
      pm2_5: z.array(z.number().nullable()).optional(),
      pm10: z.array(z.number().nullable()).optional(),
      nitrogen_dioxide: z.array(z.number().nullable()).optional(),
      ozone: z.array(z.number().nullable()).optional(),
    })
    .optional(),
});

const WaqiFeedSchema = z.object({
  status: z.string(),
  data: z
    .object({
      aqi: z.union([z.number(), z.string()]).optional(),
      city: z
        .object({
          name: z.string().optional(),
        })
        .optional(),
      time: z
        .object({
          iso: z.string().optional(),
          s: z.string().optional(),
        })
        .optional(),
      iaqi: z
        .record(
          z.string(),
          z.object({
            v: z.number(),
          })
        )
        .optional(),
    })
    .optional(),
});

const OpenMeteoWeatherSchema = z.object({
  current: z
    .object({
      temperature_2m: z.number().nullable().optional(),
      relative_humidity_2m: z.number().nullable().optional(),
      wind_speed_10m: z.number().nullable().optional(),
    })
    .optional(),
});

function numOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function tryFetchOpenMeteoWeather(
  latitude: number,
  longitude: number
): Promise<WeatherContext | null> {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    current: 'temperature_2m,relative_humidity_2m,wind_speed_10m',
    timezone: 'auto',
  });

  const response = await fetch(`${OPEN_METEO_WEATHER_URL}?${params.toString()}`, {
    signal: AbortSignal.timeout(5000),
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) return null;
  const json = await response.json();
  const parsed = OpenMeteoWeatherSchema.safeParse(json);
  if (!parsed.success || !parsed.data.current) return null;

  const temperatureC = numOrNull(parsed.data.current.temperature_2m);
  const relativeHumidityPct = numOrNull(parsed.data.current.relative_humidity_2m);
  const windSpeedKmh = numOrNull(parsed.data.current.wind_speed_10m);

  if (temperatureC === null && relativeHumidityPct === null && windSpeedKmh === null) {
    return null;
  }

  return {
    temperatureC,
    relativeHumidityPct,
    windSpeedKmh,
    sourceName: 'Open-Meteo Weather Forecast Model',
  };
}

export async function searchLocations(query: string): Promise<LocationInfo[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const params = new URLSearchParams({
    name: trimmed,
    count: '6',
    language: 'en',
    format: 'json',
  });

  const response = await fetch(`${OPEN_METEO_GEOCODING_URL}?${params.toString()}`, {
    signal: AbortSignal.timeout(8000),
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Location lookup failed with status ${response.status}`);
  }

  const json = await response.json();
  const parsed = GeocodingResultSchema.safeParse(json);
  if (!parsed.success || !parsed.data.results) {
    return [];
  }

  return parsed.data.results.map((item) => ({
    name: item.name,
    admin1: item.admin1,
    country: item.country || 'Unknown',
    latitude: Number(item.latitude.toFixed(4)),
    longitude: Number(item.longitude.toFixed(4)),
    timezone: item.timezone,
  }));
}

async function tryFetchWaqiStation(
  latitude: number,
  longitude: number,
  token: string
): Promise<{
  usAqi: number | null;
  stationName: string;
  timestamp: string | null;
} | null> {
  const safeLat = latitude.toFixed(4);
  const safeLon = longitude.toFixed(4);
  const url = `${WAQI_GEO_BASE_URL}${safeLat};${safeLon}/?token=${encodeURIComponent(token)}`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(6000),
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) return null;
  const json = await response.json();
  const parsed = WaqiFeedSchema.safeParse(json);
  if (!parsed.success || parsed.data.status !== 'ok' || !parsed.data.data) {
    return null;
  }

  const rawAqi = parsed.data.data.aqi;
  const numericAqi = typeof rawAqi === 'number' ? rawAqi : Number(rawAqi);
  if (!Number.isFinite(numericAqi) || numericAqi < 0) return null;

  return {
    usAqi: Math.round(numericAqi),
    stationName: parsed.data.data.city?.name || 'WAQI Ground Monitoring Station',
    timestamp: parsed.data.data.time?.iso || parsed.data.data.time?.s || null,
  };
}

export async function fetchLiveAirQuality(location: LocationInfo): Promise<AirQualityData> {
  const fetchedAt = new Date().toISOString();
  const emptyReadings: PollutantReadings = {
    usAqi: null,
    europeanAqi: null,
    pm25: null,
    pm10: null,
    no2: null,
    o3: null,
    so2: null,
    co: null,
  };

  try {
    const params = new URLSearchParams({
      latitude: location.latitude.toFixed(4),
      longitude: location.longitude.toFixed(4),
      current:
        'us_aqi,european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide',
      hourly: 'us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone',
      forecast_days: '1',
      timezone: 'auto',
    });

    const [openMeteoRes, waqiStation, weather] = await Promise.all([
      fetch(`${OPEN_METEO_AQ_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(8000),
        headers: { Accept: 'application/json' },
      }),
      process.env.WAQI_API_TOKEN && process.env.WAQI_API_TOKEN.trim().length > 0
        ? tryFetchWaqiStation(
            location.latitude,
            location.longitude,
            process.env.WAQI_API_TOKEN.trim()
          ).catch(() => null)
        : Promise.resolve(null),
      tryFetchOpenMeteoWeather(location.latitude, location.longitude).catch(() => null),
    ]);

    if (!openMeteoRes.ok) {
      return {
        location,
        mode: 'unavailable',
        source: {
          name: 'Unavailable',
          provider: 'none',
          isEstimated: false,
          note: 'Live air quality service could not be reached.',
        },
        timestamp: null,
        fetchedAt,
        current: emptyReadings,
        hourly: [],
        unavailableReason: `Air quality upstream responded with HTTP ${openMeteoRes.status}. No readings were invented.`,
      };
    }

    const rawJson = await openMeteoRes.json();
    const parsed = OpenMeteoAqSchema.safeParse(rawJson);

    if (!parsed.success || !parsed.data.current) {
      return {
        location,
        mode: 'unavailable',
        source: {
          name: 'Unavailable',
          provider: 'none',
          isEstimated: false,
          note: 'Upstream returned an unexpected payload format.',
        },
        timestamp: null,
        fetchedAt,
        current: emptyReadings,
        hourly: [],
        unavailableReason:
          'Received incomplete air quality data from upstream provider. No placeholder values were generated.',
      };
    }

    const cur = parsed.data.current;
    const hourlyRaw = parsed.data.hourly;

    const hourly: HourlyAirQualityPoint[] = (hourlyRaw?.time || []).slice(0, 24).map((t, i) => ({
      time: t,
      usAqi: numOrNull(hourlyRaw?.us_aqi?.[i]),
      pm25: numOrNull(hourlyRaw?.pm2_5?.[i]),
      pm10: numOrNull(hourlyRaw?.pm10?.[i]),
      no2: numOrNull(hourlyRaw?.nitrogen_dioxide?.[i]),
      o3: numOrNull(hourlyRaw?.ozone?.[i]),
    }));

    const current: PollutantReadings = {
      usAqi: waqiStation?.usAqi ?? numOrNull(cur.us_aqi),
      europeanAqi: numOrNull(cur.european_aqi),
      pm25: numOrNull(cur.pm2_5),
      pm10: numOrNull(cur.pm10),
      no2: numOrNull(cur.nitrogen_dioxide),
      o3: numOrNull(cur.ozone),
      so2: numOrNull(cur.sulphur_dioxide),
      co: numOrNull(cur.carbon_monoxide),
    };

    const hasAnyReading =
      current.usAqi !== null || current.pm25 !== null || current.pm10 !== null;

    if (!hasAnyReading) {
      return {
        location: {
          ...location,
          timezone: parsed.data.timezone || location.timezone,
        },
        mode: 'unavailable',
        source: {
          name: 'Unavailable',
          provider: 'none',
          isEstimated: false,
          note: 'No live pollutant values were reported for these coordinates.',
        },
        timestamp: cur.time || null,
        fetchedAt,
        current: emptyReadings,
        hourly: [],
        unavailableReason:
          'No pollutant measurements were returned for this location at this time.',
      };
    }

    return {
      location: {
        ...location,
        timezone: parsed.data.timezone || location.timezone,
      },
      mode: 'live',
      source: waqiStation
        ? {
            name: `WAQI Ground Station (${waqiStation.stationName}) + Open-Meteo Hourly`,
            provider: 'waqi',
            isEstimated: false,
            aqiScale: 'US EPA AQI (0–500)',
            note: 'Current US EPA AQI reported by the nearest WAQI ground monitoring station; hourly diurnal trend and secondary gases come from the Open-Meteo CAMS atmospheric model. Uses the US EPA AQI scale (not India CPCB NAQI).',
          }
        : {
            name: 'Open-Meteo Air Quality (CAMS Modelled Estimate)',
            provider: 'open-meteo',
            isEstimated: true,
            aqiScale: 'US EPA AQI (0–500)',
            note: 'Modelled atmospheric estimate assimilating Copernicus CAMS satellite and regional data (~10–40 km grid). Not an official government ground monitoring station reading; reported on the US EPA AQI scale (distinct from India CPCB NAQI).',
          },
      timestamp: waqiStation?.timestamp || cur.time || null,
      fetchedAt,
      current,
      hourly,
      weather,
    };
  } catch {
    return {
      location,
      mode: 'unavailable',
      source: {
        name: 'Unavailable',
        provider: 'none',
        isEstimated: false,
        note: 'External air quality API is currently unreachable.',
      },
      timestamp: null,
      fetchedAt,
      current: emptyReadings,
      hourly: [],
      unavailableReason:
        'Unable to reach the live air quality data provider right now. You can retry the live fetch or switch to clearly labeled Demo Mode.',
    };
  }
}
