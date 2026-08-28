import { Router } from 'express';
import multer from 'multer';
import { AdvancedAnalysisNotAllowedError, analyzeReportBuffer, analyzeReportBufferAdvanced, ReportAnalysisResult } from './reports.service.js';
import {
  addFeedback,
  attachReportAnalysis,
  completeUploadSession,
  createDocumentIntelligenceAudit,
  createReportRecord,
  createUploadSession,
  deleteAllReports,
  deleteReport,
  findActiveReportByDocumentHash,
  getReport,
  getReportFile,
  getUploadSession,
  listReports,
  saveReportFile,
  updateReportMetadata,
  updateReportStatus
} from './reports.store.js';
import { syncReportPipelineToPlatform } from '../platform/platform.service.js';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import { ClientOwnershipContext } from '../platform/platform.types.js';
import { createProcessingJob, updateProcessingJobStatus } from '../processing/processing-jobs.repository.js';
import { persistReportIntelligence } from './report-intelligence.pipeline.js';
import { documentHash } from './report-governance.js';
import { sanitizeReportAnalysisForPublic, sanitizeReportErrorForPublic } from './report-response.js';
import { calculateHealthScores } from '../intelligence/health-calculation-engine.js';
import { clearHealthScoresForOwner } from '../intelligence/health-scores.repository.js';
import { buildReportComparison, sortAnalysableReports } from './report-comparison.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }
});

const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

export const reportsRouter = Router();

const currentOwner = (account: ReturnType<typeof getAuthenticatedAccount>): ClientOwnershipContext => ({
  accountId: account.accountId,
  clientId: account.client.id
});

const reportOwner = (owner: ClientOwnershipContext) => ({ userId: owner.accountId, clientId: owner.clientId });

const toReportDto = (record: Awaited<ReturnType<typeof getReport>>) => {
  if (!record) return null;
  const analysis = record.analysis ? sanitizeReportAnalysisForPublic(record.analysis) : undefined;
  return {
    id: record.id,
    userId: record.userId,
    status: record.status,
    fileName: record.fileName,
    mimeType: record.mimeType,
    fileSize: record.fileSize,
    reportDate: record.reportDate,
    labName: record.labName,
    source: record.source,
    createdAtISO: record.createdAtISO,
    updatedAtISO: record.updatedAtISO,
    error: sanitizeReportErrorForPublic(record.error),
    analysisVersion: record.analysisVersion,
    document: analysis?.document,
    qualityGate: analysis?.qualityGate,
    healthAssessment: analysis?.healthAssessment,
    analysis,
    analysisAttempts: record.analysisAttempts.map((attempt) => ({
      id: attempt.id,
      analysisMode: attempt.analysisMode,
      status: attempt.status,
      selected: attempt.selected,
      createdAtISO: attempt.createdAtISO,
      summary: attempt.summary
    })),
    feedback: record.feedback
  };
};

const ownsReport = (record: Awaited<ReturnType<typeof getReport>>, owner: ClientOwnershipContext) =>
  Boolean(record && record.userId === owner.accountId && record.clientId === owner.clientId);

const requiresAdvancedReanalysis = (report: NonNullable<Awaited<ReturnType<typeof getReport>>>) => {
  if (!report.analysis) return true;
  return (
    report.analysis.qualityGate.status !== 'PUBLISHABLE' ||
    report.analysis.qualityGate.reasons.length > 0 ||
    report.analysis.qualityGate.failedBiomarkers.length > 0 ||
    (report.analysis.qualityGate.rejectedBiomarkers?.length ?? 0) > 0 ||
    report.analysis.qualityGate.missingCriticalBiomarkers.length > 0 ||
    report.analysis.qualityGate.conflicts.length > 0 ||
    report.analysis.extractionAttempts.some((attempt) => attempt.rescanRecommended)
  );
};

const recomputeOwnerHealthScores = async (owner: ClientOwnershipContext) => {
  await clearHealthScoresForOwner(owner);
  await calculateHealthScores(owner);
};

const logReportRuntime = (event: string, payload: Record<string, unknown>) => {
  console.log(`[ReportsRuntime] ${event}`, payload);
};

const logReanalysisStage = (payload: {
  reportId: string;
  userId: string;
  clientId: string;
  stage: string;
  status: 'started' | 'completed' | 'failed';
  error?: string;
  details?: Record<string, unknown>;
}) => {
  logReportRuntime('REANALYSIS_STAGE', payload);
};

type AttachedReportAnalysis = NonNullable<Awaited<ReturnType<typeof attachReportAnalysis>>>;
type PersistedReportIntelligence = Awaited<ReturnType<typeof persistReportIntelligence>>;
type FinalizedReport = Awaited<ReturnType<typeof updateReportStatus>>;

export const finalizeReportAfterIntelligence = async (input: {
  analysis: ReportAnalysisResult;
  attach: () => Promise<AttachedReportAnalysis | null>;
  persist: (analysis: ReportAnalysisResult) => Promise<PersistedReportIntelligence>;
  finalize: (
    status: AttachedReportAnalysis['selectedStatus'],
    error?: string
  ) => Promise<FinalizedReport>;
}) => {
  const saved = await input.attach();
  const selectedAnalysis = saved?.analysis ?? input.analysis;
  const intelligence = await input.persist(selectedAnalysis);
  const completed = await input.finalize(saved?.selectedStatus ?? 'INSUFFICIENT_DATA', saved?.error);
  return { saved, selectedAnalysis, intelligence, completed };
};

const analyzeAndPersistReport = async (input: {
  owner: ClientOwnershipContext;
  reportId: string;
  processingJobId: string;
  fileName: string;
  fileBuffer: Buffer;
  mimeType: string;
  manualDate?: string;
  manualLab?: string;
  analysisMode?: 'standard' | 'advanced_reanalysis';
  analyzer?: (buffer: Buffer, mimeType: string) => Promise<ReportAnalysisResult>;
}) => {
  logReportRuntime('processing:start', {
    reportId: input.reportId,
    processingJobId: input.processingJobId,
    mimeType: input.mimeType
  });
  await syncReportPipelineToPlatform(input.owner, input.reportId, 'uploaded', `Blood report uploaded: ${input.fileName}`);
  await updateReportStatus(input.reportId, 'PROCESSING');
  await updateProcessingJobStatus(input.processingJobId, 'processing');
  logReportRuntime('processing:status', { reportId: input.reportId, status: 'PROCESSING' });
  const analysis = await (input.analyzer ?? analyzeReportBuffer)(input.fileBuffer, input.mimeType);
  await updateReportStatus(input.reportId, 'DOCUMENT_ANALYSIS_COMPLETED');
  logReportRuntime('processing:status', {
    reportId: input.reportId,
    status: 'DOCUMENT_ANALYSIS_COMPLETED',
    documentType: analysis.document.documentType,
    supported: analysis.document.supported
  });
  await updateReportStatus(input.reportId, 'EXTRACTION_COMPLETED');
  await updateProcessingJobStatus(input.processingJobId, 'extraction_completed');
  logReportRuntime('processing:status', {
    reportId: input.reportId,
    status: 'EXTRACTION_COMPLETED',
    parameterCount: analysis.parameters.length
  });
  await syncReportPipelineToPlatform(input.owner, input.reportId, 'ocr_completed', `OCR completed for ${input.fileName}`);
  if (input.manualDate) analysis.reportDate = input.manualDate;
  if (input.manualLab) analysis.labName = input.manualLab;
  await updateProcessingJobStatus(input.processingJobId, 'validation_pending');
  await updateReportStatus(input.reportId, 'VALIDATION_COMPLETED');
  logReportRuntime('processing:status', {
    reportId: input.reportId,
    status: 'VALIDATION_COMPLETED',
    validationConfidence: analysis.qualityGate.validationConfidence
  });
  const { saved, selectedAnalysis, intelligence, completed } = await finalizeReportAfterIntelligence({
    analysis,
    attach: () => attachReportAnalysis(input.reportId, analysis, input.analysisMode ?? 'standard', true),
    persist: (selected) => persistReportIntelligence(input.owner, input.reportId, selected),
    finalize: (status, error) => updateReportStatus(input.reportId, status, error)
  });
  logReportRuntime('processing:status', {
    reportId: input.reportId,
    status: 'SELECTED_ANALYSIS_PERSISTED',
    candidateQualityGate: analysis.qualityGate.status,
    selectedQualityGate: selectedAnalysis.qualityGate.status,
    selectedBiomarkers: selectedAnalysis.parameters.length
  });
  await updateProcessingJobStatus(input.processingJobId, analysis.qualityGate.canPublish ? 'completed' : 'review_required', saved?.error);
  logReportRuntime('processing:debug-trace', {
    reportId: input.reportId,
    fileName: input.fileName,
    debugTrace: analysis.debugTrace
  });
  logReportRuntime('processing:completed', {
    reportId: input.reportId,
    status: completed?.status,
    observationCount: intelligence.observations.length,
    scoreCount: intelligence.scores.length,
    qualityGate: selectedAnalysis.qualityGate.status
  });
  if (selectedAnalysis.qualityGate.canPublish) {
    await syncReportPipelineToPlatform(input.owner, input.reportId, 'biomarkers_updated', `Biomarkers extracted from ${input.fileName}`);
    await syncReportPipelineToPlatform(input.owner, input.reportId, 'analysis_completed', `AI validation completed for ${input.fileName}`);
  }
  const publicAnalysis = sanitizeReportAnalysisForPublic(selectedAnalysis);
  return {
    reportId: saved?.id,
    status: completed?.status,
    biomarkerObservations: intelligence.observations,
    healthScores: intelligence.scores.map((score) => ({
      scoreType: score.scoreType,
      scoreValue: score.scoreValue,
      scoreStatus: score.scoreStatus,
      confidence: score.confidence,
      calculatedAtISO: score.calculatedAtISO
    })),
    ...publicAnalysis
  };
};

reportsRouter.get('/supported-formats', (_req, res) => {
  res.json({
    formats: allowedMimeTypes,
    maxUploadBytes: 12 * 1024 * 1024,
    recommendedImage: { maxWidth: 2000, minWidth: 1200, preferred: 'jpeg' }
  });
});

reportsRouter.use(requireAuthenticatedAccount);

reportsRouter.post('/upload/init', async (req, res) => {
  const owner = currentOwner(getAuthenticatedAccount(req));
  const fileName = String(req.body?.fileName || '').trim();
  const mimeType = String(req.body?.mimeType || '').trim().toLowerCase();
  const fileSize = Number(req.body?.fileSize || 0);
  const source = req.body?.source as 'camera' | 'gallery' | 'pdf' | undefined;

  if (!fileName || !mimeType || !Number.isFinite(fileSize) || fileSize <= 0) {
    return res.status(400).json({ error: 'INVALID_UPLOAD_METADATA', message: 'fileName, mimeType, fileSize are required.' });
  }
  if (!allowedMimeTypes.includes(mimeType)) {
    return res.status(415).json({ error: 'UNSUPPORTED_FILE', message: 'Only PDF/JPEG/PNG/WebP reports are supported.' });
  }
  if (fileSize > 12 * 1024 * 1024) {
    return res.status(413).json({ error: 'FILE_TOO_LARGE', message: 'Max upload size is 12MB.' });
  }

  const session = await createUploadSession({ ...reportOwner(owner), fileName, mimeType, fileSize, source });
  await syncReportPipelineToPlatform(owner, session.id, 'uploaded', `Blood report upload initialized for ${fileName}`);
  return res.status(201).json({ uploadId: session.id, expiresAtISO: session.expiresAtISO, status: session.status });
});

reportsRouter.post('/upload/complete', async (req, res) => {
  const owner = currentOwner(getAuthenticatedAccount(req));
  const uploadId = String(req.body?.uploadId || '').trim();
  if (!uploadId) return res.status(400).json({ error: 'MISSING_UPLOAD_ID', message: 'uploadId is required.' });
  const session = await completeUploadSession(uploadId, reportOwner(owner));
  if (!session) return res.status(404).json({ error: 'UPLOAD_SESSION_NOT_FOUND', message: 'Upload session not found or expired.' });
  return res.status(200).json({ uploadId: session.id, status: session.status, expiresAtISO: session.expiresAtISO });
});

reportsRouter.get('/', async (req, res) => {
  const owner = currentOwner(getAuthenticatedAccount(req));
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const items = await listReports(reportOwner(owner));
  const page = items.slice(offset, offset + limit).map(toReportDto);
  return res.status(200).json({ total: items.length, limit, offset, items: page });
});

reportsRouter.get('/comparison/current', async (req, res) => {
  const owner = currentOwner(getAuthenticatedAccount(req));
  const reports = sortAnalysableReports(await listReports(reportOwner(owner)));
  if (reports.length < 2) {
    return res.status(404).json({ error: 'REPORT_COMPARISON_NOT_AVAILABLE', message: 'Two analysed reports are required.' });
  }
  return res.status(200).json(buildReportComparison(reports[0], reports[1]));
});

reportsRouter.get('/:reportId', async (req, res) => {
  const owner = currentOwner(getAuthenticatedAccount(req));
  const report = await getReport(req.params.reportId);
  if (!ownsReport(report, owner)) {
    return res.status(404).json({ error: 'REPORT_NOT_FOUND', message: 'Report not found.' });
  }
  return res.status(200).json(toReportDto(report));
});

reportsRouter.get('/:reportId/status', async (req, res) => {
  const owner = currentOwner(getAuthenticatedAccount(req));
  const report = await getReport(req.params.reportId);
  if (!ownsReport(report, owner)) {
    return res.status(404).json({ error: 'REPORT_NOT_FOUND', message: 'Report not found.' });
  }
  logReportRuntime('status:returned', {
    reportId: report!.id,
    status: report!.status,
    hasError: Boolean(report!.error)
  });
  const analysis = report!.analysis ? sanitizeReportAnalysisForPublic(report!.analysis) : undefined;
  return res.status(200).json({
    reportId: report!.id,
    status: report!.status,
    updatedAtISO: report!.updatedAtISO,
    error: sanitizeReportErrorForPublic(report!.error),
    document: analysis?.document,
    qualityGate: analysis?.qualityGate,
    healthAssessment: analysis?.healthAssessment,
    processingTimeline: analysis?.extractionAttempts
  });
});

reportsRouter.patch('/:reportId/metadata', async (req, res) => {
  const owner = currentOwner(getAuthenticatedAccount(req));
  const report = await getReport(req.params.reportId);
  if (!ownsReport(report, owner)) {
    return res.status(404).json({ error: 'REPORT_NOT_FOUND', message: 'Report not found.' });
  }
  const patched = await updateReportMetadata(report!.id, reportOwner(owner), {
    labName: typeof req.body?.labName === 'string' ? req.body.labName.trim() : undefined,
    reportDate: typeof req.body?.reportDate === 'string' ? req.body.reportDate.trim() : undefined,
    source:
      req.body?.source === 'camera' || req.body?.source === 'gallery' || req.body?.source === 'pdf'
        ? req.body.source
        : undefined
  });
  return res.status(200).json(toReportDto(patched));
});

reportsRouter.delete('/all', async (req, res) => {
  const owner = currentOwner(getAuthenticatedAccount(req));
  if (Array.isArray(req.body?.reportIds) || Array.isArray(req.body?.ids)) {
    return res.status(400).json({
      error: 'CLIENT_SCOPED_BULK_DELETE_REJECTED',
      message: 'Delete-all is scoped only by the authenticated account and current client.'
    });
  }
  const deletedReportIds = await deleteAllReports(reportOwner(owner));
  if (deletedReportIds.length > 0) {
    await recomputeOwnerHealthScores(owner);
  }
  return res.status(200).json({
    deletedCount: deletedReportIds.length,
    recoveryWindowDays: 30
  });
});

reportsRouter.delete('/:reportId', async (req, res) => {
  const owner = currentOwner(getAuthenticatedAccount(req));
  const report = await getReport(req.params.reportId);
  if (!ownsReport(report, owner)) {
    return res.status(404).json({ error: 'REPORT_NOT_FOUND', message: 'Report not found.' });
  }
  await deleteReport(report!.id, reportOwner(owner));
  await recomputeOwnerHealthScores(owner);
  return res.status(200).json({ deleted: true, reportId: report!.id, recoveryWindowDays: 30 });
});

reportsRouter.post('/:reportId/feedback', async (req, res) => {
  const owner = currentOwner(getAuthenticatedAccount(req));
  const report = await getReport(req.params.reportId);
  if (!ownsReport(report, owner)) {
    return res.status(404).json({ error: 'REPORT_NOT_FOUND', message: 'Report not found.' });
  }
  const note = String(req.body?.note || '').trim();
  if (!note) return res.status(400).json({ error: 'MISSING_NOTE', message: 'Feedback note is required.' });
  const feedback = await addFeedback(report!.id, reportOwner(owner), {
    note,
    correctedLabName: typeof req.body?.correctedLabName === 'string' ? req.body.correctedLabName.trim() : undefined,
    correctedReportDate: typeof req.body?.correctedReportDate === 'string' ? req.body.correctedReportDate.trim() : undefined
  });
  return res.status(201).json(feedback);
});

reportsRouter.post('/:reportId/reanalyze', async (req, res) => {
  const owner = currentOwner(getAuthenticatedAccount(req));
  logReportRuntime('REANALYSIS_STARTED', {
    reportId: req.params.reportId,
    userId: owner.accountId,
    clientId: owner.clientId
  });
  logReanalysisStage({
    reportId: req.params.reportId,
    userId: owner.accountId,
    clientId: owner.clientId,
    stage: 'auth_context',
    status: 'completed'
  });
  const report = await getReport(req.params.reportId);
  if (!ownsReport(report, owner)) {
    logReanalysisStage({
      reportId: req.params.reportId,
      userId: owner.accountId,
      clientId: owner.clientId,
      stage: 'ownership_validation',
      status: 'failed',
      error: 'REPORT_NOT_FOUND'
    });
    return res.status(404).json({ error: 'REPORT_NOT_FOUND', message: 'Report not found.' });
  }
  logReanalysisStage({
    reportId: report!.id,
    userId: owner.accountId,
    clientId: owner.clientId,
    stage: 'ownership_validation',
    status: 'completed',
    details: { reportStatus: report!.status, attempts: report!.analysisAttempts.length }
  });
  if (!requiresAdvancedReanalysis(report!)) {
    logReanalysisStage({
      reportId: report!.id,
      userId: owner.accountId,
      clientId: owner.clientId,
      stage: 'quality_gate',
      status: 'failed',
      error: 'REANALYZE_NOT_REQUIRED'
    });
    return res.status(409).json({
      error: 'REANALYZE_NOT_REQUIRED',
      message: 'This report already passed the quality gate without review signals. Advanced re-analysis is only available for low-confidence reports.'
    });
  }

  const file = await getReportFile(report!.id, reportOwner(owner));
  if (!file) {
    logReanalysisStage({
      reportId: report!.id,
      userId: owner.accountId,
      clientId: owner.clientId,
      stage: 'original_file_retrieval',
      status: 'failed',
      error: 'REPORT_FILE_NOT_AVAILABLE'
    });
    return res.status(409).json({
      error: 'REPORT_FILE_NOT_AVAILABLE',
      message: 'The original upload is not available for re-analysis. Please upload the report again.'
    });
  }
  logReanalysisStage({
    reportId: report!.id,
    userId: owner.accountId,
    clientId: owner.clientId,
    stage: 'original_file_retrieval',
    status: 'completed',
    details: { mimeType: file.mimeType, fileSize: file.fileSize }
  });

  const processingJob = await createProcessingJob({
    clientId: owner.clientId,
    reportId: report!.id,
    jobType: 'report_reanalysis',
    status: 'processing'
  });

  try {
    logReanalysisStage({
      reportId: report!.id,
      userId: owner.accountId,
      clientId: owner.clientId,
      stage: 'provider_request',
      status: 'started'
    });
    const payload = await analyzeAndPersistReport({
      owner,
      reportId: report!.id,
      processingJobId: processingJob.id,
      fileName: file.fileName,
      fileBuffer: file.content,
      mimeType: file.mimeType,
      manualDate: report!.reportDate,
      manualLab: report!.labName,
      analysisMode: 'advanced_reanalysis',
      analyzer: (buffer, mimeType) =>
        analyzeReportBufferAdvanced(buffer, mimeType, {
          analysisTrigger: 'USER_REANALYZE',
          reportId: report!.id,
          userId: owner.accountId,
          clientId: owner.clientId,
          auditProviderCall: async (audit) => {
            if (!audit.reportId || !audit.userId || !audit.clientId) {
              throw new Error('Document intelligence audit context is incomplete.');
            }
            await createDocumentIntelligenceAudit({
              reportId: audit.reportId,
              triggerSource: audit.triggerSource,
              provider: audit.provider,
              model: audit.model,
              userId: audit.userId,
              clientId: audit.clientId,
              costEstimate: audit.costEstimate
            });
          }
        })
    });
    logReanalysisStage({
      reportId: report!.id,
      userId: owner.accountId,
      clientId: owner.clientId,
      stage: 'attempt_storage_and_selection',
      status: 'completed',
      details: {
        finalStatus: payload.status,
        detectedBiomarkers: payload.qualityGate?.detectedBiomarkers,
        validatedBiomarkers: payload.qualityGate?.validatedBiomarkers
      }
    });
    return res.status(200).json({ ...payload, reanalysis: true });
  } catch (error) {
    if (error instanceof AdvancedAnalysisNotAllowedError) {
      return res.status(403).json({
        error: error.code,
        message: 'Advanced document intelligence can only run after the user taps Re-analyse Report.'
      });
    }
    const message = error instanceof Error ? error.message : 'Unable to re-analyze this report file.';
    logReanalysisStage({
      reportId: report!.id,
      userId: owner.accountId,
      clientId: owner.clientId,
      stage: 'provider_request_or_analysis',
      status: 'failed',
      error: message
    });
    logReportRuntime('reanalysis:failed', { reportId: report!.id, processingJobId: processingJob.id, message });
    await updateReportStatus(report!.id, 'REVIEW_REQUIRED', message);
    await updateProcessingJobStatus(processingJob.id, 'failed', message);
    return res.status(422).json({
      error: 'REANALYSIS_FAILED',
      message: sanitizeReportErrorForPublic(message)
    });
  }
});

reportsRouter.get('/:reportId/comparison', async (req, res) => {
  const owner = currentOwner(getAuthenticatedAccount(req));
  const current = await getReport(req.params.reportId);
  if (!ownsReport(current, owner)) {
    return res.status(404).json({ error: 'REPORT_NOT_FOUND', message: 'Current report not found.' });
  }
  const previousReportId = String(req.query.previousReportId || '').trim();
  if (!previousReportId) {
    return res.status(400).json({ error: 'MISSING_PREVIOUS_REPORT_ID', message: 'previousReportId is required.' });
  }
  const previous = await getReport(previousReportId);
  if (!ownsReport(previous, owner)) {
    return res.status(404).json({ error: 'PREVIOUS_REPORT_NOT_FOUND', message: 'Previous report not found.' });
  }
  try {
    return res.status(200).json(buildReportComparison(current!, previous!));
  } catch (error) {
    const code = error instanceof Error ? error.message : 'REPORT_COMPARISON_INVALID';
    return res.status(409).json({ error: code, message: 'These reports cannot be compared.' });
  }
});

reportsRouter.post('/analyze/start', upload.single('reportFile'), async (req, res) => {
  let currentReportId: string | null = null;
  let currentJobId: string | null = null;
  try {
    if (!req.file) {
      logReportRuntime('upload:start:missing-file', { authenticated: Boolean(getAuthenticatedAccount(req)) });
      return res.status(400).json({ error: 'MISSING_FILE', message: 'Please upload a PDF or image report file.' });
    }

    const mime = req.file.mimetype.toLowerCase();
    logReportRuntime('upload:start:received', {
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      source: req.body?.source,
      hasUploadId: typeof req.body?.uploadId === 'string' && Boolean(req.body.uploadId.trim())
    });
    if (!mime.includes('pdf') && !mime.includes('image')) {
      return res.status(415).json({ error: 'UNSUPPORTED_FILE', message: 'Only PDF and image reports are supported.' });
    }

    const owner = currentOwner(getAuthenticatedAccount(req));
    const fileBuffer = Buffer.from(req.file.buffer);
    const hash = documentHash(fileBuffer);
    const duplicate = await findActiveReportByDocumentHash(reportOwner(owner), hash);
    if (duplicate) {
      logReportRuntime('upload:start:duplicate', { reportId: duplicate.id, status: duplicate.status });
      return res.status(200).json({
        reportId: duplicate.id,
        status: duplicate.status,
        duplicate: true,
        message: 'Existing report detected. Reusing the current processing result.'
      });
    }
    const uploadId = typeof req.body?.uploadId === 'string' ? req.body.uploadId.trim() : '';
    const uploadSession = uploadId ? await getUploadSession(uploadId, reportOwner(owner)) : null;
    if (uploadId && !uploadSession) {
      return res.status(404).json({ error: 'UPLOAD_SESSION_NOT_FOUND', message: 'uploadId is invalid or expired.' });
    }

    const record = await createReportRecord({
      ...reportOwner(owner),
      fileName: req.file.originalname || `report-${Date.now()}`,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      reportDate: typeof req.body?.reportDate === 'string' ? req.body.reportDate.trim() : undefined,
      labName: typeof req.body?.labName === 'string' ? req.body.labName.trim() : undefined,
      source:
        req.body?.source === 'camera' || req.body?.source === 'gallery' || req.body?.source === 'pdf'
          ? req.body.source
          : uploadSession?.source,
      storageObjectRef: uploadSession?.storageObjectRef,
      documentHash: hash
    });
    currentReportId = record.id;
    await saveReportFile(record.id, reportOwner(owner), {
      mimeType: req.file.mimetype,
      fileName: record.fileName,
      fileSize: req.file.size,
      content: fileBuffer
    });
    const processingJob = await createProcessingJob({
      clientId: owner.clientId,
      reportId: record.id,
      jobType: 'report_analysis',
      status: 'queued'
    });
    currentJobId = processingJob.id;
    logReportRuntime('upload:start:created', {
      reportId: record.id,
      processingJobId: processingJob.id,
      status: record.status,
      clientScoped: Boolean(owner.clientId)
    });
    const manualDate = typeof req.body?.reportDate === 'string' ? req.body.reportDate.trim() : '';
    const manualLab = typeof req.body?.labName === 'string' ? req.body.labName.trim() : '';

    void analyzeAndPersistReport({
      owner,
      reportId: record.id,
      processingJobId: processingJob.id,
      fileName: record.fileName,
      fileBuffer,
      mimeType: req.file.mimetype,
      manualDate,
      manualLab
    }).catch(async (error) => {
      const message = error instanceof Error ? error.message : 'Unable to analyze this report file.';
      logReportRuntime('processing:failed', { reportId: record.id, processingJobId: processingJob.id, message });
      await updateReportStatus(record.id, 'FAILED', message);
      await updateProcessingJobStatus(processingJob.id, 'failed', message);
    });

    return res.status(202).json({
      reportId: record.id,
      processingJobId: processingJob.id,
      status: record.status,
      message: 'Report uploaded successfully. Processing health information...'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start report analysis.';
    if (currentReportId) {
      await updateReportStatus(currentReportId, 'FAILED', message);
    }
    if (currentJobId) {
      await updateProcessingJobStatus(currentJobId, 'failed', message);
    }
    return res.status(422).json({
      error: 'ANALYSIS_START_FAILED',
      message: sanitizeReportErrorForPublic(message)
    });
  }
});

reportsRouter.post('/analyze', upload.single('reportFile'), async (req, res) => {
  let currentReportId: string | null = null;
  let currentJobId: string | null = null;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'MISSING_FILE', message: 'Please upload a PDF or image report file.' });
    }

    const mime = req.file.mimetype.toLowerCase();
    if (!mime.includes('pdf') && !mime.includes('image')) {
      return res.status(415).json({ error: 'UNSUPPORTED_FILE', message: 'Only PDF and image reports are supported.' });
    }

    const owner = currentOwner(getAuthenticatedAccount(req));
    const hash = documentHash(req.file.buffer);
    const duplicate = await findActiveReportByDocumentHash(reportOwner(owner), hash);
    if (duplicate?.analysis) {
      logReportRuntime('upload:sync:duplicate', { reportId: duplicate.id, status: duplicate.status });
      return res.status(200).json({
        reportId: duplicate.id,
        status: duplicate.status,
        duplicate: true,
        biomarkerObservations: [],
        healthScores: [],
        ...sanitizeReportAnalysisForPublic(duplicate.analysis)
      });
    }
    if (duplicate && !duplicate.analysis) {
      return res.status(409).json({
        error: 'DUPLICATE_PROCESSING',
        message: 'This report is already being processed.',
        reportId: duplicate.id,
        status: duplicate.status
      });
    }
    const uploadId = typeof req.body?.uploadId === 'string' ? req.body.uploadId.trim() : '';
    const uploadSession = uploadId ? await getUploadSession(uploadId, reportOwner(owner)) : null;
    if (uploadId && !uploadSession) {
      return res.status(404).json({ error: 'UPLOAD_SESSION_NOT_FOUND', message: 'uploadId is invalid or expired.' });
    }

    const record = await createReportRecord({
      ...reportOwner(owner),
      fileName: req.file.originalname || `report-${Date.now()}`,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      reportDate: typeof req.body?.reportDate === 'string' ? req.body.reportDate.trim() : undefined,
      labName: typeof req.body?.labName === 'string' ? req.body.labName.trim() : undefined,
      source:
        req.body?.source === 'camera' || req.body?.source === 'gallery' || req.body?.source === 'pdf'
          ? req.body.source
          : uploadSession?.source,
      storageObjectRef: uploadSession?.storageObjectRef,
      documentHash: hash
    });
    currentReportId = record.id;
    await saveReportFile(record.id, reportOwner(owner), {
      mimeType: req.file.mimetype,
      fileName: record.fileName,
      fileSize: req.file.size,
      content: Buffer.from(req.file.buffer)
    });
    const processingJob = await createProcessingJob({
      clientId: owner.clientId,
      reportId: record.id,
      jobType: 'report_analysis',
      status: 'processing'
    });
    currentJobId = processingJob.id;
    const manualDate = typeof req.body?.reportDate === 'string' ? req.body.reportDate.trim() : '';
    const manualLab = typeof req.body?.labName === 'string' ? req.body.labName.trim() : '';
    const payload = await analyzeAndPersistReport({
      owner,
      reportId: record.id,
      processingJobId: processingJob.id,
      fileName: record.fileName,
      fileBuffer: req.file.buffer,
      mimeType: req.file.mimetype,
      manualDate,
      manualLab
    });
    return res.status(200).json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to analyze this report file.';
    if (currentReportId) {
      await updateReportStatus(currentReportId, 'FAILED', message);
    }
    if (currentJobId) {
      await updateProcessingJobStatus(currentJobId, 'failed', message);
    }
    return res.status(422).json({
      error: 'ANALYSIS_FAILED',
      message: sanitizeReportErrorForPublic(message)
    });
  }
});
