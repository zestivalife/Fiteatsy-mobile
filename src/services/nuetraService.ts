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

export const generateNuetraSummary = async (parameters: ReportParameter[], userName?: string) => {
  const data = await postJson<{ summary: string }>('/v1/intelligence/reports/summary', {
    parameters,
    userName
  });

  return data.summary;
};

export const generateParameterInsight = async (parameter: ReportParameter) => {
  const data = await postJson<{ insight: string }>('/v1/intelligence/reports/parameter-insight', {
    paramName: parameter.name,
    value: parameter.value,
    unit: parameter.unit,
    status: parameter.status,
    referenceRange: parameter.referenceRange
  });

  return data.insight;
};

export const generateActionPlan = async (abnormalParameters: ReportParameter[]) => {
  const data = await postJson<{ actions: NuetraActionItem[] }>('/v1/intelligence/reports/action-plan', {
    abnormalParameters
  });

  return data.actions;
};

export const generateCrossReferenceInsights = async (
  abnormalParams: ReportParameter[],
  checkInHistory: DailyCheckIn[]
) => {
  const data = await postJson<{ insights: NuetraCrossInsight[] }>('/v1/intelligence/reports/cross-insights', {
    abnormalParams,
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
  reportParameters: ReportParameter[]
) => {
  const data = await postJson<{ response: string }>('/v1/intelligence/reports/chat', {
    userMessage,
    conversationHistory,
    reportParameters
  });

  return data.response;
};
