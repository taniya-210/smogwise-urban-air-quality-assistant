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
  isGeminiConfigured,
} from './services/geminiService.ts';
import {
  DEMO_SCENARIOS_LIST,
  getDemoScenario,
} from '../src/shared/demoScenarios.ts';

function sanitizeText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

const SanitizedString = (minLen: number, maxLen: number) =>
  z
    .string()
    .transform(sanitizeText)
    .pipe(z.string().min(minLen).max(maxLen));

const AirQualityPayloadSchema = z
  .object({
    location: z.object({
      name: SanitizedString(1, 120),
      admin1: z.string().transform(sanitizeText).pipe(z.string().max(120)).optional(),
      country: z.string().transform(sanitizeText).pipe(z.string().max(120)),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      timezone: z.string().transform(sanitizeText).pipe(z.string().max(80)),
    }),
    mode: z.enum(['live', 'demo', 'unavailable']),
    demoScenarioId: z.string().max(80).optional(),
    source: z.object({
      name: z.string().max(200),
      provider: z.enum(['open-meteo', 'waqi', 'demo', 'none']),
      isEstimated: z.boolean(),
      aqiScale: z.string().max(80).optional(),
      note: z.string().max(500),
    }),
    timestamp: z.string().nullable(),
    fetchedAt: z.string(),
    current: z.object({
      usAqi: z.number().nullable(),
      europeanAqi: z.number().nullable(),
      pm25: z.number().nullable(),
      pm10: z.number().nullable(),
      no2: z.number().nullable(),
      o3: z.number().nullable(),
      so2: z.number().nullable(),
      co: z.number().nullable(),
    }),
    hourly: z
      .array(
        z.object({
          time: z.string(),
          usAqi: z.number().nullable(),
          pm25: z.number().nullable(),
          pm10: z.number().nullable(),
          no2: z.number().nullable(),
          o3: z.number().nullable(),
        })
      )
      .max(48),
    weather: z
      .object({
        temperatureC: z.number().nullable(),
        relativeHumidityPct: z.number().nullable(),
        windSpeedKmh: z.number().nullable(),
        sourceName: z.string().max(120),
      })
      .nullable()
      .optional(),
    unavailableReason: z.string().max(400).optional(),
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
  commuteDistanceKm: z.number().min(0).max(300),
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

const RoutineRequestSchema = z.object({
  airQuality: AirQualityPayloadSchema,
  profile: HouseholdProfileSchema,
});

const IndoorRequestSchema = z.object({
  airQuality: AirQualityPayloadSchema,
  profile: HouseholdProfileSchema,
});

const HealthAdvisoryRequestSchema = z.object({
  airQuality: AirQualityPayloadSchema,
  profile: HouseholdProfileSchema,
  focusNote: z
    .string()
    .transform(sanitizeText)
    .pipe(z.string().max(300))
    .optional(),
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
    oneWayDistanceKm: z.number().min(0.1).max(300),
    daysPerWeek: z.number().int().min(1).max(7),
    weeksPerYear: z.number().int().min(1).max(52),
  }),
  householdGoal: z
    .string()
    .transform(sanitizeText)
    .pipe(z.string().max(300))
    .optional(),
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
});

const ChatRequestSchema = z.object({
  message: SanitizedString(1, 1200),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().transform(sanitizeText).pipe(z.string().max(2500)),
      })
    )
    .max(20)
    .default([]),
  airQuality: AirQualityPayloadSchema,
  profile: HouseholdProfileSchema.nullable().default(null),
});

export function createApiRouter(): express.Router {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      geminiConfigured: isGeminiConfigured(),
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
      lat: z.coerce.number().min(-90).max(90),
      lon: z.coerce.number().min(-180).max(180),
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
    const data = await fetchLiveAirQuality({
      name,
      admin1,
      country,
      latitude: lat,
      longitude: lon,
      timezone,
    });

    res.json(data);
  });

  router.get('/air-quality/demos', (_req, res) => {
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
    res.json(scenario);
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

    const plan = await generateRoutinePlan(parsed.data.airQuality, parsed.data.profile);
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

    const guidance = await generateIndoorGuidance(parsed.data.airQuality, parsed.data.profile);
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
      parsed.data.focusNote
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

    const result = await generateSustainableChoices(parsed.data);
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

    const plan = await generateCommunityPlan(parsed.data);
    res.json(plan);
  });

  router.post('/ai/chat', async (req, res) => {
    const parsed = ChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Please enter a valid question (1–1200 characters).',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const result = await generateChatResponse(
      parsed.data.message,
      parsed.data.history,
      parsed.data.airQuality,
      parsed.data.profile
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

export function createExpressApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', createApiRouter());

  // Clean JSON error handler for malformed JSON bodies or unexpected API errors
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
