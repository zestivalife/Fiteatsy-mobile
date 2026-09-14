import {
  HEALTH_INTELLIGENCE_CONFIG,
  activityScore,
  calmScore,
  cycleScore,
  mindScore,
  nutritionScore,
  overallScore,
  recoveryScore,
  sleepScore,
  stressRecoveryScore,
  type ScoreResult
  ,aggregateCanonicalHealthObservations,type CanonicalDailyAggregate
} from '@fiteatsy/health-intelligence';
import type { HealthObservationDraft } from '../types';

export type CanonicalHealthInputs = {
  activity: Parameters<typeof activityScore>[0];
  sleep: Parameters<typeof sleepScore>[0];
  nutrition: Parameters<typeof nutritionScore>[0];
  calm: Parameters<typeof calmScore>[0];
  stressRecovery: Parameters<typeof stressRecoveryScore>[0];
  recovery: Parameters<typeof recoveryScore>[0];
  cycle: Parameters<typeof cycleScore>[0];
};

export type LocalCanonicalHealthSnapshot = {
  calculationVersion: 'HEALTH_INTELLIGENCE_V1';
  calculatedAt: string;
  inputWindow: { startAtISO: string | null; endAtISO: string | null };
  inputFreshness: ScoreResult['freshness'];
  source: 'LOCAL_CANONICAL_INPUTS' | 'CACHED_CANONICAL_SERVER';
  scores: {
    activity: ScoreResult;
    sleep: ScoreResult;
    nutrition: ScoreResult;
    calm: ScoreResult;
    stressRecovery: ScoreResult;
    recovery: ScoreResult;
    cycle: ScoreResult;
    mind: ScoreResult;
    healthIntelligence: ScoreResult;
  };
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const percentOf = (value: number | null, target: number) => value == null ? null : Math.min(100, value / target * 100);

export const calculateCanonicalHealthIntelligence = (
  inputs: CanonicalHealthInputs,
  calculatedAt = new Date().toISOString(),
  inputWindow: LocalCanonicalHealthSnapshot['inputWindow'] = { startAtISO: null, endAtISO: null }
): LocalCanonicalHealthSnapshot => {
  const activity = activityScore(inputs.activity);
  const sleep = sleepScore(inputs.sleep);
  const nutrition = nutritionScore(inputs.nutrition);
  const calm = calmScore(inputs.calm);
  const stressRecovery = stressRecoveryScore(inputs.stressRecovery);
  const recovery = recoveryScore(inputs.recovery);
  const cycle = cycleScore(inputs.cycle);
  const mind = mindScore();
  const rawComponentScores = { activity, sleep, nutrition, calm, stressRecovery, recovery, cycle, mind };
  const rawHealthIntelligence = overallScore(rawComponentScores);
  const componentScores = Object.fromEntries(
    Object.entries(rawComponentScores).map(([key, score]) => [key, { ...score, calculatedAt }])
  ) as typeof rawComponentScores;
  const healthIntelligence = { ...rawHealthIntelligence, calculatedAt };
  const freshnessValues = Object.values(componentScores).map((score) => score.freshness);
  const inputFreshness: ScoreResult['freshness'] = freshnessValues.includes('STALE') ? 'STALE'
    : freshnessValues.includes('CURRENT') ? 'CURRENT' : 'UNKNOWN';
  return {
    calculationVersion: 'HEALTH_INTELLIGENCE_V1', calculatedAt, inputWindow, inputFreshness,
    source: 'LOCAL_CANONICAL_INPUTS', scores: { ...componentScores, healthIntelligence }
  };
};

const localDay = (iso: string, timezoneOffsetMinutes = -new Date().getTimezoneOffset()) =>
  new Date(Date.parse(iso) + timezoneOffsetMinutes * 60_000).toISOString().slice(0, 10);

export const calculateCanonicalHealthIntelligenceFromObservations = (
  observations: HealthObservationDraft[],
  options: { sleepTargetMinutes?: number | null; cycleApplicable?: boolean; now?: Date } = {}
) => {
  const now = options.now ?? new Date();
  const fallbackOffsetMinutes=-now.getTimezoneOffset();const today = localDay(now.toISOString(),fallbackOffsetMinutes);
  const timestamps = observations.filter((item) => !item.deleted).map((item) => item.measuredAtISO).sort();
  const freshness: ScoreResult['freshness'] = timestamps.length && Date.parse(timestamps[timestamps.length - 1]) >= now.getTime() - 36 * 3_600_000
    ? 'CURRENT' : timestamps.length ? 'STALE' : 'UNKNOWN';
  const aggregates=aggregateCanonicalHealthObservations(observations,{fallbackOffsetMinutes,nowMs:now.getTime()});
  const dailyValue=(metricType:string)=>aggregates.find(row=>row.healthDay===today&&row.metricType===metricType)?.value??null;
  const steps = dailyValue('steps');
  const exercise = dailyValue('active_minutes');
  const sleepMinutes = dailyValue('sleep_minutes');
  const hydration = dailyValue('hydration_ml');
  const mindfulness = dailyValue('mindfulness_minutes');
  return calculateCanonicalHealthIntelligence({
    activity: { steps, stepGoal: HEALTH_INTELLIGENCE_CONFIG.targets.steps, exerciseMinutes: exercise,
      exerciseTarget: HEALTH_INTELLIGENCE_CONFIG.targets.exerciseMinutes, balance: null, freshness },
    sleep: { minutes: sleepMinutes, targetMinutes: options.sleepTargetMinutes ?? HEALTH_INTELLIGENCE_CONFIG.targets.sleepMinutes,
      deep: null, rem: null, efficiency: null, consistency: null, freshness },
    nutrition: { protein: null, hydration: percentOf(hydration, 2_500), foodQuality: null, clinical: null, freshness },
    calm: { hrv: null, stress: null, mindfulness: percentOf(mindfulness, 15), freshness },
    stressRecovery: { hrv: null, sleep: null, adaptation: null, freshness },
    recovery: { sleep: null, body: null, activityBalance: null, lifestyle: null, freshness },
    cycle: { applicable: options.cycleApplicable === true, phase: null, symptoms: null, energy: null }
  }, now.toISOString(), { startAtISO: timestamps[0] ?? null, endAtISO: timestamps[timestamps.length - 1] ?? null });
};

export const calculateCanonicalHealthIntelligenceFromAggregates=(aggregates:CanonicalDailyAggregate[],options:{sleepTargetMinutes?:number|null;
  cycleApplicable?:boolean;now?:Date}={})=>{const now=options.now??new Date();const fallbackOffsetMinutes=-now.getTimezoneOffset();
  const today=localDay(now.toISOString(),fallbackOffsetMinutes);const daily=(metric:string)=>aggregates.find(row=>row.healthDay===today&&row.metricType===metric)?.value??null;
  const timestamps=aggregates.map(row=>row.latestMeasuredAtISO).sort();const latest=timestamps.at(-1)??null;
  const freshness:ScoreResult['freshness']=latest&&Date.parse(latest)>=now.getTime()-36*3_600_000?'CURRENT':latest?'STALE':'UNKNOWN';
  return calculateCanonicalHealthIntelligence({activity:{steps:daily('steps'),stepGoal:HEALTH_INTELLIGENCE_CONFIG.targets.steps,
    exerciseMinutes:daily('active_minutes'),exerciseTarget:HEALTH_INTELLIGENCE_CONFIG.targets.exerciseMinutes,balance:null,freshness},
    sleep:{minutes:daily('sleep_minutes'),targetMinutes:options.sleepTargetMinutes??HEALTH_INTELLIGENCE_CONFIG.targets.sleepMinutes,
      deep:null,rem:null,efficiency:null,consistency:null,freshness},
    nutrition:{protein:null,hydration:percentOf(daily('hydration_ml'),2500),foodQuality:null,clinical:null,freshness},
    calm:{hrv:null,stress:null,mindfulness:percentOf(daily('mindfulness_minutes'),15),freshness},
    stressRecovery:{hrv:null,sleep:null,adaptation:null,freshness},recovery:{sleep:null,body:null,activityBalance:null,lifestyle:null,freshness},
    cycle:{applicable:options.cycleApplicable===true,phase:null,symptoms:null,energy:null}},now.toISOString(),
    {startAtISO:timestamps[0]??null,endAtISO:latest});
};

export const hasCalculatedCanonicalScore = (snapshot: LocalCanonicalHealthSnapshot) =>
  Object.values(snapshot.scores).some((score) => finite(score.score));

export const markCanonicalSnapshotStale = (snapshot: LocalCanonicalHealthSnapshot): LocalCanonicalHealthSnapshot => ({
  ...snapshot,
  inputFreshness: 'STALE',
  scores: Object.fromEntries(Object.entries(snapshot.scores).map(([key, score]) => [key, {
    ...score,
    freshness: 'STALE',
    status: score.score == null ? score.status : 'STALE'
  }])) as LocalCanonicalHealthSnapshot['scores']
});
