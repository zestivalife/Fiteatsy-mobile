import { ReportParameter } from './nuetraService';
import { apiBaseUrl, buildAuthorizationHeaders } from './apiClient';

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
  score: number | null;
  categoryScores: CategoryScores;
  summary: string;
  actionPlan: Array<{ priority: number; title: string; detail: string }>;
  document?: {
    documentType: string;
    supported: boolean;
    labName: string;
    pageCount: number;
    imageQuality: string;
    confidence: number;
  };
  qualityGate?: {
    status: 'PUBLISHABLE' | 'REVIEW_REQUIRED' | 'INSUFFICIENT_DATA';
    canScore: boolean;
    canPublish: boolean;
    confidence: number;
    extractionConfidence: number;
    validationConfidence: number;
    biomarkerCompleteness: number;
    tier1ExtractionConfidence?: number;
    tier1Coverage?: number;
    tier1RequiredCoverage?: number;
    reportContexts?: string[];
    requiredTier1Biomarkers?: string[];
    expectedBiomarkers?: { min: number; max: number; basis: string };
    detectedBiomarkers: number;
    validatedBiomarkers: number;
    coreBiomarkers: number;
    validatedCoreBiomarkers?: number;
    validatedRequiredTier1Biomarkers?: number;
    tier2Biomarkers?: number;
    tier3Biomarkers?: number;
    failedBiomarkers: string[];
    rejectedBiomarkers?: Array<{
      biomarker_name: string;
      tier: 1 | 2 | 3;
      reason: string;
      validation_status: 'VALID' | 'NEEDS_REVIEW' | 'INVALID';
    }>;
    missingCriticalBiomarkers?: string[];
    conflicts?: string[];
    evidenceTraceability?: Array<{
      biomarker_name: string;
      value: number;
      unit: string;
      source_page: number;
      extraction_method: string;
      confidence_score: number;
      validation_status: 'VALID' | 'NEEDS_REVIEW' | 'INVALID';
    }>;
    reasons: string[];
  };
  healthAssessment?: {
    markerLabel: string;
    confidenceLabel: 'High' | 'Medium' | 'Needs Review';
    healthAreas: string[];
  };
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

const REQUEST_TIMEOUT_MS = 30000;
const STATUS_REQUEST_TIMEOUT_MS = 20000;
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 120000;

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const safeHeaderSummary = (headers: Record<string, string>) => ({
  hasAuthorization: Boolean(headers.Authorization),
  headerKeys: Object.keys(headers)
});

const logReportDebug = (event: string, payload: Record<string, unknown>) => {
  console.log(`[ReportsUpload] ${event}`, payload);
};

const isTerminalHttpError = (error: unknown) => error instanceof Error && error.message.startsWith('REPORT_API_HTTP_');

const getBaseUrls = () => {
  return unique([apiBaseUrl]);
};

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      const error = new Error('Aborted');
      error.name = 'AbortError';
      reject(error);
      return;
    }
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

const requestJson = async <T>(baseUrl: string, path: string, options?: RequestInit & { timeoutMs?: number }): Promise<T> => {
  const { timeoutMs, signal, ...fetchOptions } = options ?? {};
  const authHeaders = buildAuthorizationHeaders();
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  const timeout = setTimeout(() => controller.abort(), timeoutMs ?? STATUS_REQUEST_TIMEOUT_MS);
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  logReportDebug('request:start', {
    url: `${baseUrl}${path}`,
    method: fetchOptions.method ?? 'GET',
    headers: safeHeaderSummary(authHeaders)
  });
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        ...authHeaders,
        ...(fetchOptions.headers ?? {})
      }
    });
    const payload = await parseJson<T & { message?: string; error?: string }>(response).catch(() => ({} as T & { message?: string; error?: string }));
    logReportDebug('request:response', {
      url: `${baseUrl}${path}`,
      status: response.status,
      payload
    });
    if (!response.ok) {
      throw new Error(`REPORT_API_HTTP_${response.status}: ${payload.message ?? payload.error ?? 'Request failed.'}`);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(signal?.aborted ? 'REQUEST_CANCELLED' : 'REQUEST_TIMEOUT');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
};

const statusToProgress = (status: string): { stage: UploadProgressStage; percent: number; message: string; step: string } => {
  switch (status) {
    case 'UPLOADED':
      return { stage: 'uploaded', percent: 30, message: 'Uploading report...', step: 'UPLOADED' };
    case 'PROCESSING':
      return { stage: 'processing', percent: 45, message: 'Reading document...', step: 'PROCESSING' };
    case 'DOCUMENT_ANALYSIS_COMPLETED':
      return { stage: 'processing', percent: 58, message: 'Understanding pages and report structure...', step: 'DOCUMENT_ANALYSIS_COMPLETED' };
    case 'EXTRACTION_COMPLETED':
    case 'EXTRACTED':
      return { stage: 'extraction', percent: 74, message: 'Extracting health parameters...', step: 'EXTRACTION_COMPLETED' };
    case 'VALIDATION_PENDING':
      return { stage: 'validation', percent: 84, message: 'Validating extracted values...', step: 'VALIDATION_PENDING' };
    case 'VALIDATION_COMPLETED':
    case 'VALIDATED':
      return { stage: 'validation', percent: 88, message: 'Validating extracted values...', step: 'VALIDATION_COMPLETED' };
    case 'PRIORITIZATION_COMPLETED':
    case 'PRIORITIZED':
      return { stage: 'validation', percent: 94, message: 'Calculating health impact...', step: 'PRIORITIZATION_COMPLETED' };
    case 'SCORE_GENERATED':
    case 'SCORED':
      return { stage: 'validation', percent: 98, message: 'Generating intelligence...', step: 'SCORE_GENERATED' };
    case 'COMPLETED':
    case 'PUBLISHED':
      return { stage: 'completed', percent: 100, message: 'Report analysis completed.', step: 'PUBLISHED' };
    case 'REVIEW_REQUIRED':
      return { stage: 'failed', percent: 100, message: 'Manual review is required before results can be shown.', step: 'REVIEW_REQUIRED' };
    case 'INSUFFICIENT_DATA':
      return { stage: 'failed', percent: 100, message: 'Insufficient report data. Replace with a clearer or complete report.', step: 'INSUFFICIENT_DATA' };
    case 'FAILED':
      return { stage: 'failed', percent: 100, message: 'Processing failed because the backend could not complete analysis.', step: 'FAILED' };
    default:
      return { stage: 'processing', percent: 45, message: 'Processing health information...', step: status };
  }
};

export const listAnalyzedReports = async (): Promise<ReportDto[]> => {
  let lastError = 'network_error';
  logReportDebug('history:start', { baseUrls: getBaseUrls() });
  for (const baseUrl of getBaseUrls()) {
    try {
      const payload = await requestJson<{ items: ReportDto[] }>(baseUrl, '/v1/reports?limit=50');
      return payload.items ?? [];
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'network_error';
      logReportDebug('history:failure', { baseUrl, error: lastError });
      if (isTerminalHttpError(error)) throw error;
    }
  }
  throw new Error(lastError);
};

export const listBiomarkerHistory = async (): Promise<BiomarkerHistoryItem[]> => {
  let lastError = 'network_error';
  logReportDebug('biomarkers:start', { baseUrls: getBaseUrls() });
  for (const baseUrl of getBaseUrls()) {
    try {
      const payload = await requestJson<{ items: BiomarkerHistoryItem[] }>(baseUrl, '/v1/biomarkers/history?limit=200');
      return payload.items ?? [];
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'network_error';
      logReportDebug('biomarkers:failure', { baseUrl, error: lastError });
      if (isTerminalHttpError(error)) throw error;
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
  logReportDebug('upload:start', {
    baseUrls: getBaseUrls(),
    mimeType: params.mimeType,
    source: params.source,
    hasFileName: Boolean(params.fileName),
    hasReportDate: Boolean(params.reportDate),
    hasLabName: Boolean(params.labName)
  });
  for (const baseUrl of getBaseUrls()) {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    params.signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    params.onProgress?.({ stage: 'uploading', percent: 12, message: 'Uploading Report', status: 'UPLOADING' });
    try {
      const authHeaders = buildAuthorizationHeaders();
      logReportDebug('upload:request', {
        url: `${baseUrl}/v1/reports/analyze/start`,
        method: 'POST',
        headers: safeHeaderSummary(authHeaders),
        payload: {
          mimeType: params.mimeType,
          source: params.source,
          hasFileName: Boolean(params.fileName),
          hasReportDate: Boolean(params.reportDate),
          hasLabName: Boolean(params.labName)
        }
      });
      const response = await fetch(`${baseUrl}/v1/reports/analyze/start`, {
        method: 'POST',
        headers: authHeaders,
        body: form,
        signal: controller.signal
      });
      clearTimeout(timeout);
      const startPayload = await parseJson<{ reportId?: string; status?: string; message?: string; error?: string }>(response).catch(
        () => ({} as { reportId?: string; status?: string; message?: string; error?: string })
      );
      if (!response.ok || !startPayload.reportId) {
        lastError = `REPORT_API_HTTP_${response.status}: ${startPayload.message ?? startPayload.error ?? 'Upload start failed.'}`;
        logReportDebug('upload:response-failed', { baseUrl, status: response.status, payload: startPayload });
        if (!response.ok) throw new Error(lastError);
        continue;
      }
      logReportDebug('upload:response-ok', { baseUrl, status: response.status, reportId: startPayload.reportId, reportStatus: startPayload.status });

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
        logReportDebug('poll:status', {
          baseUrl,
          reportId: statusPayload.reportId,
          status: statusPayload.status,
          error: statusPayload.error
        });
        params.onProgress?.({
          stage: progress.stage,
          percent: progress.percent,
          message: statusPayload.error ? `${progress.message} ${statusPayload.error}` : progress.message,
          status: progress.step
        });
        if (statusPayload.status === 'FAILED' || statusPayload.status === 'REVIEW_REQUIRED' || statusPayload.status === 'INSUFFICIENT_DATA') {
          throw new Error(statusPayload.error ?? progress.message);
        }
        if (statusPayload.status === 'COMPLETED' || statusPayload.status === 'PUBLISHED') {
          const report = await requestJson<ReportDto>(baseUrl, `/v1/reports/${encodeURIComponent(startPayload.reportId)}`, {
            signal: params.signal
          });
          if (!report.analysis) {
            throw new Error('Report completed but analysis payload is missing.');
          }
          logReportDebug('result:fetched', {
            reportId: report.id,
            status: report.status,
            parameterCount: report.analysis.parameters.length
          });
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
      logReportDebug('upload:error', { baseUrl, error: lastError });
      if (isTerminalHttpError(error)) throw error;
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
  if (lastError.includes('REPORT_API_HTTP_401')) {
    throw new Error('Authentication is required before uploading reports. Please sign in again and retry.');
  }
  throw new Error(`Analysis failed: ${lastError}`);
};
