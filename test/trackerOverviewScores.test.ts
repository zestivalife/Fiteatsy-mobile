import type { CanonicalDailyAggregate } from '@fiteatsy/health-intelligence';
import { calculateTrackerBodyBiomarkerHealth, calculateTrackerEnergyBalance, calculateTrackerHealthIntelligence, calculateTrackerStressRecovery } from '../src/services/trackerOverviewScores';

const aggregate = (metricType: string, value: number): CanonicalDailyAggregate => ({
  healthDay: '2026-11-19', metricType, value, unit: 'unit', method: 'LATEST', latest: value,
  average: value, minimum: value, maximum: value, sourceObservationIds: ['observation'],
  sourceProvider: 'apple_health', sourcePriority: 400, aggregateVersion: 'HEALTH_AGGREGATION_V2',
  lineageHash: 'lineage', latestMeasuredAtISO: '2026-11-19T08:00:00.000Z',
  calculatedAtISO: '2026-11-19T08:00:00.000Z', aggregateSource: 'CANONICAL_RAW_RECOMPUTATION',
  rawLineageAvailable: true
});

describe('Tracker Overview approved score projections', () => {
  it('calculates energy without double-counting workout fallback', () => {
    expect(calculateTrackerEnergyBalance([aggregate('steps', 10_000), aggregate('active_minutes', 30), aggregate('workout_minutes', 120), aggregate('sleep_minutes', 450), aggregate('hydration_ml', 2_500)])).toBe(100);
  });
  it('calculates stress recovery from eligible physiological signals', () => {
    expect(calculateTrackerStressRecovery([aggregate('hrv_sdnn_ms', 70), aggregate('resting_heart_rate', 62), aggregate('mindfulness_minutes', 15), aggregate('sleep_minutes', 450)])).toBe(100);
  });
  it('scores only the latest validated biomarker with a reference range', () => {
    const base = { fiteatsyClientId: 'client', sourceReportId: 'report', unit: 'mg/dL', confidence: 1, validationStatus: 'validated', originalParameterName: null, sourceLocation: null, createdAtISO: '2026-11-19T00:00:00Z' };
    expect(calculateTrackerBodyBiomarkerHealth([
      { ...base, id: 'old', biomarkerId: 'glucose', biomarkerName: 'Glucose', value: 200, testDate: '2026-10-01', referenceRange: '70-100' },
      { ...base, id: 'new', biomarkerId: 'glucose', biomarkerName: 'Glucose', value: 90, testDate: '2026-11-01', referenceRange: '70-100' },
      { ...base, id: 'bad', biomarkerId: 'crp', biomarkerName: 'CRP', value: 2, testDate: '2026-11-01', referenceRange: '<5', validationStatus: 'rejected' }
    ])).toBe(88);
  });
  it('weights available domains and preserves a genuinely missing result', () => {
    expect(calculateTrackerHealthIntelligence({ activity: 80, sleep: 70, nutrition: 90, calm: 60, stressRecovery: 75 })).toBe(76);
    expect(calculateTrackerHealthIntelligence({ activity: null, sleep: null, nutrition: null, calm: null, stressRecovery: null })).toBeNull();
  });
});
