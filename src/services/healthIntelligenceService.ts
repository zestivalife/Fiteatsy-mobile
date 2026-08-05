import { apiFetch } from './apiClient';

export type HealthScoreStatus = 'calculated' | 'insufficient_data';
export type HealthScoreType = 'nutrition' | 'clinical' | 'activity' | 'sleep' | 'calm' | 'recovery' | 'overall';

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
  recoveryScore: number | null;
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

export const getHealthScores = () =>
  apiFetch<{ total: number; items: HealthScore[] }>('/v1/intelligence/scores');

export const getHealthScoreHistory = (scoreType?: HealthScoreType) =>
  apiFetch<{ total: number; limit: number; offset: number; items: HealthScore[] }>(
    `/v1/intelligence/scores/history${scoreType ? `?scoreType=${encodeURIComponent(scoreType)}` : ''}`
  );

export const getHealthScoreSummary = () => apiFetch<HealthScoreSummary>('/v1/intelligence/summary');
