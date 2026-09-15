import { listHealthObservationsForCalculation } from '../health/health-observations.repository.js';
import type { ClientOwnershipContext } from '../platform/platform.types.js';
import { createHealthScores, type HealthScoreInput } from './health-scores.repository.js';
import { replaceDailyAggregates } from './health-aggregates.repository.js';
import { buildHealthIntelligenceV1 } from './health-intelligence-projection.js';

export const CALCULATION_VERSION = 'HEALTH_INTELLIGENCE_V1';

const persistedStatus = (status: string): HealthScoreInput['scoreStatus'] =>
  status.toLowerCase() as HealthScoreInput['scoreStatus'];

/** Canonical, append-only score calculation. No legacy score formula executes. */
export const calculateCanonicalHealthScores = async (
  owner: ClientOwnershipContext,
  healthDay = new Date().toISOString().slice(0, 10)
) => {
  const observations = await listHealthObservationsForCalculation(owner);
  const eligible = observations.filter(
    (item) => item.qualityStatus === 'accepted' || item.qualityStatus === 'estimated'
  );
  const projection = buildHealthIntelligenceV1(eligible, healthDay);
  await replaceDailyAggregates(owner, projection.aggregates);

  const scores: HealthScoreInput[] = Object.entries({
    recovery: projection.scores.recovery,
    activity: projection.scores.activity,
    sleep: projection.scores.sleep,
    calm: projection.scores.calm,
    nutrition: projection.scores.nutrition,
    stress_recovery: projection.scores.stressRecovery,
    cycle: projection.scores.cycle,
    overall: projection.scores.healthIntelligence,
    health_intelligence: projection.scores.healthIntelligence
  }).map(([scoreType, value]) => ({
    scoreType: scoreType as HealthScoreInput['scoreType'],
    scoreValue: value.score,
    scoreStatus: persistedStatus(value.status),
    confidence: value.confidence === 'HIGH' ? 1 : value.confidence === 'MODERATE' ? 0.67 : 0,
    inputSummary: {
      ...value,
      scoreKey: value.key,
      methodologyVersion: value.calculationVersion,
      aggregateVersion: 'HEALTH_AGGREGATION_V2',
      inputWindow: { healthDay },
      healthDay
    },
    calculationVersion: CALCULATION_VERSION
  }));

  return createHealthScores(owner, scores);
};
