import { describe, expect, it } from 'vitest';
import {
  buildPollutantDetails,
  calculatePm25SubIndex,
  findSaferOutdoorWindows,
  getAQICategory,
  getDataFreshness,
  getDominantPollutant,
  getFamilyHealthGuidance,
} from '../src/shared/aqi.ts';
import { calculateCommuteImpact } from '../src/shared/emissions.ts';
import { DEMO_SCENARIOS_LIST, getDemoScenario } from '../src/shared/demoScenarios.ts';

describe('US EPA AQI Categorization & Calculations', () => {
  it('classifies all six US EPA AQI categories accurately', () => {
    expect(getAQICategory(0).name).toBe('Good');
    expect(getAQICategory(50).name).toBe('Good');
    expect(getAQICategory(51).name).toBe('Moderate');
    expect(getAQICategory(100).name).toBe('Moderate');
    expect(getAQICategory(125).name).toBe('Unhealthy for Sensitive Groups');
    expect(getAQICategory(175).name).toBe('Unhealthy');
    expect(getAQICategory(240).name).toBe('Very Unhealthy');
    expect(getAQICategory(240).isSevere).toBe(true);
    expect(getAQICategory(312).name).toBe('Hazardous');
    expect(getAQICategory(312).isSevere).toBe(true);
  });

  it('returns Unavailable for null, undefined, or negative AQI', () => {
    expect(getAQICategory(null).name).toBe('Unavailable');
    expect(getAQICategory(undefined).name).toBe('Unavailable');
    expect(getAQICategory(-5).name).toBe('Unavailable');
  });

  it('computes US EPA 2024 PM2.5 sub-index breakpoints accurately', () => {
    expect(calculatePm25SubIndex(0)).toBe(0);
    expect(calculatePm25SubIndex(9.0)).toBe(50);
    expect(calculatePm25SubIndex(35.4)).toBe(100);
    expect(calculatePm25SubIndex(55.4)).toBe(150);
    expect(calculatePm25SubIndex(125.4)).toBe(200);
    expect(calculatePm25SubIndex(225.4)).toBe(300);
    expect(calculatePm25SubIndex(-1)).toBeNull();
  });

  it('identifies lowest 3-hour outdoor window and peak hour from hourly series', () => {
    const demo = getDemoScenario('beijing-moderate');
    expect(demo).not.toBeNull();

    const result = findSaferOutdoorWindows(demo!.hourly);
    expect(result.available).toBe(true);
    expect(result.averageAqi).not.toBeNull();
    expect(result.peakAqi).not.toBeNull();
    expect(result.averageAqi!).toBeLessThan(result.peakAqi!);
    expect(result.startLabel).toBeTruthy();
    expect(result.endLabel).toBeTruthy();
  });

  it('never fabricates safer outdoor windows when hourly data is missing', () => {
    const result = findSaferOutdoorWindows([]);
    expect(result.available).toBe(false);
    expect(result.startLabel).toBeNull();
    expect(result.averageAqi).toBeNull();
  });

  it('computes dominant pollutant relative to WHO guidelines and handles null pollutants honestly', () => {
    const details = buildPollutantDetails({
      usAqi: 180,
      europeanAqi: 110,
      pm25: 90,
      pm10: 120,
      no2: 40,
      o3: null,
      so2: null,
      co: null,
    });

    const o3 = details.find((d) => d.key === 'o3');
    expect(o3?.value).toBeNull();
    expect(o3?.ratioToWho).toBeNull();

    const dominant = getDominantPollutant({
      usAqi: 180,
      europeanAqi: 110,
      pm25: 90, // 6.0x WHO (15)
      pm10: 120, // 2.67x WHO (45)
      no2: 40, // 1.6x WHO (25)
      o3: null,
      so2: null,
      co: null,
    });
    expect(dominant).toContain('PM2.5');
  });

  it('triggers severe pollution warnings only at AQI >= 201 and distinguishes US EPA AQI from India CPCB NAQI', () => {
    const moderate = getFamilyHealthGuidance(85);
    expect(moderate.severeWarning).toBeNull();
    expect(moderate.groups).toHaveLength(4);
    expect(moderate.medicalDisclaimer).toContain('does not diagnose');
    expect(moderate.medicalDisclaimer).toContain('US EPA AQI');
    expect(moderate.medicalDisclaimer).toContain('CPCB');

    const veryUnhealthy = getFamilyHealthGuidance(245);
    expect(veryUnhealthy.severeWarning).toContain('Severe Smog Health Alert');

    const hazardous = getFamilyHealthGuidance(320);
    expect(hazardous.severeWarning).toContain('Hazardous Air Quality Warning');
  });

  it('evaluates data freshness across fresh, recent, stale, demo, and unavailable states', () => {
    const now = Date.parse('2026-01-15T12:00:00.000Z');

    const fresh = getDataFreshness(
      '2026-01-15T11:35:00.000Z',
      '2026-01-15T11:55:00.000Z',
      'live',
      now
    );
    expect(fresh.status).toBe('fresh');
    expect(fresh.isStale).toBe(false);
    expect(fresh.label).toContain('Fresh');

    const recent = getDataFreshness(
      '2026-01-15T10:00:00.000Z',
      '2026-01-15T11:50:00.000Z',
      'live',
      now
    );
    expect(recent.status).toBe('recent');
    expect(recent.isStale).toBe(false);

    const stale = getDataFreshness(
      '2026-01-15T06:00:00.000Z',
      '2026-01-15T06:05:00.000Z',
      'live',
      now
    );
    expect(stale.status).toBe('stale');
    expect(stale.isStale).toBe(true);
    expect(stale.label).toContain('Stale');

    const demo = getDataFreshness(
      '2026-01-15T06:00:00.000Z',
      '2026-01-15T12:00:00.000Z',
      'demo',
      now
    );
    expect(demo.status).toBe('demo');
    expect(demo.isStale).toBe(false);

    const unavailable = getDataFreshness(null, '2026-01-15T12:00:00.000Z', 'unavailable', now);
    expect(unavailable.status).toBe('unavailable');
    expect(unavailable.label).toContain('No current reading');
    expect(unavailable.isStale).toBe(true);

    const missingTs = getDataFreshness(null, null, 'live', now);
    expect(missingTs.status).toBe('stale');
    expect(missingTs.isStale).toBe(true);
  });

  it('labels all demo scenarios explicitly with US EPA AQI scale and demo mode', () => {
    expect(DEMO_SCENARIOS_LIST.length).toBeGreaterThanOrEqual(4);
    for (const summary of DEMO_SCENARIOS_LIST) {
      const data = getDemoScenario(summary.id);
      expect(data).not.toBeNull();
      expect(data!.mode).toBe('demo');
      expect(data!.source.provider).toBe('demo');
      expect(data!.source.aqiScale).toContain('US EPA AQI');
    }
  });
});

describe('Sustainable Commute Emissions Calculator', () => {
  it('calculates transparent CO2e savings from solo petrol car to metro rail', () => {
    // 10 km one-way * 2 * 5 days * 50 weeks = 5,000 km/yr
    // solo car = 5000 * 0.171 = 855.0 kg CO2e
    // metro = 5000 * 0.035 = 175.0 kg CO2e
    // saved = 680.0 kg CO2e (79.5%)
    const res = calculateCommuteImpact({
      currentMode: 'solo_petrol_car',
      targetMode: 'metro_rail',
      oneWayDistanceKm: 10,
      daysPerWeek: 5,
      weeksPerYear: 50,
    });

    expect(res.valid).toBe(true);
    expect(res.annualRoundTripKm).toBe(5000);
    expect(res.annualCurrentKgCo2e).toBe(855);
    expect(res.annualTargetKgCo2e).toBe(175);
    expect(res.annualSavedKgCo2e).toBe(680);
    expect(res.percentReduction).toBe(79.5);
    expect(res.assumptions.length).toBeGreaterThanOrEqual(3);
    expect(res.formulaDescription).toContain('680 kg CO₂e/yr');
  });

  it('calculates 100% transport CO2e reduction when shifting to cycling/walking', () => {
    const res = calculateCommuteImpact({
      currentMode: 'solo_petrol_car',
      targetMode: 'cycling_walking',
      oneWayDistanceKm: 5,
      daysPerWeek: 4,
      weeksPerYear: 40,
    });

    expect(res.valid).toBe(true);
    expect(res.annualTargetKgCo2e).toBe(0);
    expect(res.percentReduction).toBe(100);
  });

  it('rejects out-of-range inputs with validation errors', () => {
    expect(
      calculateCommuteImpact({
        currentMode: 'solo_petrol_car',
        targetMode: 'city_bus',
        oneWayDistanceKm: 0,
        daysPerWeek: 5,
        weeksPerYear: 46,
      }).valid
    ).toBe(false);

    expect(
      calculateCommuteImpact({
        currentMode: 'solo_petrol_car',
        targetMode: 'city_bus',
        oneWayDistanceKm: 10,
        daysPerWeek: 8,
        weeksPerYear: 46,
      }).valid
    ).toBe(false);

    expect(
      calculateCommuteImpact({
        currentMode: 'solo_petrol_car',
        targetMode: 'city_bus',
        oneWayDistanceKm: 10,
        daysPerWeek: 5,
        weeksPerYear: 60,
      }).valid
    ).toBe(false);
  });
});
