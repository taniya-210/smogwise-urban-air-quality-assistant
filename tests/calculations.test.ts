import { describe, expect, it } from 'vitest';
import {
  buildPollutantDetails,
  calculateIndiaCpcbAqi,
  calculateIndiaCpcbSubIndex,
  calculatePm25SubIndex,
  findSaferOutdoorWindows,
  getAQICategory,
  getDataFreshness,
  getDominantPollutant,
  getFamilyHealthGuidance,
  getScaleAQI,
  getScaleReferenceTable,
  isLocationInIndia,
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

describe('India CPCB NAQI & Dual-Scale Switching Engine', () => {
  it('classifies all six official India CPCB NAQI categories accurately', () => {
    expect(getAQICategory(35, 'india_cpcb').name).toBe('Good');
    expect(getAQICategory(80, 'india_cpcb').name).toBe('Satisfactory');
    expect(getAQICategory(150, 'india_cpcb').name).toBe('Moderately Polluted');
    expect(getAQICategory(260, 'india_cpcb').name).toBe('Poor');
    expect(getAQICategory(340, 'india_cpcb').name).toBe('Very Poor');
    expect(getAQICategory(340, 'india_cpcb').isSevere).toBe(true);
    expect(getAQICategory(430, 'india_cpcb').name).toBe('Severe');
    expect(getAQICategory(430, 'india_cpcb').isSevere).toBe(true);
  });

  it('computes official India CPCB NAQI sub-indices across PM2.5, PM10, NO2, O3, SO2, and CO', () => {
    expect(calculateIndiaCpcbSubIndex('pm25', 30)).toBe(50);
    expect(calculateIndiaCpcbSubIndex('pm25', 60)).toBe(100);
    expect(calculateIndiaCpcbSubIndex('pm25', 90)).toBe(200);
    expect(calculateIndiaCpcbSubIndex('pm25', 120)).toBe(300);
    expect(calculateIndiaCpcbSubIndex('pm25', 250)).toBe(400);

    expect(calculateIndiaCpcbSubIndex('pm10', 50)).toBe(50);
    expect(calculateIndiaCpcbSubIndex('pm10', 100)).toBe(100);
    expect(calculateIndiaCpcbSubIndex('pm10', 250)).toBe(200);
    expect(calculateIndiaCpcbSubIndex('pm10', 350)).toBe(300);
    expect(calculateIndiaCpcbSubIndex('pm10', 430)).toBe(400);

    expect(calculateIndiaCpcbSubIndex('no2', 40)).toBe(50);
    expect(calculateIndiaCpcbSubIndex('o3', 100)).toBe(100);
    expect(calculateIndiaCpcbSubIndex('so2', 80)).toBe(100);
    // CO is stored in µg/m³ and converted to mg/m³ (1000 µg/m³ = 1.0 mg/m³ -> sub-index 50)
    expect(calculateIndiaCpcbSubIndex('co', 1000)).toBe(50);
    expect(calculateIndiaCpcbSubIndex('co', 2000)).toBe(100);
  });

  it('enforces the CPCB minimum pollutant rule (>= 3 pollutants including PM2.5 or PM10)', () => {
    const tooFew = calculateIndiaCpcbAqi({
      pm25: 90,
      pm10: 150,
      no2: null,
      o3: null,
      so2: null,
      co: null,
    });
    expect(tooFew.aqi).toBeNull();
    expect(tooFew.sufficientData).toBe(false);
    expect(tooFew.limitationNote).toContain('at least 3');

    const noPm = calculateIndiaCpcbAqi({
      pm25: null,
      pm10: null,
      no2: 40,
      o3: 80,
      so2: 40,
      co: 1000,
    });
    expect(noPm.aqi).toBeNull();
    expect(noPm.sufficientData).toBe(false);
    expect(noPm.limitationNote).toContain('PM2.5 or PM10');
  });

  it('produces genuinely distinct US EPA AQI vs India CPCB NAQI scores on identical pollutant concentrations', () => {
    const delhi = getDemoScenario('delhi-winter-smog')!;
    const usReading = getScaleAQI(delhi, 'us_epa');
    const cpcbReading = getScaleAQI(delhi, 'india_cpcb');

    expect(usReading.value).toBe(312);
    expect(usReading.category.name).toBe('Hazardous');

    expect(cpcbReading.value).not.toBeNull();
    expect(cpcbReading.value).not.toBe(usReading.value);
    expect(cpcbReading.isCalculatedFromConcentrations).toBe(true);
    expect(cpcbReading.isOfficialCpcbReading).toBe(false);
    expect(cpcbReading.dominantSubIndexPollutant).toBe('PM2.5');
    expect(cpcbReading.category.name).toBe('Very Poor');
    expect(cpcbReading.methodologyNote).toContain('Not an official CPCB');
  });

  it('detects Indian cities for automatic CPCB scale default and exposes scale-specific reference tables and guidance', () => {
    expect(
      isLocationInIndia({
        name: 'New Delhi',
        country: 'India',
        latitude: 28.6139,
        longitude: 77.209,
        timezone: 'Asia/Kolkata',
      })
    ).toBe(true);
    expect(
      isLocationInIndia({
        name: 'Mumbai',
        country: 'India',
        latitude: 19.076,
        longitude: 72.8777,
        timezone: 'Asia/Kolkata',
      })
    ).toBe(true);
    expect(
      isLocationInIndia({
        name: 'London',
        country: 'United Kingdom',
        latitude: 51.5074,
        longitude: -0.1278,
        timezone: 'Europe/London',
      })
    ).toBe(false);
    expect(isLocationInIndia(null)).toBe(false);

    const cpcbTable = getScaleReferenceTable('india_cpcb');
    expect(cpcbTable.map((r) => r.name)).toContain('Satisfactory');
    expect(cpcbTable.map((r) => r.name)).toContain('Moderately Polluted');

    const cpcbSevere = getFamilyHealthGuidance(425, 'india_cpcb');
    expect(cpcbSevere.severeWarning).toContain('Severe');
    expect(cpcbSevere.scale).toBe('india_cpcb');

    const delhi = getDemoScenario('delhi-winter-smog')!;
    const cpcbWindow = findSaferOutdoorWindows(delhi.hourly, 'india_cpcb');
    expect(cpcbWindow.available).toBe(true);
    expect(cpcbWindow.averageAqi).not.toBeNull();
    expect(cpcbWindow.peakAqi).not.toBeNull();
  });

  it('handles zero, negative, missing, NaN, Infinity, and extreme (>500) pollutant inputs safely across both scales', () => {
    // US EPA edge cases
    expect(getAQICategory(0, 'us_epa').name).toBe('Good');
    expect(getAQICategory(500, 'us_epa').name).toBe('Hazardous');
    expect(getAQICategory(750, 'us_epa').name).toBe('Hazardous');
    expect(getAQICategory(Number.NaN, 'us_epa').name).toBe('Unavailable');
    expect(getAQICategory(Number.POSITIVE_INFINITY, 'us_epa').name).toBe('Unavailable');
    expect(calculatePm25SubIndex(0)).toBe(0);
    expect(calculatePm25SubIndex(Number.NaN)).toBeNull();
    expect(calculatePm25SubIndex(Number.POSITIVE_INFINITY)).toBeNull();
    expect(calculatePm25SubIndex(500)).toBeGreaterThan(500);

    // India CPCB NAQI edge cases
    expect(getAQICategory(0, 'india_cpcb').name).toBe('Good');
    expect(getAQICategory(-10, 'india_cpcb').name).toBe('Unavailable');
    expect(getAQICategory(Number.NaN, 'india_cpcb').name).toBe('Unavailable');
    expect(getAQICategory(650, 'india_cpcb').name).toBe('Severe');

    expect(calculateIndiaCpcbSubIndex('pm25', 0)).toBe(0);
    expect(calculateIndiaCpcbSubIndex('pm25', -5)).toBeNull();
    expect(calculateIndiaCpcbSubIndex('pm25', null)).toBeNull();
    expect(calculateIndiaCpcbSubIndex('pm25', Number.NaN)).toBeNull();
    expect(calculateIndiaCpcbSubIndex('pm25', 9999)).toBe(500); // CPCB caps at 500

    const extremeCpcb = calculateIndiaCpcbAqi({
      pm25: 900,
      pm10: 1200,
      no2: 600,
      o3: null,
      so2: null,
      co: null,
    });
    expect(extremeCpcb.sufficientData).toBe(true);
    expect(extremeCpcb.aqi).toBe(500);
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

  it('rejects zero, negative, NaN, and extreme out-of-range inputs with validation errors', () => {
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
        oneWayDistanceKm: -12,
        daysPerWeek: 5,
        weeksPerYear: 46,
      }).valid
    ).toBe(false);

    expect(
      calculateCommuteImpact({
        currentMode: 'solo_petrol_car',
        targetMode: 'city_bus',
        oneWayDistanceKm: Number.NaN,
        daysPerWeek: 5,
        weeksPerYear: 46,
      }).valid
    ).toBe(false);

    expect(
      calculateCommuteImpact({
        currentMode: 'solo_petrol_car',
        targetMode: 'city_bus',
        oneWayDistanceKm: 1000,
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
