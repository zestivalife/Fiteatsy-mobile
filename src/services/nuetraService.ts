import { NativeModules } from 'react-native';
import { DailyCheckIn } from '../types';

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

const API_PORT = 4001;

const getBundlerHost = () => {
  const scriptURL = NativeModules?.SourceCode?.scriptURL as string | undefined;
  if (scriptURL == null || scriptURL.length === 0) {
    return null;
  }

  try {
    const parsed = new URL(scriptURL);
    return parsed.hostname || null;
  } catch {
    return null;
  }
};

const unique = (values: string[]) => {
  const filtered = values.filter((value) => value != null && value.length > 0);
  return Array.from(new Set(filtered));
};

const getBaseUrls = () => {
  const envBase = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const bundlerHost = getBundlerHost();
  const candidates: string[] = [];

  if (envBase) {
    candidates.push(envBase);
  }
  if (bundlerHost) {
    candidates.push('http://' + bundlerHost + ':' + String(API_PORT));
  }
  candidates.push('http://localhost:' + String(API_PORT));
  candidates.push('http://127.0.0.1:' + String(API_PORT));

  return unique(candidates);
};

const withTimeoutFetch = async (url: string, body: unknown, timeoutMs = 5000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
};

const postJson = async <T>(path: string, body: unknown): Promise<T> => {
  const baseUrls = getBaseUrls();
  let lastError = 'unknown_error';

  for (const baseUrl of baseUrls) {
    try {
      const response = await withTimeoutFetch(baseUrl + path, body);

      if (response.ok === false) {
        lastError = 'http_' + String(response.status);
        continue;
      }

      return (await response.json()) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'network_error';
      lastError = message;
    }
  }

  throw new Error(
    'nuetra_service_unreachable:' +
      lastError +
      '. Start backend on port ' +
      String(API_PORT) +
      ' (cd backend && npm run dev) or set EXPO_PUBLIC_API_BASE_URL.'
  );
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
