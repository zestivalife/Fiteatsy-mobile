import { apiFetch } from './apiClient';

export type HealthScoreStatus = 'available'|'calculating'|'calibrating'|'no_data'|'calculated'|'insufficient_data'|'methodology_pending'|'not_applicable'|'stale'|'offline'|'error';
export type HealthScoreType =
  | 'energy_balance'
  | 'body_support'
  | 'nourishment'
  | 'recovery'
  | 'physical_wellness_index'
  | 'active_performance'
  | 'stress_resilience'
  | 'nutrition'
  | 'clinical'
  | 'activity'
  | 'sleep'
  | 'calm'
  | 'overall'|'stress_recovery'|'cycle'|'health_intelligence';

export type HealthScore = {
  id: string;
  fiteatsyClientId: string;
  scoreType: HealthScoreType;
  scoreValue: number | null;
  scoreStatus: HealthScoreStatus;
  confidence: number;
  inputSummary: Record<string, unknown>;
  calculatedAtISO: string;
  calculationVersion: string;
  healthDay?: string | null;
};

export type HealthScoreSummary = {
  energyBalanceScore: number | null;
  bodySupportScore: number | null;
  nourishmentScore: number | null;
  recoveryScore: number | null;
  physicalWellnessIndex: number | null;
  activePerformanceScore: number | null;
  stressResilienceScore: number | null;
  nutritionScore: number | null;
  clinicalScore: number | null;
  activityScore: number | null;
  sleepScore: number | null;
  calmScore: number | null;
  overallScore: number | null;
  healthIntelligenceScore: number | null;
  stressRecoveryFrameworkScore: number | null;
  cycleScore: number | null;
  confidence: number;
  status: HealthScoreStatus;
  calculatedAtISO: string | null;
};

export type PssQuestion = {
  id: string;
  text: string;
  reverseScored: boolean;
};

export type PssAssessmentResult = {
  scale: 'PSS-10';
  totalScore: number;
  answeredQuestions: number;
  stressPercent: number;
  resilienceScore: number;
  stressBand: 'low' | 'moderate' | 'high';
  reverseScoredQuestionIds: string[];
  calculatedAtISO: string;
  persisted?: boolean;
  intelligence?: {
    recalculated: boolean;
    scores: Array<{
      scoreType: HealthScoreType;
      scoreValue: number | null;
      scoreStatus: HealthScoreStatus;
      confidence: number;
      calculatedAtISO: string;
    }>;
  };
};

export const getHealthScores = () =>
  apiFetch<{ total: number; items: HealthScore[] }>('/v1/intelligence/scores');

export const getHealthScoreHistory = (scoreType?: HealthScoreType) =>
  apiFetch<{ total: number; limit: number; offset: number; items: HealthScore[] }>(
    `/v1/intelligence/scores/history${scoreType ? `?scoreType=${encodeURIComponent(scoreType)}` : ''}`
  );

export const getHealthScoreSummary = () => apiFetch<HealthScoreSummary>('/v1/intelligence/summary');

export type FrameworkScore={key:string;score:number|null;status:'CALCULATED'|'PARTIAL'|'INSUFFICIENT_DATA'|'METHODOLOGY_PENDING'|'NOT_APPLICABLE'|'STALE';confidence:'HIGH'|'MODERATE'|'LOW';trend:number|null;inputsUsed:string[];inputsMissing:string[];inputsNotApplicable:string[];methodologyPending:string[];contributingFactors:string[];recommendedActions:string[];explanation:string;freshness:'CURRENT'|'STALE'|'UNKNOWN';calculationVersion:'HEALTH_INTELLIGENCE_V1';calculatedAt:string};
export type HealthIntelligenceV1={calculationVersion:'HEALTH_INTELLIGENCE_V1';engineeringStatus:'IMPLEMENTED';clinicalValidationStatus:'PENDING';latestSourceReadAt:string|null;latestCalculationAt:string;baselines:Record<string,{today:number|null;sevenDayAverage:number|null;twentyEightDayBaseline:number|null;trend:number|null;deviation:number|null}>;scores:{activity:FrameworkScore;sleep:FrameworkScore;nutrition:FrameworkScore;calm:FrameworkScore;stressRecovery:FrameworkScore;cycle:FrameworkScore;recovery:FrameworkScore;mind:FrameworkScore;healthIntelligence:FrameworkScore};performanceReport:{sections:string[];keyTrends:string[];recommendedActions:string[];confidence:string};sourceSemantics:{hrv:string}};
export const getHealthIntelligenceV1=()=>{
  const healthDay=new Date(Date.now()-new Date().getTimezoneOffset()*60_000).toISOString().slice(0,10);
  return apiFetch<HealthIntelligenceV1>(`/v1/intelligence/v1?healthDay=${healthDay}`);
};

export type CandidateValidationScore={domain:string;score:number|null;status:FrameworkScore['status'];methodologyId:string;methodologyVersion:string;healthDay:string;calculatedAt:string;confidence:FrameworkScore['confidence'];inputFreshness:string;inputsUsed:string[];inputsMissing:string[];contributingFactors:string[];explanation:string;activation:'CANDIDATE_ONLY';clinicalValidation:'PENDING'};
export type CandidateStarOrbValidation={activation:'ISOLATED_VALIDATION_ONLY';methodologyVersion:string|null;days:Array<{healthDay:string;activity:CandidateValidationScore;sleep:CandidateValidationScore;nourishment:CandidateValidationScore;calm:CandidateValidationScore;mind:CandidateValidationScore;recovery:CandidateValidationScore}>;sourceCoverage:Record<string,{source:string;status:'INTEGRATED'|'UNAVAILABLE';reason?:string}>};
export const candidateValidationClientEnabled=()=>__DEV__&&process.env.EXPO_PUBLIC_STAR_ORB_CANDIDATE_VALIDATION_ENABLED==='true';
export const getCandidateStarOrbValidation=()=>{
  const healthDay=new Date(Date.now()-new Date().getTimezoneOffset()*60_000).toISOString().slice(0,10);
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
  return apiFetch<CandidateStarOrbValidation>(`/v1/intelligence/candidate-validation?healthDay=${healthDay}&timezone=${encodeURIComponent(timezone)}`);
};

export const getPssQuestions = (count = 4) =>
  apiFetch<{ scale: 'PSS-10'; items: PssQuestion[] }>(`/v1/intelligence/stress/questions?count=${encodeURIComponent(String(count))}`);

export const submitPssAssessment = (answers: Array<{ questionId: string; score: number }>) =>
  apiFetch<PssAssessmentResult>('/v1/intelligence/stress/assessments', {
    method: 'POST',
    body: JSON.stringify({ answers })
  });
