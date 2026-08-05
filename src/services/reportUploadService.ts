import { NativeModules } from 'react-native';
import { ReportParameter } from './nuetraService';
import { buildAuthorizationHeaders } from './apiClient';

type CategoryScores = Record<'Blood' | 'Metabolic' | 'Organs' | 'Thyroid' | 'Vitamins', number>;

export type BiomarkerHistoryItem = {
  id: string;
  fiteatsyClientId: string;
  biomarkerId: string;
  biomarkerName: string;
  sourceReportId: string | null;
  value: number;
  unit: string;
  testDate: string;
  confidence: number;
  validationStatus: string;
  originalParameterName?: string | null;
  sourceLocation?: string | null;
  referenceRange?: string | null;
  createdAtISO: string;
};

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
    originalParameterName?: string | null;
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

export type ReportDto = {
  id: string;
  status: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  reportDate?: string;
  labName?: string;
  source?: 'camera' | 'gallery' | 'pdf';
  createdAtISO: string;
  updatedAtISO: string;
  error?: string;
  analysis?: ReportAnalysisResponse;
};

type UploadProgressStage = 'uploading' | 'uploaded' | 'processing' | 'extraction' | 'validation' | 'completed' | 'failed';

const API_PORT = 4001;
const REQUEST_TIMEOUT_MS = 30000;
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 120000;

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

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      const error = new Error('Aborted');
      error.name = 'AbortError';
      reject(error);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

const parseJson = async <T>(response: Response): Promise<T> => {
  const raw = await response.text();
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
};

const requestJson = async <T>(baseUrl: string, path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...buildAuthorizationHeaders(),
      ...(options?.headers ?? {})
    }
  });
  const payload = await parseJson<T & { message?: string; error?: string }>(response).catch(() => ({} as T & { message?: string; error?: string }));
  if (!response.ok) {
    throw new Error(payload.message ?? payload.error ?? `HTTP_${response.status}`);
  }
  return payload as T;
};

const statusToProgress = (status: string): { stage: UploadProgressStage; percent: number; message: string; step: string } => {
  switch (status) {
    case 'UPLOADED':
      return { stage: 'uploaded', percent: 35, message: 'Report uploaded successfully. Processing health information...', step: 'UPLOADED' };
    case 'PROCESSING':
      return { stage: 'processing', percent: 52, message: 'Processing health information...', step: 'PROCESSING' };
    case 'EXTRACTION_COMPLETED':
      return { stage: 'extraction', percent: 74, message: 'Extracting health parameters...', step: 'EXTRACTION_COMPLETED' };
    case 'VALIDATION_PENDING':
      return { stage: 'validation', percent: 88, message: 'Validating extracted health information...', step: 'VALIDATION_PENDING' };
    case 'COMPLETED':
      return { stage: 'completed', percent: 100, message: 'Report analysis completed.', step: 'COMPLETED' };
    case 'REVIEW_REQUIRED':
      return { stage: 'failed', percent: 100, message: 'Manual review is required before results can be shown.', step: 'REVIEW_REQUIRED' };
    case 'FAILED':
      return { stage: 'failed', percent: 100, message: 'Processing failed.', step: 'FAILED' };
    default:
      return { stage: 'processing', percent: 45, message: 'Processing health information...', step: status };
  }
};

export const listAnalyzedReports = async (): Promise<ReportDto[]> => {
  let lastError = 'network_error';
  for (const baseUrl of getBaseUrls()) {
    try {
      const payload = await requestJson<{ items: ReportDto[] }>(baseUrl, '/v1/reports?limit=50');
      return payload.items ?? [];
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'network_error';
    }
  }
  throw new Error(lastError);
};

export const listBiomarkerHistory = async (): Promise<BiomarkerHistoryItem[]> => {
  let lastError = 'network_error';
  for (const baseUrl of getBaseUrls()) {
    try {
      const payload = await requestJson<{ items: BiomarkerHistoryItem[] }>(baseUrl, '/v1/biomarkers/history?limit=200');
      return payload.items ?? [];
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'network_error';
    }
  }
  throw new Error(lastError);
};

export const uploadAndAnalyzeReport = async (params: {
  fileUri: string;
  fileName: string;
  mimeType: string;
  source?: 'camera' | 'gallery' | 'pdf';
  reportDate?: string;
  labName?: string;
  signal?: AbortSignal;
  onProgress?: (event: { stage: UploadProgressStage; percent: number; message: string; status?: string }) => void;
}): Promise<ReportAnalysisResponse> => {
  const form = new FormData();
  form.append('reportFile', {
    uri: params.fileUri,
    name: params.fileName,
    type: params.mimeType
  } as any);
  if (params.reportDate) form.append('reportDate', params.reportDate);
  if (params.labName) form.append('labName', params.labName);
  if (params.source) form.append('source', params.source);

  let lastError = 'network_error';
  for (const baseUrl of getBaseUrls()) {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    params.signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    params.onProgress?.({ stage: 'uploading', percent: 12, message: 'Uploading Report', status: 'UPLOADING' });
    try {
      const response = await fetch(`${baseUrl}/v1/reports/analyze/start`, {
        method: 'POST',
        headers: buildAuthorizationHeaders(),
        body: form,
        signal: controller.signal
      });
      clearTimeout(timeout);
      const startPayload = await parseJson<{ reportId?: string; status?: string; message?: string; error?: string }>(response).catch(
        () => ({} as { reportId?: string; status?: string; message?: string; error?: string })
      );
      if (!response.ok || !startPayload.reportId) {
        lastError = startPayload.message ?? startPayload.error ?? `HTTP_${response.status}`;
        continue;
      }

      params.onProgress?.({
        stage: 'uploaded',
        percent: 35,
        message: startPayload.message ?? 'Report uploaded successfully. Processing health information...',
        status: startPayload.status ?? 'UPLOADED'
      });

      const startedAt = Date.now();
      while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
        await sleep(POLL_INTERVAL_MS, params.signal);
        const statusPayload = await requestJson<{ reportId: string; status: string; error?: string }>(
          baseUrl,
          `/v1/reports/${encodeURIComponent(startPayload.reportId)}/status`,
          { signal: params.signal }
        );
        const progress = statusToProgress(statusPayload.status);
        params.onProgress?.({
          stage: progress.stage,
          percent: progress.percent,
          message: statusPayload.error ? `${progress.message} ${statusPayload.error}` : progress.message,
          status: progress.step
        });
        if (statusPayload.status === 'FAILED' || statusPayload.status === 'REVIEW_REQUIRED') {
          throw new Error(statusPayload.error ?? progress.message);
        }
        if (statusPayload.status === 'COMPLETED') {
          const report = await requestJson<ReportDto>(baseUrl, `/v1/reports/${encodeURIComponent(startPayload.reportId)}`, {
            signal: params.signal
          });
          if (!report.analysis) {
            throw new Error('Report completed but analysis payload is missing.');
          }
          return {
            ...report.analysis,
            reportId: report.id,
            status: report.status
          };
        }
      }
      throw new Error('REQUEST_TIMEOUT');
    } catch (error) {
      clearTimeout(timeout);
      lastError = error instanceof Error ? error.message : 'network_error';
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = params.signal?.aborted ? 'REQUEST_CANCELLED' : 'REQUEST_TIMEOUT';
      }
    } finally {
      params.signal?.removeEventListener('abort', abortFromCaller);
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
