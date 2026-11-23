import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createExpressApp } from '../server/app.ts';
import {
  classifyGeminiError,
  setGeminiClientFactoryForTesting,
} from '../server/services/geminiService.ts';
import { getDemoScenario } from '../src/shared/demoScenarios.ts';
import type { HouseholdProfile } from '../src/shared/types.ts';

const SAMPLE_PROFILE: HouseholdProfile = {
  lifestyle: 'family_with_school_kids',
  commuteMode: 'solo_petrol_car',
  commuteDistanceKm: 14,
  commuteDaysPerWeek: 5,
  preferredOutdoorWindow: 'early_morning',
  hasChildren: true,
  hasOlderAdults: true,
  hasRespiratorySensitivity: true,
  cookingFuel: 'gas_stove',
  hasAirPurifier: true,
  hasRangeHoodExhaust: true,
  buildingType: 'apartment',
  notes: '',
};

function assertCleanFriendlyMessage(msg: string | undefined): void {
  expect(msg).toBeTruthy();
  expect(msg).not.toContain('{');
  expect(msg).not.toContain('}');
  expect(msg).not.toContain('"error"');
  expect(msg).not.toContain('RESOURCE_EXHAUSTED');
  expect(msg).not.toContain('UNAVAILABLE');
  expect(msg).not.toContain('stack');
}

describe('Gemini Error Classification (No Raw JSON Leakage)', () => {
  it('maps raw JSON 503 high-demand payloads to friendly service_unavailable message', () => {
    const raw503 = new Error(
      '{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}'
    );
    const classified = classifyGeminiError(raw503);
    expect(classified.category).toBe('service_unavailable');
    expect(classified.message.toLowerCase()).toContain('temporarily unavailable');
    assertCleanFriendlyMessage(classified.message);
  });

  it('maps HTTP 429 / RESOURCE_EXHAUSTED errors to friendly rate_limit message', () => {
    const raw429 = new Error(
      '{"error":{"code":429,"message":"Quota exceeded for quota metric","status":"RESOURCE_EXHAUSTED"}}'
    );
    const classified = classifyGeminiError(raw429);
    expect(classified.category).toBe('rate_limit');
    expect(classified.message.toLowerCase()).toMatch(/rate limit|usage/);
    assertCleanFriendlyMessage(classified.message);
  });

  it('maps 401/403 API_KEY_INVALID errors to friendly invalid_key message', () => {
    const err = { status: 403, message: 'API_KEY_INVALID: key not valid' };
    const classified = classifyGeminiError(err);
    expect(classified.category).toBe('invalid_key');
    expect(classified.message).toContain('GEMINI_API_KEY');
    assertCleanFriendlyMessage(classified.message);
  });

  it('maps unknown technical errors to generic friendly provider_error without leaking internals', () => {
    const err = new Error('ECONNRESET at TLSSocket.onStreamRead (/node_modules/undici/index.js:99)');
    const classified = classifyGeminiError(err);
    expect(classified.category).toBe('provider_error');
    expect(classified.message).not.toContain('ECONNRESET');
    expect(classified.message).not.toContain('TLSSocket');
    assertCleanFriendlyMessage(classified.message);
  });
});

describe('SmogWise Express API Behavior, Fallback & Validation', () => {
  const app = createExpressApp();
  let originalGeminiKey: string | undefined;

  beforeEach(() => {
    originalGeminiKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    setGeminiClientFactoryForTesting(null);
  });

  afterEach(() => {
    setGeminiClientFactoryForTesting(null);
    if (originalGeminiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalGeminiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  });

  it('GET /api/health returns service status without leaking secrets', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.geminiConfigured).toBe(false);
    expect(typeof res.body.waqiConfigured).toBe('boolean');
  });

  it('GET /api/locations/search validates query length', async () => {
    const res = await request(app).get('/api/locations/search?q=a');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('GET /api/air-quality rejects invalid coordinates', async () => {
    const res = await request(app).get('/api/air-quality?lat=120&lon=10');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid coordinates');
  });

  it('GET /api/air-quality/demo/:scenarioId returns clearly labeled US EPA AQI demo data or 404', async () => {
    const okRes = await request(app).get('/api/air-quality/demo/delhi-winter-smog');
    expect(okRes.status).toBe(200);
    expect(okRes.body.mode).toBe('demo');
    expect(okRes.body.source.provider).toBe('demo');
    expect(okRes.body.source.aqiScale).toContain('US EPA AQI');
    expect(okRes.body.source.name).toContain('Demo Scenario');
    expect(okRes.body.current.usAqi).toBe(312);

    const notFoundRes = await request(app).get('/api/air-quality/demo/does-not-exist');
    expect(notFoundRes.status).toBe(404);
  });

  it('returns clean 400 JSON error on malformed JSON payloads instead of HTML stack traces', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Content-Type', 'application/json')
      .send('{"brokenJson": true');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid JSON request payload.');
  });

  it('POST /api/ai/routine validates body and returns clearly labeled missing_key fallback with lowEmissionHabits', async () => {
    const invalidRes = await request(app).post('/api/ai/routine').send({ bad: true });
    expect(invalidRes.status).toBe(400);

    const demoAq = getDemoScenario('delhi-winter-smog');
    const res = await request(app).post('/api/ai/routine').send({
      airQuality: demoAq,
      profile: SAMPLE_PROFILE,
    });

    expect(res.status).toBe(200);
    expect(res.body.generatedBy).toBe('fallback');
    expect(res.body.errorCategory).toBe('missing_key');
    expect(res.body.fallbackReason).toContain('GEMINI_API_KEY');
    assertCleanFriendlyMessage(res.body.fallbackReason);
    expect(res.body.scheduleBlocks.length).toBeGreaterThanOrEqual(3);
    expect(res.body.commuteAlternatives.length).toBeGreaterThanOrEqual(2);
    expect(res.body.lowEmissionHabits.length).toBeGreaterThanOrEqual(3);
  });

  it('POST /api/ai/indoor returns evidence-grounded indoor guidance with myth checks', async () => {
    const demoAq = getDemoScenario('lahore-haze');
    const res = await request(app).post('/api/ai/indoor').send({
      airQuality: demoAq,
      profile: SAMPLE_PROFILE,
    });

    expect(res.status).toBe(200);
    expect(res.body.generatedBy).toBe('fallback');
    expect(res.body.errorCategory).toBe('missing_key');
    expect(res.body.ventilationStatus).toBe('Keep Windows Closed');
    expect(res.body.mythCheck.length).toBeGreaterThanOrEqual(2);
  });

  it('returns HTTP 404 JSON for unknown /api/* routes instead of falling through to SPA HTML', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.error).toBe('API endpoint not found.');
  });

  it('POST /api/ai/community validates challenge length and supports all four community settings', async () => {
    const badRes = await request(app).post('/api/ai/community').send({
      setting: 'school',
      groupSize: '250_to_1000',
      primaryChallenge: 'a',
      airQuality: null,
    });
    expect(badRes.status).toBe(400);

    const settings = ['school', 'housing_society', 'office', 'neighborhood_group'] as const;
    for (const setting of settings) {
      const okRes = await request(app).post('/api/ai/community').send({
        setting,
        groupSize: '250_to_1000',
        primaryChallenge: `Winter smog mitigation for ${setting}`,
        resourcesAvailable: 'Volunteer committee and notice boards',
        airQuality: getDemoScenario('delhi-winter-smog'),
      });

      expect(okRes.status).toBe(200);
      expect(okRes.body.generatedBy).toBe('fallback');
      expect(okRes.body.errorCategory).toBe('missing_key');
      expect(okRes.body.smogDayProtocol.length).toBeGreaterThanOrEqual(2);
      expect(okRes.body.awarenessCampaign.keyMessages.length).toBeGreaterThanOrEqual(2);
      expect(okRes.body.expectedOutcomes.length).toBeGreaterThanOrEqual(2);
      expect(okRes.body.measurableIndicators.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('POST /api/ai/chat handles unavailable AQI data honestly and sanitizes control chars', async () => {
    const emptyRes = await request(app).post('/api/ai/chat').send({
      message: '   ',
      airQuality: null,
    });
    expect(emptyRes.status).toBe(400);

    const res = await request(app).post('/api/ai/chat').send({
      message: 'Should I take my kids\u0007 to the park this afternoon?',
      history: [],
      airQuality: null,
      profile: SAMPLE_PROFILE,
    });

    expect(res.status).toBe(200);
    expect(res.body.generatedBy).toBe('fallback');
    expect(res.body.errorCategory).toBe('missing_key');
    expect(res.body.reply.toLowerCase()).toContain('unavailable');
    assertCleanFriendlyMessage(res.body.errorNotice);
    expect(res.body.verifiedDataUsed.some((item: string) => item.includes('No live AQI reading'))).toBe(true);
    expect(res.body.followUpSuggestions.length).toBeGreaterThanOrEqual(2);
  });

  it('POST /api/ai/chat handles Gemini HTTP 503 raw JSON error cleanly with exactly 1 API attempt', async () => {
    const generateContent = vi.fn().mockRejectedValue(
      new Error(
        '{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}'
      )
    );
    setGeminiClientFactoryForTesting(() => ({ models: { generateContent } }));

    const res = await request(app).post('/api/ai/chat').send({
      message: 'Can I open my windows tonight?',
      history: [],
      airQuality: getDemoScenario('delhi-winter-smog'),
      profile: SAMPLE_PROFILE,
    });

    expect(res.status).toBe(200);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(res.body.generatedBy).toBe('fallback');
    expect(res.body.errorCategory).toBe('service_unavailable');
    expect(res.body.errorNotice.toLowerCase()).toContain('temporarily unavailable');
    assertCleanFriendlyMessage(res.body.errorNotice);
    expect(res.body.reply).toBeTruthy();
  });

  it('POST /api/ai/chat handles Gemini HTTP 429 rate-limit error cleanly with exactly 1 API attempt', async () => {
    const generateContent = vi.fn().mockRejectedValue(
      new Error(
        '{"error":{"code":429,"message":"You exceeded your current quota","status":"RESOURCE_EXHAUSTED"}}'
      )
    );
    setGeminiClientFactoryForTesting(() => ({ models: { generateContent } }));

    const res = await request(app).post('/api/ai/chat').send({
      message: 'Is metro better than driving in winter smog?',
      history: [],
      airQuality: getDemoScenario('beijing-moderate'),
      profile: SAMPLE_PROFILE,
    });

    expect(res.status).toBe(200);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(res.body.generatedBy).toBe('fallback');
    expect(res.body.errorCategory).toBe('rate_limit');
    expect(res.body.errorNotice.toLowerCase()).toMatch(/rate limit|usage/);
    assertCleanFriendlyMessage(res.body.errorNotice);
  });

  it('POST /api/ai/chat falls back gracefully when Gemini returns malformed JSON', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: 'This is not valid JSON {{{',
    });
    setGeminiClientFactoryForTesting(() => ({ models: { generateContent } }));

    const res = await request(app).post('/api/ai/chat').send({
      message: 'Should I wear an N95 mask outdoors?',
      history: [],
      airQuality: getDemoScenario('delhi-winter-smog'),
      profile: SAMPLE_PROFILE,
    });

    expect(res.status).toBe(200);
    expect(res.body.generatedBy).toBe('fallback');
    expect(res.body.errorCategory).toBe('provider_error');
    assertCleanFriendlyMessage(res.body.errorNotice);
    expect(res.body.reply.toLowerCase()).toContain('n95');
  });

  it('POST /api/ai/chat forwards conversation follow-up history and returns followUpSuggestions', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        reply:
          'Following up on your morning commute question: in New Delhi (Demo Scenario US EPA AQI 312), enclosed metro rail plus an N95 mask for station walks reduces exposure compared to open roadside transit.',
        generalGuidanceNote:
          'Combines active Demo Scenario AQI context with general particulate exposure guidance.',
        followUpSuggestions: [
          'How should I clean or replace N95 masks during smog weeks?',
          'Should I run my HEPA purifier overnight after returning home?',
        ],
      }),
    });
    setGeminiClientFactoryForTesting(() => ({ models: { generateContent } }));

    const res = await request(app).post('/api/ai/chat').send({
      message: 'What about taking the metro instead?',
      history: [
        { role: 'user', content: 'Is it safe to cycle to work today?' },
        { role: 'assistant', content: 'At US EPA AQI 312 (Demo), avoid outdoor cycling.' },
      ],
      airQuality: getDemoScenario('delhi-winter-smog'),
      profile: SAMPLE_PROFILE,
    });

    expect(res.status).toBe(200);
    expect(generateContent).toHaveBeenCalledTimes(1);
    const passedPrompt = String(generateContent.mock.calls[0][0].contents);
    expect(passedPrompt).toContain('Is it safe to cycle to work today?');
    expect(passedPrompt).toContain('New Delhi');
    expect(passedPrompt).toContain('Data Freshness:');
    expect(res.body.generatedBy).toBe('gemini');
    expect(res.body.followUpSuggestions).toHaveLength(2);
    expect(res.body.verifiedDataUsed.length).toBeGreaterThanOrEqual(2);
  });

  it('POST /api/ai/chat preserves Hindi and Marathi Unicode questions cleanly', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        reply: 'नवी दिल्ली (डेमो डेटा, US EPA AQI 312) मध्ये आज बाहेर व्यायाम टाळा आणि खिडक्या बंद ठेवा.',
        generalGuidanceNote: 'हे सामान्य हवा गुणवत्ता मार्गदर्शन आहे, वैद्यकीय सल्ला नाही.',
        followUpSuggestions: ['घरातील स्वयंपाकाचा धूर कसा कमी करावा?'],
      }),
    });
    setGeminiClientFactoryForTesting(() => ({ models: { generateContent } }));

    const res = await request(app).post('/api/ai/chat').send({
      message: 'आज हवा की गुणवत्ता कैसी है और क्या बच्चों को बाहर भेजना सुरक्षित है?',
      history: [],
      airQuality: getDemoScenario('delhi-winter-smog'),
      profile: SAMPLE_PROFILE,
    });

    expect(res.status).toBe(200);
    const passedPrompt = String(generateContent.mock.calls[0][0].contents);
    expect(passedPrompt).toContain('बच्चों को बाहर भेजना');
    expect(res.body.generatedBy).toBe('gemini');
    expect(res.body.reply).toContain('US EPA AQI 312');
  });

  it('POST /api/ai/routine grounds Gemini prompt with location, weather, freshness, and returns dataSourcesUsed', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        summary: 'Indoor-first routine for severe winter smog with calm wind dispersion.',
        saferOutdoorWindowSummary: 'No low-risk outdoor window available today.',
        scheduleBlocks: [
          {
            timeWindow: '07:00 – 09:00',
            activity: 'Indoor warm-up and school prep',
            recommendation: 'Avoid outdoor drop-off waiting.',
            whyItMatters: 'Morning thermal inversions trap fine PM2.5 near street level.',
            exposureLevel: 'Elevated',
          },
        ],
        commuteAlternatives: [
          {
            option: 'Metro Rail',
            feasibilityNote: 'Strong match for your 14 km daily corridor.',
            airQualityBenefit: 'Cuts exposure to cabin exhaust and reduces per-km emissions.',
          },
        ],
        lowEmissionHabits: [
          'Combine afternoon errands into one trip to avoid extra cold starts.',
          'Use lids on pots and run kitchen exhaust to cut indoor gas stove emissions.',
        ],
        whyItMattersHighlights: ['Reduces peak inversion exposure for children and seniors.'],
      }),
    });
    setGeminiClientFactoryForTesting(() => ({ models: { generateContent } }));

    const aqWithWeather = {
      ...getDemoScenario('delhi-winter-smog')!,
      weather: {
        temperatureC: 11.4,
        relativeHumidityPct: 78,
        windSpeedKmh: 4.2,
        sourceName: 'Open-Meteo Weather Forecast Model',
      },
    };

    const res = await request(app).post('/api/ai/routine').send({
      airQuality: aqWithWeather,
      profile: SAMPLE_PROFILE,
    });

    expect(res.status).toBe(200);
    expect(generateContent).toHaveBeenCalledTimes(1);
    const passedPrompt = String(generateContent.mock.calls[0][0].contents);
    expect(passedPrompt).toContain('11.4°C');
    expect(passedPrompt).toContain('Wind 4.2 km/h');
    expect(passedPrompt).toContain('Data Freshness:');
    expect(res.body.generatedBy).toBe('gemini');
    expect(res.body.lowEmissionHabits).toHaveLength(2);
    expect(res.body.dataSourcesUsed.some((s: string) => s.includes('11.4°C'))).toBe(true);
    expect(res.body.fallbackReason).toBeUndefined();
  });

  it('POST /api/ai/routine falls back cleanly on Gemini 503 with zero raw JSON', async () => {
    const generateContent = vi.fn().mockRejectedValue({
      error: { code: 503, status: 'UNAVAILABLE', message: 'Backend overloaded' },
    });
    setGeminiClientFactoryForTesting(() => ({ models: { generateContent } }));

    const res = await request(app).post('/api/ai/routine').send({
      airQuality: getDemoScenario('london-clean'),
      profile: SAMPLE_PROFILE,
    });

    expect(res.status).toBe(200);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(res.body.generatedBy).toBe('fallback');
    expect(res.body.errorCategory).toBe('service_unavailable');
    assertCleanFriendlyMessage(res.body.fallbackReason);
    expect(res.body.lowEmissionHabits.length).toBeGreaterThanOrEqual(3);
    expect(res.body.dataSourcesUsed.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/ai/indoor and /api/ai/community return live Gemini responses with expectedOutcomes and dataSourcesUsed', async () => {
    const indoorMock = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        ventilationStatus: 'Keep Windows Closed',
        ventilationGuidance: 'Outdoor US EPA AQI is Very Unhealthy; keep exterior air out.',
        cookingActions: [
          {
            title: 'Run range hood exhaust',
            action: 'Ventilate cooking fumes directly outdoors when using the gas stove.',
            rationale: 'Removes NO2 and ultrafine particulates at the source.',
          },
        ],
        cleaningActions: [
          {
            title: 'Damp-mop hard floors',
            action: 'Use a damp microfiber mop instead of dry sweeping.',
            rationale: 'Prevents resuspending settled PM10 and PM2.5 dust.',
          },
        ],
        filtrationGuidance: [
          {
            title: 'Run True HEPA continuously',
            action: 'Operate purifier in main occupied room with doors closed.',
            rationale: 'Maintains lower indoor PM2.5 during haze episodes.',
          },
        ],
        mythCheck: [
          {
            claim: 'Salt lamps purify smog indoors',
            evidenceReality: 'No peer-reviewed evidence shows salt lamps lower indoor PM2.5.',
          },
        ],
      }),
    });
    setGeminiClientFactoryForTesting(() => ({ models: { generateContent: indoorMock } }));

    const indoorRes = await request(app).post('/api/ai/indoor').send({
      airQuality: getDemoScenario('lahore-haze'),
      profile: SAMPLE_PROFILE,
    });
    expect(indoorRes.status).toBe(200);
    expect(indoorRes.body.generatedBy).toBe('gemini');
    expect(indoorRes.body.ventilationStatus).toBe('Keep Windows Closed');
    expect(indoorRes.body.dataSourcesUsed.length).toBeGreaterThanOrEqual(2);

    const communityMock = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        title: 'School Clean-Air Gate Action Plan',
        objective: 'Eliminate idling and shift PE indoors when US EPA AQI exceeds 150.',
        smogDayProtocol: [
          {
            title: 'Move recess indoors above US AQI 151',
            description: 'Cancel outdoor sports and run classroom HEPA units.',
            owner: 'School Principal',
            timeframe: 'Immediate',
          },
        ],
        awarenessCampaign: {
          theme: 'Turn Keys Off for Clean School Air',
          keyMessages: ['Idling for 30 seconds wastes fuel and spikes curb PM2.5.'],
          channels: ['Parent WhatsApp broadcasts', 'Morning assembly announcements'],
        },
        emissionReductionActivities: [
          {
            title: 'No-Idling Drop-Off Line',
            description: 'Post clear engine-off signage at the main school gate.',
            owner: 'Parent Volunteers',
            timeframe: 'Week 1',
          },
        ],
        expectedOutcomes: [
          'Reduced tailpipe exhaust buildup along school gates during morning arrivals.',
          'Consistent indoor recess shifts during severe winter inversion days.',
        ],
        measurableIndicators: ['Count idling vehicles during morning drop-off weekly.'],
      }),
    });
    setGeminiClientFactoryForTesting(() => ({ models: { generateContent: communityMock } }));

    const communityRes = await request(app).post('/api/ai/community').send({
      setting: 'school',
      groupSize: '250_to_1000',
      primaryChallenge: 'Morning bus and car idling near classrooms',
      airQuality: getDemoScenario('delhi-winter-smog'),
    });
    expect(communityRes.status).toBe(200);
    expect(communityRes.body.generatedBy).toBe('gemini');
    expect(communityRes.body.title).toBe('School Clean-Air Gate Action Plan');
    expect(communityRes.body.expectedOutcomes).toHaveLength(2);
    expect(communityRes.body.dataSourcesUsed.length).toBeGreaterThanOrEqual(2);
  });

  it('POST /api/ai/health-advisory generates grounded Gemini guidance and falls back cleanly on missing key or 429', async () => {
    // 1. Missing key fallback with unavailable AQI
    const fallbackRes = await request(app).post('/api/ai/health-advisory').send({
      airQuality: null,
      profile: SAMPLE_PROFILE,
      focusNote: 'School-age kids have soccer practice',
    });
    expect(fallbackRes.status).toBe(200);
    expect(fallbackRes.body.generatedBy).toBe('fallback');
    expect(fallbackRes.body.errorCategory).toBe('missing_key');
    expect(fallbackRes.body.groups).toHaveLength(4);
    expect(fallbackRes.body.medicalDisclaimer).toContain('does not diagnose');

    // 2. Gemini live success with severe AQI
    const healthMock = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        summary: 'Hazardous Demo Scenario conditions in New Delhi warrant strict indoor protection for children, seniors, and sensitive lungs.',
        groups: [
          {
            id: 'children',
            label: 'Children',
            riskSummary: 'High sensitivity to fine PM2.5.',
            outdoorGuidance: 'Move outdoor soccer practice indoors today.',
            protectiveSteps: ['Keep bedroom windows closed and run HEPA filtration.'],
            watchSigns: ['Persistent coughing or wheezing — consult a pediatrician.'],
          },
          {
            id: 'adults',
            label: 'Adults',
            riskSummary: 'Elevated airway irritation risk.',
            outdoorGuidance: 'Avoid outdoor jogging; wear an N95 for essential transit.',
            protectiveSteps: ['Use vehicle cabin recirculation mode.'],
            watchSigns: ['Chest tightness or shortness of breath — consult a clinician.'],
          },
          {
            id: 'older_adults',
            label: 'Older Adults',
            riskSummary: 'High cardiovascular and respiratory vulnerability.',
            outdoorGuidance: 'Stay indoors in a clean-air room.',
            protectiveSteps: ['Arrange grocery delivery and stay hydrated.'],
            watchSigns: ['Shortness of breath at rest — seek prompt medical evaluation.'],
          },
          {
            id: 'respiratory',
            label: 'Respiratory Sensitivities',
            riskSummary: 'High asthma/COPD flare-up risk.',
            outdoorGuidance: 'Remain indoors with continuous HEPA filtration.',
            protectiveSteps: ['Follow your clinician-provided written action plan.'],
            watchSigns: ['Frequent rescue inhaler use — contact your healthcare provider.'],
          },
        ],
      }),
    });
    setGeminiClientFactoryForTesting(() => ({ models: { generateContent: healthMock } }));

    const liveRes = await request(app).post('/api/ai/health-advisory').send({
      airQuality: getDemoScenario('delhi-winter-smog'),
      profile: SAMPLE_PROFILE,
      focusNote: 'School-age kids have soccer practice',
    });
    expect(liveRes.status).toBe(200);
    expect(healthMock).toHaveBeenCalledTimes(1);
    const promptPassed = String(healthMock.mock.calls[0][0].contents);
    expect(promptPassed).toContain('New Delhi');
    expect(promptPassed).toContain('soccer practice');
    expect(liveRes.body.generatedBy).toBe('gemini');
    expect(liveRes.body.severeWarning).toContain('Hazardous Air Quality Warning');
    expect(liveRes.body.groups).toHaveLength(4);
    expect(liveRes.body.dataSourcesUsed.length).toBeGreaterThanOrEqual(2);

    // 3. Gemini 429 fallback
    const rateLimitMock = vi.fn().mockRejectedValue({ status: 429, message: 'RESOURCE_EXHAUSTED' });
    setGeminiClientFactoryForTesting(() => ({ models: { generateContent: rateLimitMock } }));

    const errRes = await request(app).post('/api/ai/health-advisory').send({
      airQuality: getDemoScenario('lahore-haze'),
      profile: SAMPLE_PROFILE,
    });
    expect(errRes.status).toBe(200);
    expect(errRes.body.generatedBy).toBe('fallback');
    expect(errRes.body.errorCategory).toBe('rate_limit');
    assertCleanFriendlyMessage(errRes.body.fallbackReason);
  });

  it('POST /api/ai/sustainable validates inputs, grounds Gemini with verified CO2e calculations, and falls back cleanly on 503', async () => {
    // 1. Validation check on invalid distance
    const badRes = await request(app).post('/api/ai/sustainable').send({
      airQuality: null,
      profile: SAMPLE_PROFILE,
      commuteScenario: {
        currentMode: 'solo_petrol_car',
        targetMode: 'metro_rail',
        oneWayDistanceKm: 0,
        daysPerWeek: 5,
        weeksPerYear: 46,
      },
    });
    expect(badRes.status).toBe(400);

    // 2. Gemini success with verified calculator grounding
    const sustainableMock = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        headline: 'Low-Emission Mobility & Winter Energy Plan for New Delhi',
        summary: 'Prioritize enclosed metro transit and indoor thermal draft sealing during severe winter haze.',
        calculatedImpactSummary:
          'Switching 10 km one-way (5 days/wk, 50 wks/yr) from Solo Petrol Car to Metro Rail saves an estimated 680 kg CO₂e/year (79.5%) using UK DESNZ/DEFRA operational factors.',
        recommendations: [
          {
            category: 'Public Transport',
            title: 'Shift Solo Car Commutes to Metro Rail',
            action: 'Take metro rail for your 10 km commute.',
            environmentalBenefit: 'Cuts estimated operational CO₂e by 680 kg/yr and lowers rush-hour NO₂.',
            assumptionsAndLimits: 'Assumes average DESNZ/DEFRA occupancy and grid mix.',
            smogConditionNote: 'Enclosed rail reduces direct roadside exhaust inhalation.',
          },
          {
            category: 'Carpooling',
            title: 'Join a 3-Rider Office Carpool',
            action: 'Rotate driving with two colleagues along your corridor.',
            environmentalBenefit: 'Cuts per-rider vehicle-km and local idling emissions.',
            assumptionsAndLimits: 'Assumes minimal detour distance.',
            smogConditionNote: 'Use cabin recirculation mode during morning smog.',
          },
          {
            category: 'Walking & Cycling',
            title: 'Reserve Active Mobility for Cleaner Days',
            action: 'Walk short neighborhood trips only when US EPA AQI drops below 100.',
            environmentalBenefit: 'Eliminates cold-start car trips.',
            assumptionsAndLimits: 'Health co-benefit requires avoiding severe PM2.5 exertion.',
            smogConditionNote: 'At Demo US EPA AQI 312, pause outdoor cycling today.',
          },
          {
            category: 'Reduced Vehicle Use',
            title: 'Chain Errands & Stop Idling',
            action: 'Combine weekly errands into a single trip and switch off engine if waiting >60s.',
            environmentalBenefit: 'Reduces cold-start NOx spikes.',
            assumptionsAndLimits: 'Qualitative benefit; varies by engine and traffic.',
            smogConditionNote: 'Cuts ground-level exhaust during winter inversions.',
          },
          {
            category: 'Energy Saving',
            title: 'Seal Drafts & Use Electric Kettle',
            action: 'Weatherstrip exterior frames and switch boiling tasks from gas to electric.',
            environmentalBenefit: 'Cuts winter heating demand and indoor gas NO₂.',
            assumptionsAndLimits: 'Actual savings depend on home insulation and local electricity mix.',
            smogConditionNote: 'Simultaneously keeps outdoor PM2.5 out of bedrooms.',
          },
        ],
        assumptionsDisclosure: [
          'Commute kg CO₂e figures use UK DESNZ / DEFRA 2024 operational passenger-km factors.',
          'Energy-saving habits are described qualitatively without fabricated utility savings.',
        ],
      }),
    });
    setGeminiClientFactoryForTesting(() => ({ models: { generateContent: sustainableMock } }));

    const liveRes = await request(app).post('/api/ai/sustainable').send({
      airQuality: getDemoScenario('delhi-winter-smog'),
      profile: SAMPLE_PROFILE,
      commuteScenario: {
        currentMode: 'solo_petrol_car',
        targetMode: 'metro_rail',
        oneWayDistanceKm: 10,
        daysPerWeek: 5,
        weeksPerYear: 50,
      },
      householdGoal: 'Lower winter heating and commute smog impact',
    });

    expect(liveRes.status).toBe(200);
    expect(sustainableMock).toHaveBeenCalledTimes(1);
    const promptPassed = String(sustainableMock.mock.calls[0][0].contents);
    expect(promptPassed).toContain('680 kg CO₂e/yr');
    expect(promptPassed).toContain('79.5%');
    expect(promptPassed).toContain('New Delhi');
    expect(liveRes.body.generatedBy).toBe('gemini');
    expect(liveRes.body.recommendations).toHaveLength(5);
    expect(liveRes.body.assumptionsDisclosure.length).toBeGreaterThanOrEqual(2);
    expect(liveRes.body.dataSourcesUsed.some((s: string) => s.includes('680 kg CO₂e/yr'))).toBe(true);

    // 3. Gemini 503 fallback
    const outageMock = vi.fn().mockRejectedValue(
      new Error('{"error":{"code":503,"message":"High demand","status":"UNAVAILABLE"}}')
    );
    setGeminiClientFactoryForTesting(() => ({ models: { generateContent: outageMock } }));

    const fallbackRes = await request(app).post('/api/ai/sustainable').send({
      airQuality: null,
      profile: SAMPLE_PROFILE,
      commuteScenario: {
        currentMode: 'solo_petrol_car',
        targetMode: 'metro_rail',
        oneWayDistanceKm: 10,
        daysPerWeek: 5,
        weeksPerYear: 50,
      },
    });
    expect(fallbackRes.status).toBe(200);
    expect(fallbackRes.body.generatedBy).toBe('fallback');
    expect(fallbackRes.body.errorCategory).toBe('service_unavailable');
    assertCleanFriendlyMessage(fallbackRes.body.fallbackReason);
    expect(fallbackRes.body.recommendations).toHaveLength(5);
    expect(fallbackRes.body.calculatedImpactSummary).toContain('680 kg CO₂e/year');
  });
});
