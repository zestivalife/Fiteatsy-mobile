import { listBiomarkerHistory } from '../biomarkers/biomarkers.repository.js';
import { listHealthObservations } from '../health/health-observations.repository.js';
import { getHealthProfileByClientId } from '../platform/platform.store.js';
import { ClientOwnershipContext } from '../platform/platform.types.js';
import { HealthScoreInput, clearHealthScoresForOwner, createHealthScores } from './health-scores.repository.js';

const CALCULATION_VERSION = 'FIT-WELLNESS-200.v1';

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const average = (values: number[]) => Math.round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length));
const confidenceAverage = (values: number[]) =>
  Number((values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(4));

const scoreFromReferenceRange = (value: number, referenceRange: string | null) => {
  if (!referenceRange) return 70;
  const cleaned = referenceRange.replace(/\s/g, '');
  const between = cleaned.match(/(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)/);
  if (between) {
    const min = Number(between[1]);
    const max = Number(between[2]);
    if (value >= min && value <= max) return 88;
    const range = Math.max(1, max - min);
    const distance = value < min ? min - value : value - max;
    return Math.round(clamp(88 - (distance / range) * 45, 35, 88));
  }
  const below = cleaned.match(/^<(-?\d+(?:\.\d+)?)/);
  if (below) return value < Number(below[1]) ? 88 : 55;
  const above = cleaned.match(/^>(-?\d+(?:\.\d+)?)/);
  if (above) return value > Number(above[1]) ? 88 : 55;
  return 70;
};

const scoreObservation = (metricType: string, value: number) => {
  switch (metricType) {
    case 'steps':
      return clamp(Math.round((value / 10000) * 100));
    case 'active_minutes':
    case 'workout_minutes':
      return clamp(Math.round((value / 45) * 100));
    case 'sleep_minutes':
      return clamp(Math.round(100 - Math.abs(value - 450) / 3));
    case 'hrv_ms':
      return clamp(Math.round((value / 70) * 100));
    case 'resting_heart_rate':
      return clamp(Math.round(100 - Math.abs(value - 62) * 2));
    case 'stress_score':
      return clamp(Math.round(100 - value));
    case 'hydration_ml':
      return clamp(Math.round((value / 2500) * 100));
    case 'mindfulness_minutes':
      return clamp(Math.round((value / 15) * 100));
    default:
      return 60;
  }
};

const insufficient = (scoreType: HealthScoreInput['scoreType'], reason: string): HealthScoreInput => ({
  scoreType,
  scoreValue: null,
  scoreStatus: 'insufficient_data',
  confidence: 0,
  inputSummary: { reason },
  calculationVersion: CALCULATION_VERSION
});

export const calculateHealthScores = async (owner: ClientOwnershipContext) => {
  const [biomarkers, observations, profile] = await Promise.all([
    listBiomarkerHistory(owner, { limit: 200, offset: 0 }),
    listHealthObservations(owner, { limit: 200, offset: 0 }),
    getHealthProfileByClientId(owner.clientId)
  ]);

  const validatedBiomarkers = biomarkers.filter((item) => item.validationStatus === 'validated');
  const recentObservations = observations.filter((item) => item.qualityStatus === 'accepted' || item.qualityStatus === 'estimated');

  const nutritionBiomarkers = validatedBiomarkers.filter((item) =>
    /vitamin|b12|folate|ferritin|iron|albumin|protein|calcium|magnesium/i.test(`${item.biomarkerName} ${item.unit}`)
  );
  const metabolicBiomarkers = validatedBiomarkers.filter((item) =>
    /glucose|hba1c|insulin|cholesterol|triglyceride|hdl|ldl|creatinine|uric/i.test(`${item.biomarkerName} ${item.unit}`)
  );
  const inflammationBiomarkers = validatedBiomarkers.filter((item) =>
    /crp|esr|hemoglobin|ferritin|vitamin d|b12/i.test(`${item.biomarkerName} ${item.unit}`)
  );

  const sleepObservations = recentObservations.filter((item) => item.metricType === 'sleep_minutes');
  const activityObservations = recentObservations.filter((item) => ['steps', 'active_minutes', 'workout_minutes'].includes(item.metricType));
  const recoveryObservations = recentObservations.filter((item) => ['sleep_minutes', 'hrv_ms', 'resting_heart_rate', 'active_minutes', 'workout_minutes', 'mindfulness_minutes'].includes(item.metricType));
  const hydrationObservations = recentObservations.filter((item) => item.metricType === 'hydration_ml');
  const stressObservations = recentObservations.filter((item) => ['stress_score', 'hrv_ms', 'resting_heart_rate', 'mindfulness_minutes', 'sleep_minutes'].includes(item.metricType));

  const nourishmentInputs = [
    ...nutritionBiomarkers.map((item) => scoreFromReferenceRange(item.value, item.referenceRange)),
    ...hydrationObservations.map((item) => scoreObservation(item.metricType, item.value))
  ];
  const energyBalanceInputs = [
    ...sleepObservations.map((item) => scoreObservation(item.metricType, item.value)),
    ...activityObservations.map((item) => scoreObservation(item.metricType, item.value)),
    ...hydrationObservations.map((item) => scoreObservation(item.metricType, item.value))
  ];
  const bodySupportInputs = [
    ...metabolicBiomarkers.map((item) => scoreFromReferenceRange(item.value, item.referenceRange)),
    ...inflammationBiomarkers.map((item) => scoreFromReferenceRange(item.value, item.referenceRange))
  ];
  const activePerformanceInputs = activityObservations.map((item) => scoreObservation(item.metricType, item.value));
  const recoveryInputs = recoveryObservations.map((item) => scoreObservation(item.metricType, item.value));
  const stressResilienceInputs = stressObservations.map((item) => scoreObservation(item.metricType, item.value));

  const scores: HealthScoreInput[] = [];
  const pushCalculated = (
    scoreType: HealthScoreInput['scoreType'],
    values: number[],
    confidence: number,
    inputSummary: Record<string, unknown>,
    reason: string
  ) => {
    scores.push(
      values.length
        ? {
            scoreType,
            scoreValue: average(values),
            scoreStatus: 'calculated',
            confidence,
            inputSummary,
            calculationVersion: CALCULATION_VERSION
          }
        : insufficient(scoreType, reason)
    );
  };

  pushCalculated(
    'nourishment',
    nourishmentInputs,
    confidenceAverage([
      ...nutritionBiomarkers.map((item) => item.confidence),
      ...hydrationObservations.map(() => 0.72)
    ]),
    {
      biomarkerObservationIds: nutritionBiomarkers.map((item) => item.id),
      healthObservationIds: hydrationObservations.map((item) => item.id),
      profileAvailable: Boolean(profile)
    },
    'No validated nourishment biomarkers or hydration observations are available.'
  );
  pushCalculated(
    'energy_balance',
    energyBalanceInputs,
    confidenceAverage([
      ...sleepObservations.map(() => 0.78),
      ...activityObservations.map(() => 0.74),
      ...hydrationObservations.map(() => 0.72)
    ]),
    { healthObservationIds: [...sleepObservations, ...activityObservations, ...hydrationObservations].map((item) => item.id) },
    'No sleep, movement, or hydration observations are available.'
  );
  pushCalculated(
    'body_support',
    bodySupportInputs,
    confidenceAverage([...metabolicBiomarkers, ...inflammationBiomarkers].map((item) => item.confidence)),
    { biomarkerObservationIds: [...metabolicBiomarkers, ...inflammationBiomarkers].map((item) => item.id) },
    'No validated metabolic or body-support biomarkers are available.'
  );
  pushCalculated(
    'active_performance',
    activePerformanceInputs,
    0.74,
    { healthObservationIds: activityObservations.map((item) => item.id) },
    'No activity observations are available.'
  );
  pushCalculated(
    'recovery',
    recoveryInputs,
    0.74,
    {
      healthObservationIds: recoveryObservations.map((item) => item.id),
      calculationRule: 'Recovery combines sleep, HRV, resting heart rate, movement load, and mindfulness recovery signals.'
    },
    'No recovery observations are available.'
  );
  pushCalculated(
    'stress_resilience',
    stressResilienceInputs,
    0.72,
    {
      healthObservationIds: stressObservations.map((item) => item.id),
      calculationRule: 'Stress resilience reflects stress score, HRV, resting heart rate, sleep, and mindfulness recovery behaviour.'
    },
    'No stress resilience observations are available.'
  );

  const masterCalculated = scores.filter((score) =>
    ['energy_balance', 'body_support', 'nourishment', 'recovery', 'active_performance', 'stress_resilience'].includes(score.scoreType) &&
    score.scoreStatus === 'calculated' &&
    score.scoreValue != null
  );

  scores.push(
    masterCalculated.length
      ? {
          scoreType: 'physical_wellness_index',
          scoreValue: average(masterCalculated.map((score) => score.scoreValue ?? 0)),
          scoreStatus: 'calculated',
          confidence: confidenceAverage(masterCalculated.map((score) => score.confidence)),
          inputSummary: { scoreTypes: masterCalculated.map((score) => score.scoreType) },
          calculationVersion: CALCULATION_VERSION
        }
      : insufficient('physical_wellness_index', 'No calculated master wellness dimension scores are available.')
  );

  const byType = new Map(scores.map((score) => [score.scoreType, score]));
  const aliasTargets = [
    ['nutrition', byType.get('nourishment'), 'Nourishment score is not available.'],
    ['clinical', byType.get('body_support'), 'Body support score is not available.'],
    ['activity', byType.get('active_performance'), 'Active performance score is not available.'],
    ['sleep', byType.get('energy_balance'), 'Energy balance score is not available.'],
    ['calm', byType.get('stress_resilience'), 'Stress resilience score is not available.'],
    ['overall', byType.get('physical_wellness_index'), 'Physical wellness index is not available.']
  ] as const;

  for (const [scoreType, source, reason] of aliasTargets) {
    scores.push(
      source?.scoreStatus === 'calculated' && source.scoreValue != null
        ? {
            scoreType,
            scoreValue: source.scoreValue,
            scoreStatus: 'calculated',
            confidence: source.confidence,
            inputSummary: { aliasedFrom: source.scoreType },
            calculationVersion: CALCULATION_VERSION
          }
        : insufficient(scoreType, reason)
    );
  }

  await clearHealthScoresForOwner(owner);
  return createHealthScores(owner, scores);
};
