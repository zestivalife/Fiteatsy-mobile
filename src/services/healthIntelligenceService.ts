import { apiFetch } from './apiClient';

export type HealthScoreStatus = 'calculated' | 'insufficient_data';
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
  | 'overall';

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

export const getPssQuestions = (count = 4) =>
  apiFetch<{ scale: 'PSS-10'; items: PssQuestion[] }>(`/v1/intelligence/stress/questions?count=${encodeURIComponent(String(count))}`);

export const submitPssAssessment = (answers: Array<{ questionId: string; score: number }>) =>
  apiFetch<PssAssessmentResult>('/v1/intelligence/stress/assessments', {
    method: 'POST',
    body: JSON.stringify({ answers })
  });
