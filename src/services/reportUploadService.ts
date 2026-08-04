import { NativeModules } from 'react-native';
import { ReportParameter } from './nuetraService';
import { buildAuthorizationHeaders } from './apiClient';

type CategoryScores = Record<'Blood' | 'Metabolic' | 'Organs' | 'Thyroid' | 'Vitamins', number>;

export type ReportAnalysisResponse = {
  reportId?: string;
  status?: string;
  reportDate: string;
  labName: string;
  parameters: ReportParameter[];
  score: number;
  categoryScores: CategoryScores;
  summary: string;
  actionPlan: Array<{ priority: number; title: string; detail: string }>;
  biomarkerObservations?: Array<{
    id: string;
    biomarkerId: string;
    biomarkerName: string;
    validationStatus: string;
    confidence: number;
    notes: string[];
  }>;
  healthScores?: Array<{
    scoreType: string;
    scoreValue: number | null;
    scoreStatus: string;
    confidence: number;
    calculatedAtISO: string;
  }>;
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
  signal?: AbortSignal;
  onProgress?: (event: { stage: 'uploading' | 'processing' | 'extraction' | 'validation'; percent: number; message: string }) => void;
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
    const abortFromCaller = () => controller.abort();
    params.signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    params.onProgress?.({ stage: 'uploading', percent: 12, message: 'Uploading Report' });
    try {
      const response = await fetch(`${baseUrl}/v1/reports/analyze`, {
        method: 'POST',
        headers: buildAuthorizationHeaders(),
        body: form,
        signal: controller.signal
      });
      clearTimeout(timeout);
      params.signal?.removeEventListener('abort', abortFromCaller);
      params.onProgress?.({ stage: 'processing', percent: 45, message: 'Report uploaded successfully. Processing health information...' });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
        lastError = payload.message ?? payload.error ?? `HTTP_${response.status}`;
        continue;
      }
      params.onProgress?.({ stage: 'extraction', percent: 70, message: 'Extracting health parameters...' });
      const data = (await response.json()) as ReportAnalysisResponse;
      params.onProgress?.({ stage: 'validation', percent: 92, message: 'Validating extracted health information...' });
      params.onProgress?.({ stage: 'validation', percent: 100, message: 'Report analysis completed.' });
      return data;
    } catch (error) {
      clearTimeout(timeout);
      params.signal?.removeEventListener('abort', abortFromCaller);
      lastError = error instanceof Error ? error.message : 'network_error';
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = params.signal?.aborted ? 'REQUEST_CANCELLED' : 'REQUEST_TIMEOUT';
      }
    }
  }

  if (lastError.includes('REQUEST_CANCELLED')) {
    throw new Error('Analysis cancelled. You can retry when ready.');
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
