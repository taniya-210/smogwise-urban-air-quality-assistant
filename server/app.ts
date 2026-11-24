import crypto from 'crypto';
import express from 'express';
import { z } from 'zod';
import {
  fetchLiveAirQuality,
  searchLocations,
} from './services/airQualityService.ts';
import {
  generateChatResponse,
  generateCommunityPlan,
  generateHealthAdvisory,
  generateIndoorGuidance,
  generateRoutinePlan,
  generateSustainableChoices,
  getConfiguredGeminiModel,
  isGeminiConfigured,
} from './services/geminiService.ts';
import { createIpRateLimiter } from './middleware/rateLimiter.ts';
import {
  DEMO_SCENARIOS_LIST,
  getDemoScenario,
} from '../src/shared/demoScenarios.ts';
import type { RateLimitConfig } from '../types/smogwise.ts';

/**
 * Strips control characters and unsafe HTML tags from untrusted text
 * while preserving multilingual Unicode characters (e.g., Hindi, Marathi).
 */
export function sanitizeText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

const SanitizedString = (minLen: number, maxLen: number) =>
  z
    .string()
    .transform(sanitizeText)
    .pipe(z.string().min(minLen).max(maxLen));

const NonNegativeFinite = (max: number) => z.number().finite().min(0).max(max).nullable();

const AirQualityPayloadSchema = z
  .object({
    location: z.object({
      name: SanitizedString(1, 120),
      admin1: z.string().transform(sanitizeText).pipe(z.string().max(120)).optional(),
      country: z.string().transform(sanitizeText).pipe(z.string().max(120)),
      latitude: z.number().finite().min(-90).max(90),
      longitude: z.number().finite().min(-180).max(180),
      timezone: z.string().transform(sanitizeText).pipe(z.string().max(80)),
    }),
    mode: z.enum(['live', 'demo', 'unavailable']),
    demoScenarioId: z.string().transform(sanitizeText).pipe(z.string().max(80)).optional(),
    source: z.object({
      name: z.string().transform(sanitizeText).pipe(z.string().max(200)),
      provider: z.enum(['open-meteo', 'waqi', 'demo', 'none']),
      isEstimated: z.boolean(),
      aqiScale: z.string().transform(sanitizeText).pipe(z.string().max(80)).optional(),
      note: z.string().transform(sanitizeText).pipe(z.string().max(500)),
    }),
    timestamp: z.string().max(80).nullable(),
    fetchedAt: z.string().max(80),
    current: z.object({
      usAqi: NonNegativeFinite(2000),
      europeanAqi: NonNegativeFinite(2000),
      pm25: NonNegativeFinite(5000),
      pm10: NonNegativeFinite(10000),
      no2: NonNegativeFinite(10000),
      o3: NonNegativeFinite(10000),
      so2: NonNegativeFinite(10000),
      co: NonNegativeFinite(200000),
    }),
    hourly: z
      .array(
        z.object({
          time: z.string().max(80),
          usAqi: NonNegativeFinite(2000),
          pm25: NonNegativeFinite(5000),
          pm10: NonNegativeFinite(10000),
          no2: NonNegativeFinite(10000),
          o3: NonNegativeFinite(10000),
        })
      )
      .max(48),
    weather: z
      .object({
        temperatureC: z.number().finite().min(-90).max(70).nullable(),
        relativeHumidityPct: z.number().finite().min(0).max(100).nullable(),
        windSpeedKmh: z.number().finite().min(0).max(400).nullable(),
        sourceName: z.string().transform(sanitizeText).pipe(z.string().max(120)),
      })
      .nullable()
      .optional(),
    unavailableReason: z.string().transform(sanitizeText).pipe(z.string().max(400)).optional(),
  })
  .nullable();

const HouseholdProfileSchema = z.object({
  lifestyle: z.enum([
    'office_commuter',
    'remote_worker',
    'family_with_school_kids',
    'active_outdoor',
    'retired_senior',
  ]),
  commuteMode: z.enum([
    'solo_petrol_car',
    'carpool_3',
    'two_wheeler',
    'city_bus',
    'metro_rail',
    'electric_car',
    'cycling_walking',
    'remote_work',
  ]),
  commuteDistanceKm: z.number().finite().min(0).max(300),
  commuteDaysPerWeek: z.number().int().min(0).max(7),
  preferredOutdoorWindow: z.enum([
    'early_morning',
    'midday',
    'late_afternoon',
    'evening',
  ]),
  hasChildren: z.boolean(),
  hasOlderAdults: z.boolean(),
  hasRespiratorySensitivity: z.boolean(),
  cookingFuel: z.enum(['gas_stove', 'electric_induction', 'biomass_wood', 'mixed']),
  hasAirPurifier: z.boolean(),
  hasRangeHoodExhaust: z.boolean(),
  buildingType: z.enum(['apartment', 'detached_house', 'older_drafty', 'office_shared']),
  notes: z.string().transform(sanitizeText).pipe(z.string().max(400)).default(''),
});

const AqiScaleSchema = z.enum(['us_epa', 'india_cpcb']).default('us_epa');

const RoutineRequestSchema = z.object({
  airQuality: AirQualityPayloadSchema,
  profile: HouseholdProfileSchema,
  aqiScale: AqiScaleSchema,
  forceRefresh: z.boolean().default(false),
});

const IndoorRequestSchema = z.object({
  airQuality: AirQualityPayloadSchema,
  profile: HouseholdProfileSchema,
  aqiScale: AqiScaleSchema,
  forceRefresh: z.boolean().default(false),
});

const HealthAdvisoryRequestSchema = z.object({
  airQuality: AirQualityPayloadSchema,
  profile: HouseholdProfileSchema,
  focusNote: z
    .string()
    .transform(sanitizeText)
    .pipe(z.string().max(300))
    .optional(),
  aqiScale: AqiScaleSchema,
  forceRefresh: z.boolean().default(false),
});

const SustainableChoicesRequestSchema = z.object({
  airQuality: AirQualityPayloadSchema,
  profile: HouseholdProfileSchema,
  commuteScenario: z.object({
    currentMode: z.enum([
      'solo_petrol_car',
      'carpool_3',
      'two_wheeler',
      'city_bus',
      'metro_rail',
      'electric_car',
      'cycling_walking',
      'remote_work',
    ]),
    targetMode: z.enum([
      'solo_petrol_car',
      'carpool_3',
      'two_wheeler',
      'city_bus',
      'metro_rail',
      'electric_car',
      'cycling_walking',
      'remote_work',
    ]),
    oneWayDistanceKm: z.number().finite().min(0.1).max(300),
    daysPerWeek: z.number().int().min(1).max(7),
    weeksPerYear: z.number().int().min(1).max(52),
  }),
  householdGoal: z
    .string()
    .transform(sanitizeText)
    .pipe(z.string().max(300))
    .optional(),
  aqiScale: AqiScaleSchema,
  forceRefresh: z.boolean().default(false),
});

const CommunityRequestSchema = z.object({
  setting: z.enum(['school', 'housing_society', 'office', 'neighborhood_group']),
  groupSize: z.enum(['under_50', '50_to_250', '250_to_1000', 'over_1000']),
  primaryChallenge: SanitizedString(3, 300),
  resourcesAvailable: z
    .string()
    .transform(sanitizeText)
    .pipe(z.string().max(300))
    .default(''),
  airQuality: AirQualityPayloadSchema,
  aqiScale: AqiScaleSchema,
  forceRefresh: z.boolean().default(false),
});

const ChatRequestSchema = z.object({
  message: SanitizedString(1, 500),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().transform(sanitizeText).pipe(z.string().max(2000)),
      })
    )
    .max(20)
    .default([]),
  airQuality: AirQualityPayloadSchema,
  profile: HouseholdProfileSchema.nullable().default(null),
  aqiScale: AqiScaleSchema,
  forceRefresh: z.boolean().default(false),
});

const CoordinateQueryParam = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .transform((val) => Number(val))
    .pipe(z.number().finite().min(min).max(max));

function getOpaqueRequesterScope(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const rawIp =
    typeof forwarded === 'string' && forwarded.trim().length > 0
      ? forwarded.split(',')[0]?.trim() || 'unknown'
      : req.ip || req.socket?.remoteAddress || 'unknown';
  return crypto.createHash('sha256').update(rawIp).digest('hex').slice(0, 16);
}

function applySecurityHeaders(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('X-DNS-Prefetch-Control', 'off');

  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}

export interface ExpressAppOptions {
  rateLimit?: Partial<RateLimitConfig>;
}

export function createApiRouter(options: ExpressAppOptions = {}): express.Router {
  const router = express.Router();
  const aiRateLimiter = createIpRateLimiter(options.rateLimit);

  router.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    next();
  });

  router.get('/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      status: 'ok',
      geminiConfigured: isGeminiConfigured(),
      geminiModel: getConfiguredGeminiModel(),
      waqiConfigured: Boolean(process.env.WAQI_API_TOKEN?.trim()),
      demoScenariosCount: DEMO_SCENARIOS_LIST.length,
      timestamp: new Date().toISOString(),
    });
  });

  router.get('/locations/search', async (req, res) => {
    const rawQuery = typeof req.query.q === 'string' ? sanitizeText(req.query.q) : '';
    if (rawQuery.length < 2 || rawQuery.length > 100) {
      res.status(400).json({
        error: 'Please enter between 2 and 100 characters to search for a city.',
      });
      return;
    }

    try {
      const results = await searchLocations(rawQuery);
      res.setHeader('Cache-Control', 'public, max-age=900');
      res.json({ results });
    } catch {
      res.status(502).json({
        error: 'Location search is temporarily unavailable. You can choose a preset city or Demo Scenario.',
        results: [],
      });
    }
  });

  router.get('/air-quality', async (req, res) => {
    const querySchema = z.object({
      lat: CoordinateQueryParam(-90, 90),
      lon: CoordinateQueryParam(-180, 180),
      name: SanitizedString(1, 120).default('Selected Location'),
      admin1: z.string().transform(sanitizeText).pipe(z.string().max(120)).optional(),
      country: z.string().transform(sanitizeText).pipe(z.string().max(120)).default(''),
      timezone: z.string().transform(sanitizeText).pipe(z.string().max(80)).default('UTC'),
    });

    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid coordinates or location parameters.',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { lat, lon, name, admin1, country, timezone } = parsed.data;
    const forceRefresh = req.query.refresh === 'true' || req.query.refresh === '1';
    const data = await fetchLiveAirQuality(
      {
        name,
        admin1,
        country,
        latitude: lat,
        longitude: lon,
        timezone,
      },
      { forceRefresh }
    );

    res.setHeader(
      'Cache-Control',
      data.mode === 'live' ? 'public, max-age=900' : 'no-store'
    );
    res.json(data);
  });

  router.get('/air-quality/demos', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.json({ scenarios: DEMO_SCENARIOS_LIST });
  });

  router.get('/air-quality/demo/:scenarioId', (req, res) => {
    const scenarioId = sanitizeText(req.params.scenarioId);
    const scenario = getDemoScenario(scenarioId);
    if (!scenario) {
      res.status(404).json({
        error: 'The requested demo scenario was not found.',
      });
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.json(scenario);
  });

  // Apply configurable per-IP rate limiting and strict private caching to all personalized AI endpoints
  router.use('/ai', aiRateLimiter, (_req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store');
    next();
  });

  router.post('/ai/routine', async (req, res) => {
    const parsed = RoutineRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Please check your routine planner inputs and try again.',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const plan = await generateRoutinePlan(
      parsed.data.airQuality,
      parsed.data.profile,
      parsed.data.aqiScale,
      parsed.data.forceRefresh,
      getOpaqueRequesterScope(req)
    );
    res.json(plan);
  });

  router.post('/ai/indoor', async (req, res) => {
    const parsed = IndoorRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Please check your household settings and try again.',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const guidance = await generateIndoorGuidance(
      parsed.data.airQuality,
      parsed.data.profile,
      parsed.data.aqiScale,
      parsed.data.forceRefresh,
      getOpaqueRequesterScope(req)
    );
    res.json(guidance);
  });

  router.post('/ai/health-advisory', async (req, res) => {
    const parsed = HealthAdvisoryRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Please check your family health advisory inputs and try again.',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const advisory = await generateHealthAdvisory(
      parsed.data.airQuality,
      parsed.data.profile,
      parsed.data.focusNote,
      parsed.data.aqiScale,
      parsed.data.forceRefresh,
      getOpaqueRequesterScope(req)
    );
    res.json(advisory);
  });

  router.post('/ai/sustainable', async (req, res) => {
    const parsed = SustainableChoicesRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Please check your commute calculator inputs (distance, days, weeks) and try again.',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const result = await generateSustainableChoices(
      parsed.data,
      getOpaqueRequesterScope(req)
    );
    res.json(result);
  });

  router.post('/ai/community', async (req, res) => {
    const parsed = CommunityRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Please describe your local pollution challenge (at least 3 characters).',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const plan = await generateCommunityPlan(
      parsed.data,
      getOpaqueRequesterScope(req)
    );
    res.json(plan);
  });

  router.post('/ai/chat', async (req, res) => {
    const parsed = ChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Please enter a valid question (1–500 characters).',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const result = await generateChatResponse(
      parsed.data.message,
      parsed.data.history,
      parsed.data.airQuality,
      parsed.data.profile,
      parsed.data.aqiScale,
      parsed.data.forceRefresh,
      getOpaqueRequesterScope(req)
    );
    res.json(result);
  });

  router.use((_req, res) => {
    res.status(404).json({
      error: 'API endpoint not found.',
    });
  });

  return router;
}

export function createExpressApp(options: ExpressAppOptions = {}): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(applySecurityHeaders);
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', createApiRouter(options));

  // Clean JSON error handler for malformed JSON bodies or unexpected API errors (never leaks stack traces)
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (err instanceof SyntaxError && 'body' in err) {
        res.status(400).json({ error: 'Invalid JSON request payload.' });
        return;
      }
      if (res.headersSent) {
        next(err);
        return;
      }
      res.status(500).json({
        error: 'An unexpected server error occurred. Please try again shortly.',
      });
    }
  );

  return app;
}
