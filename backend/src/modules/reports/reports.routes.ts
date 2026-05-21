import { Router } from 'express';
import multer from 'multer';
import { analyzeReportBuffer } from './reports.service.js';
import {
  addFeedback,
  attachReportAnalysis,
  completeUploadSession,
  createReportRecord,
  createUploadSession,
  deleteReport,
  getReport,
  getUploadSession,
  listReports,
  updateReportMetadata,
  updateReportStatus
} from './reports.store.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }
});

export const reportsRouter = Router();

const getUserId = (req: any) =>
  String(req.header('x-user-id') || req.body?.userId || req.query?.userId || 'demo-user').trim();

const toReportDto = (record: ReturnType<typeof getReport>) => {
  if (!record) return null;
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
    error: record.error,
    analysisVersion: record.analysisVersion,
    analysis: record.analysis,
    feedback: record.feedback
  };
};

reportsRouter.get('/supported-formats', (_req, res) => {
  res.json({
    formats: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    maxUploadBytes: 12 * 1024 * 1024,
    recommendedImage: { maxWidth: 2000, minWidth: 1200, preferred: 'jpeg' }
  });
});

reportsRouter.post('/upload/init', (req, res) => {
  const userId = getUserId(req);
  const fileName = String(req.body?.fileName || '').trim();
  const mimeType = String(req.body?.mimeType || '').trim().toLowerCase();
  const fileSize = Number(req.body?.fileSize || 0);
  const source = req.body?.source as 'camera' | 'gallery' | 'pdf' | undefined;

  if (!fileName || !mimeType || !Number.isFinite(fileSize) || fileSize <= 0) {
    return res.status(400).json({ error: 'INVALID_UPLOAD_METADATA', message: 'fileName, mimeType, fileSize are required.' });
  }

  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(mimeType)) {
    return res.status(415).json({ error: 'UNSUPPORTED_FILE', message: 'Only PDF/JPEG/PNG/WebP reports are supported.' });
  }

  if (fileSize > 12 * 1024 * 1024) {
    return res.status(413).json({ error: 'FILE_TOO_LARGE', message: 'Max upload size is 12MB.' });
  }

  const session = createUploadSession({ userId, fileName, mimeType, fileSize, source });
  return res.status(201).json({ uploadId: session.id, expiresAtISO: session.expiresAtISO, status: session.status });
});

reportsRouter.post('/upload/complete', (req, res) => {
  const uploadId = String(req.body?.uploadId || '').trim();
  if (!uploadId) return res.status(400).json({ error: 'MISSING_UPLOAD_ID', message: 'uploadId is required.' });
  const session = completeUploadSession(uploadId);
  if (!session) return res.status(404).json({ error: 'UPLOAD_SESSION_NOT_FOUND', message: 'Upload session not found or expired.' });
  return res.status(200).json({ uploadId: session.id, status: session.status, expiresAtISO: session.expiresAtISO });
});

reportsRouter.get('/', (req, res) => {
  const userId = getUserId(req);
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const items = listReports(userId);
  const page = items.slice(offset, offset + limit).map(toReportDto);
  return res.status(200).json({ total: items.length, limit, offset, items: page });
});

reportsRouter.get('/:reportId', (req, res) => {
  const userId = getUserId(req);
  const report = getReport(req.params.reportId);
  if (!report || report.userId !== userId) {
    return res.status(404).json({ error: 'REPORT_NOT_FOUND', message: 'Report not found.' });
  }
  return res.status(200).json(toReportDto(report));
});

reportsRouter.get('/:reportId/status', (req, res) => {
  const userId = getUserId(req);
  const report = getReport(req.params.reportId);
  if (!report || report.userId !== userId) {
    return res.status(404).json({ error: 'REPORT_NOT_FOUND', message: 'Report not found.' });
  }
  return res.status(200).json({
    reportId: report.id,
    status: report.status,
    updatedAtISO: report.updatedAtISO,
    error: report.error
  });
});

reportsRouter.patch('/:reportId/metadata', (req, res) => {
  const userId = getUserId(req);
  const report = getReport(req.params.reportId);
  if (!report || report.userId !== userId) {
    return res.status(404).json({ error: 'REPORT_NOT_FOUND', message: 'Report not found.' });
  }
  const patched = updateReportMetadata(report.id, {
    labName: typeof req.body?.labName === 'string' ? req.body.labName.trim() : undefined,
    reportDate: typeof req.body?.reportDate === 'string' ? req.body.reportDate.trim() : undefined,
    source:
      req.body?.source === 'camera' || req.body?.source === 'gallery' || req.body?.source === 'pdf'
        ? req.body.source
        : undefined
  });
  return res.status(200).json(toReportDto(patched));
});

reportsRouter.delete('/:reportId', (req, res) => {
  const userId = getUserId(req);
  const report = getReport(req.params.reportId);
  if (!report || report.userId !== userId) {
    return res.status(404).json({ error: 'REPORT_NOT_FOUND', message: 'Report not found.' });
  }
  deleteReport(report.id);
  return res.status(204).send();
});

reportsRouter.post('/:reportId/feedback', (req, res) => {
  const userId = getUserId(req);
  const report = getReport(req.params.reportId);
  if (!report || report.userId !== userId) {
    return res.status(404).json({ error: 'REPORT_NOT_FOUND', message: 'Report not found.' });
  }
  const note = String(req.body?.note || '').trim();
  if (!note) return res.status(400).json({ error: 'MISSING_NOTE', message: 'Feedback note is required.' });
  const feedback = addFeedback(report.id, {
    note,
    correctedLabName: typeof req.body?.correctedLabName === 'string' ? req.body.correctedLabName.trim() : undefined,
    correctedReportDate: typeof req.body?.correctedReportDate === 'string' ? req.body.correctedReportDate.trim() : undefined
  });
  return res.status(201).json(feedback);
});

reportsRouter.post('/:reportId/reanalyze', (_req, res) => {
  return res.status(501).json({
    error: 'REANALYZE_NOT_AVAILABLE',
    message: 'Reanalyze requires persisted original file storage. This will be enabled when object storage is configured.'
  });
});

reportsRouter.get('/:reportId/comparison', (req, res) => {
  const userId = getUserId(req);
  const current = getReport(req.params.reportId);
  if (!current || current.userId !== userId) {
    return res.status(404).json({ error: 'REPORT_NOT_FOUND', message: 'Current report not found.' });
  }
  const previousReportId = String(req.query.previousReportId || '').trim();
  if (!previousReportId) {
    return res.status(400).json({ error: 'MISSING_PREVIOUS_REPORT_ID', message: 'previousReportId is required.' });
  }
  const previous = getReport(previousReportId);
  if (!previous || previous.userId !== userId) {
    return res.status(404).json({ error: 'PREVIOUS_REPORT_NOT_FOUND', message: 'Previous report not found.' });
  }
  if (!current.analysis || !previous.analysis) {
    return res.status(409).json({ error: 'ANALYSIS_NOT_READY', message: 'Both reports must have completed analysis.' });
  }

  const scoreDelta = current.analysis.score - previous.analysis.score;
  const currentAbnormal = current.analysis.parameters.filter((item) => item.status !== 'normal').length;
  const previousAbnormal = previous.analysis.parameters.filter((item) => item.status !== 'normal').length;
  const abnormalDelta = currentAbnormal - previousAbnormal;

  return res.status(200).json({
    currentReportId: current.id,
    previousReportId: previous.id,
    scoreDelta,
    abnormalDelta,
    summary:
      scoreDelta > 0
        ? `Recovery trend is improving by ${scoreDelta} points compared with the previous report.`
        : scoreDelta < 0
          ? `Recovery score dropped by ${Math.abs(scoreDelta)} points; review adherence and follow-up recommendations.`
          : 'Recovery score is unchanged; continue routine and monitor follow-up markers.',
    details: {
      currentScore: current.analysis.score,
      previousScore: previous.analysis.score,
      currentAbnormal,
      previousAbnormal
    }
  });
});

reportsRouter.post('/analyze', upload.single('reportFile'), async (req, res) => {
  let currentReportId: string | null = null;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'MISSING_FILE', message: 'Please upload a PDF or image report file.' });
    }

    const mime = req.file.mimetype.toLowerCase();
    if (!mime.includes('pdf') && !mime.includes('image')) {
      return res.status(415).json({ error: 'UNSUPPORTED_FILE', message: 'Only PDF and image reports are supported.' });
    }

    const userId = getUserId(req);
    const uploadId = typeof req.body?.uploadId === 'string' ? req.body.uploadId.trim() : '';
    if (uploadId && !getUploadSession(uploadId)) {
      return res.status(404).json({ error: 'UPLOAD_SESSION_NOT_FOUND', message: 'uploadId is invalid or expired.' });
    }

    const record = createReportRecord({
      userId,
      fileName: req.file.originalname || `report-${Date.now()}`,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      reportDate: typeof req.body?.reportDate === 'string' ? req.body.reportDate.trim() : undefined,
      labName: typeof req.body?.labName === 'string' ? req.body.labName.trim() : undefined,
      source:
        req.body?.source === 'camera' || req.body?.source === 'gallery' || req.body?.source === 'pdf'
          ? req.body.source
          : undefined
    });
    currentReportId = record.id;
    updateReportStatus(record.id, 'processing');
    const analysis = await analyzeReportBuffer(req.file.buffer, req.file.mimetype);
    const manualDate = typeof req.body?.reportDate === 'string' ? req.body.reportDate.trim() : '';
    const manualLab = typeof req.body?.labName === 'string' ? req.body.labName.trim() : '';
    if (manualDate) {
      analysis.reportDate = manualDate;
    }
    if (manualLab) {
      analysis.labName = manualLab;
    }
    const saved = attachReportAnalysis(record.id, analysis);
    return res.status(200).json({
      reportId: saved?.id,
      status: saved?.status,
      ...analysis
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to analyze this report file.';
    if (currentReportId) {
      updateReportStatus(currentReportId, 'failed', message);
    }
    return res.status(422).json({
      error: 'ANALYSIS_FAILED',
      message
    });
  }
});
