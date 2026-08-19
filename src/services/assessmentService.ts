import { apiFetch } from './apiClient';

const authInit = (sessionToken?: string): RequestInit | undefined =>
  sessionToken ? { headers: { Authorization: `Bearer ${sessionToken}` } } : undefined;

export type AssessmentType = 'PSS10';
export type AssessmentStatus = 'DRAFT' | 'COMPLETED' | 'ABANDONED';

export type AssessmentItem = {
  id: string;
  label: string;
  reverseScored: boolean;
};

export type AssessmentResponseOption = {
  value: 0 | 1 | 2 | 3 | 4;
  label: string;
};

export type AssessmentDefinition = {
  id: string;
  assessmentType: AssessmentType;
  instrumentVersion: string;
  scoringVersion: string;
  title: string;
  subtitle: string;
  recallPeriod: string;
  itemCount: number;
  maxScore: number;
  licensedItemWordingPresent: boolean;
  items: AssessmentItem[];
  responseOptions: AssessmentResponseOption[];
  active: boolean;
};

export type AssessmentResponse = {
  itemId: string;
  selectedValue: 0 | 1 | 2 | 3 | 4;
};

export type AssessmentSession = {
  id: string;
  assessmentType: AssessmentType;
  instrumentVersion: string;
  scoringVersion: string;
  status: AssessmentStatus;
  startedAtISO: string;
  completedAtISO: string | null;
  responses: AssessmentResponse[];
};

export type AssessmentResult = {
  id: string;
  sessionId: string;
  assessmentType: AssessmentType;
  instrumentVersion: string;
  scoringVersion: string;
  rawScore: number;
  maxScore: number;
  completedAtISO: string;
  interpretationVersion: string;
  interpretationKey: 'LOW' | 'MODERATE' | 'HIGH';
  interpretationLabel: 'Low stress' | 'Moderate stress' | 'High perceived stress';
};

export const getAssessmentDefinition = (sessionToken?: string) =>
  apiFetch<AssessmentDefinition>('/v1/assessments/PSS10/definition', authInit(sessionToken));

export const getDraftAssessmentSession = (sessionToken?: string) =>
  apiFetch<{ session: AssessmentSession | null }>('/v1/assessments/PSS10/draft', authInit(sessionToken));

export const startAssessmentSession = (sessionToken?: string) =>
  apiFetch<{ session: AssessmentSession }>('/v1/assessments/PSS10/sessions', {
    method: 'POST',
    ...authInit(sessionToken),
    body: JSON.stringify({})
  });

export const getAssessmentSession = (sessionId: string, sessionToken?: string) =>
  apiFetch<{ session: AssessmentSession }>(`/v1/assessments/sessions/${encodeURIComponent(sessionId)}`, authInit(sessionToken));

export const saveAssessmentResponses = (sessionId: string, responses: AssessmentResponse[], sessionToken?: string) =>
  apiFetch<{ session: AssessmentSession }>(`/v1/assessments/sessions/${encodeURIComponent(sessionId)}/responses`, {
    method: 'PUT',
    ...authInit(sessionToken),
    body: JSON.stringify({ responses })
  });

export const completeAssessmentSession = (sessionId: string, sessionToken?: string) =>
  apiFetch<{ result: AssessmentResult; previousResult: AssessmentResult | null }>(
    `/v1/assessments/sessions/${encodeURIComponent(sessionId)}/complete`,
    {
      method: 'POST',
      ...authInit(sessionToken),
      body: JSON.stringify({})
    }
  );

export const getLatestAssessmentResult = (sessionToken?: string) =>
  apiFetch<{ result: AssessmentResult | null; previousResult: AssessmentResult | null }>('/v1/assessments/PSS10/results/latest', authInit(sessionToken));

export const getAssessmentHistory = (sessionToken?: string) =>
  apiFetch<{ total: number; items: AssessmentResult[] }>('/v1/assessments/PSS10/results', authInit(sessionToken));
