import { NativeModules } from 'react-native';
import { ReportParameter } from './nuetraService';

type CategoryScores = Record<'Blood' | 'Metabolic' | 'Organs' | 'Thyroid' | 'Vitamins', number>;

export type ReportAnalysisResponse = {
  reportDate: string;
  labName: string;
  parameters: ReportParameter[];
  score: number;
  categoryScores: CategoryScores;
  summary: string;
  actionPlan: Array<{ priority: number; title: string; detail: string }>;
};

const API_PORT = 4001;
const REQUEST_TIMEOUT_MS = 25000;

const getBundlerHost = () => {
  const scriptURL = NativeModules?.SourceCode?.scriptURL as string | undefined;
  if (!scriptURL) return null;
  try {
    const parsed = new URL(scriptURL);
    return parsed.hostname || null;
  } catch {
    return null;
  }
};

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const getBaseUrls = () => {
  const envBase = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const host = getBundlerHost();
  return unique([
    envBase ?? '',
    host ? `http://${host}:${String(API_PORT)}` : '',
    `http://localhost:${String(API_PORT)}`,
    `http://127.0.0.1:${String(API_PORT)}`
  ]);
};

export const uploadAndAnalyzeReport = async (params: {
  fileUri: string;
  fileName: string;
  mimeType: string;
  reportDate?: string;
  labName?: string;
}): Promise<ReportAnalysisResponse> => {
  const form = new FormData();
  form.append('reportFile', {
    uri: params.fileUri,
    name: params.fileName,
    type: params.mimeType
  } as any);
  if (params.reportDate) form.append('reportDate', params.reportDate);
  if (params.labName) form.append('labName', params.labName);

  let lastError = 'network_error';
  for (const baseUrl of getBaseUrls()) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${baseUrl}/v1/reports/analyze`, {
        method: 'POST',
        body: form,
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
        lastError = payload.message ?? payload.error ?? `HTTP_${response.status}`;
        continue;
      }
      return (await response.json()) as ReportAnalysisResponse;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error instanceof Error ? error.message : 'network_error';
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = 'REQUEST_TIMEOUT';
      }
    }
  }

  if (lastError.includes('UPLOAD_SESSION_NOT_FOUND')) {
    throw new Error('Upload session expired. Please pick the file again and retry.');
  }
  if (lastError.includes('REQUEST_TIMEOUT')) {
    throw new Error('Analysis timed out. Check internet/backend and retry with a smaller or clearer report.');
  }
  if (lastError.includes('Failed to fetch') || lastError.includes('Network request failed') || lastError === 'network_error') {
    throw new Error('Could not reach analysis server. Check backend is running and phone/simulator can access it.');
  }
  throw new Error(`Analysis failed: ${lastError}`);
};
