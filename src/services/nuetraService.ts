import { DailyCheckIn } from '../types';
import { postJson as postConfiguredJson } from './apiClient';

export type ReportParameter = {
  name: string;
  value: number;
  unit: string;
  status: 'low' | 'high' | 'normal' | 'critical';
  referenceRange: string;
  category: 'Blood' | 'Metabolic' | 'Organs' | 'Thyroid' | 'Vitamins';
};

export type NuetraActionItem = {
  priority: number;
  title: string;
  detail: string;
  requiresDoctor: boolean;
};

export type NuetraCrossInsight = {
  connection: string;
  labParam: string;
  checkInPattern: string;
};

export type NuetraChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const postJson = async <T>(path: string, body: unknown): Promise<T> => {
  return postConfiguredJson<T>(path, body);
};

export const generateNuetraSummary = async (reportId: string, userName?: string) => {
  const data = await postJson<{ summary: string }>('/v1/intelligence/reports/summary', {
    reportId,
    userName
  });

  return data.summary;
};

export const generateParameterInsight = async (reportId: string, parameter: ReportParameter) => {
  const data = await postJson<{ insight: string }>('/v1/intelligence/reports/parameter-insight', {
    reportId,
    paramName: parameter.name,
  });

  return data.insight;
};

export const generateActionPlan = async (reportId: string) => {
  const data = await postJson<{ actions: NuetraActionItem[] }>('/v1/intelligence/reports/action-plan', {
    reportId
  });

  return data.actions;
};

export const generateCrossReferenceInsights = async (
  reportId: string,
  checkInHistory: DailyCheckIn[]
) => {
  const data = await postJson<{ insights: NuetraCrossInsight[] }>('/v1/intelligence/reports/cross-insights', {
    reportId,
    checkInHistory: checkInHistory.map((item) => ({
      mood: item.mood,
      energy: item.energy,
      sleep: item.sleepQuality
    }))
  });

  return data.insights;
};

export const generateNuetraChat = async (
  userMessage: string,
  conversationHistory: NuetraChatMessage[],
  reportId: string
) => {
  const data = await postJson<{ response: string }>('/v1/intelligence/reports/chat', {
    userMessage,
    conversationHistory,
    reportId
  });

  return data.response;
};
