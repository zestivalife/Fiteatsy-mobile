import { Router } from 'express';
import multer from 'multer';
import { analyzeReportBuffer } from './reports.service.js';
import { addFeedback, attachReportAnalysis, completeUploadSession, createReportRecord, createUploadSession, deleteReport, findActiveReportByDocumentHash, getReport, getUploadSession, listReports, updateReportMetadata, updateReportStatus } from './reports.store.js';
import { syncReportPipelineToPlatform } from '../platform/platform.service.js';
import { getAuthenticatedAccount, requireAuthenticatedAccount } from '../auth/auth.middleware.js';
import { createProcessingJob, updateProcessingJobStatus } from '../processing/processing-jobs.repository.js';
import { persistReportIntelligence } from './report-intelligence.pipeline.js';
import { documentHash } from './report-governance.js';
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 12 * 1024 * 1024 }
});
const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export const reportsRouter = Router();
const currentOwner = (account) => ({
    accountId: account.accountId,
    clientId: account.client.id
});
const reportOwner = (owner) => ({ userId: owner.accountId, clientId: owner.clientId });
const toReportDto = (record) => {
    if (!record)
        return null;
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
        document: record.analysis?.document,
        qualityGate: record.analysis?.qualityGate,
        healthAssessment: record.analysis?.healthAssessment,
        analysis: record.analysis,
        feedback: record.feedback
    };
};
const ownsReport = (record, owner) => Boolean(record && record.userId === owner.accountId && record.clientId === owner.clientId);
const logReportRuntime = (event, payload) => {
    console.log(`[ReportsRuntime] ${event}`, payload);
};
const analyzeAndPersistReport = async (input) => {
    logReportRuntime('processing:start', {
        reportId: input.reportId,
        processingJobId: input.processingJobId,
        mimeType: input.mimeType
    });
    await syncReportPipelineToPlatform(input.owner, input.reportId, 'uploaded', `Blood report uploaded: ${input.fileName}`);
    await updateReportStatus(input.reportId, 'PROCESSING');
    await updateProcessingJobStatus(input.processingJobId, 'processing');
    logReportRuntime('processing:status', { reportId: input.reportId, status: 'PROCESSING' });
    const analysis = await analyzeReportBuffer(input.fileBuffer, input.mimeType);
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
    if (input.manualDate)
        analysis.reportDate = input.manualDate;
    if (input.manualLab)
        analysis.labName = input.manualLab;
    await updateProcessingJobStatus(input.processingJobId, 'validation_pending');
    await updateReportStatus(input.reportId, 'VALIDATION_COMPLETED');
    logReportRuntime('processing:status', {
        reportId: input.reportId,
        status: 'VALIDATION_COMPLETED',
        validationConfidence: analysis.qualityGate.validationConfidence
    });
    const intelligence = await persistReportIntelligence(input.owner, input.reportId, analysis);
    await updateReportStatus(input.reportId, 'PRIORITIZATION_COMPLETED');
    logReportRuntime('processing:status', {
        reportId: input.reportId,
        status: 'PRIORITIZATION_COMPLETED',
        coreBiomarkers: analysis.qualityGate.coreBiomarkers
    });
    if (analysis.qualityGate.canScore) {
        await updateReportStatus(input.reportId, 'SCORE_GENERATED');
        logReportRuntime('processing:status', { reportId: input.reportId, status: 'SCORE_GENERATED' });
    }
    const saved = await attachReportAnalysis(input.reportId, analysis);
    await updateProcessingJobStatus(input.processingJobId, analysis.qualityGate.canPublish ? 'completed' : 'review_required', saved?.error);
    logReportRuntime('processing:debug-trace', {
        reportId: input.reportId,
        fileName: input.fileName,
        debugTrace: analysis.debugTrace
    });
    logReportRuntime('processing:completed', {
        reportId: input.reportId,
        status: saved?.status,
        observationCount: intelligence.observations.length,
        scoreCount: intelligence.scores.length,
        qualityGate: analysis.qualityGate.status
    });
    if (analysis.qualityGate.canPublish) {
        await syncReportPipelineToPlatform(input.owner, input.reportId, 'biomarkers_updated', `Biomarkers extracted from ${input.fileName}`);
        await syncReportPipelineToPlatform(input.owner, input.reportId, 'analysis_completed', `AI validation completed for ${input.fileName}`);
    }
    return {
        reportId: saved?.id,
        status: saved?.status,
        biomarkerObservations: intelligence.observations,
        healthScores: intelligence.scores.map((score) => ({
            scoreType: score.scoreType,
            scoreValue: score.scoreValue,
            scoreStatus: score.scoreStatus,
            confidence: score.confidence,
            calculatedAtISO: score.calculatedAtISO
        })),
        ...analysis
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
    const source = req.body?.source;
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
    if (!uploadId)
        return res.status(400).json({ error: 'MISSING_UPLOAD_ID', message: 'uploadId is required.' });
    const session = await completeUploadSession(uploadId, reportOwner(owner));
    if (!session)
        return res.status(404).json({ error: 'UPLOAD_SESSION_NOT_FOUND', message: 'Upload session not found or expired.' });
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
        reportId: report.id,
        status: report.status,
        hasError: Boolean(report.error)
    });
    return res.status(200).json({
        reportId: report.id,
        status: report.status,
        updatedAtISO: report.updatedAtISO,
        error: report.error,
        document: report.analysis?.document,
        qualityGate: report.analysis?.qualityGate,
        healthAssessment: report.analysis?.healthAssessment,
        processingTimeline: report.analysis?.extractionAttempts
    });
});
reportsRouter.patch('/:reportId/metadata', async (req, res) => {
    const owner = currentOwner(getAuthenticatedAccount(req));
    const report = await getReport(req.params.reportId);
    if (!ownsReport(report, owner)) {
        return res.status(404).json({ error: 'REPORT_NOT_FOUND', message: 'Report not found.' });
    }
    const patched = await updateReportMetadata(report.id, reportOwner(owner), {
        labName: typeof req.body?.labName === 'string' ? req.body.labName.trim() : undefined,
        reportDate: typeof req.body?.reportDate === 'string' ? req.body.reportDate.trim() : undefined,
        source: req.body?.source === 'camera' || req.body?.source === 'gallery' || req.body?.source === 'pdf'
            ? req.body.source
            : undefined
    });
    return res.status(200).json(toReportDto(patched));
});
reportsRouter.delete('/:reportId', async (req, res) => {
    const owner = currentOwner(getAuthenticatedAccount(req));
    const report = await getReport(req.params.reportId);
    if (!ownsReport(report, owner)) {
        return res.status(404).json({ error: 'REPORT_NOT_FOUND', message: 'Report not found.' });
    }
    await deleteReport(report.id, reportOwner(owner));
    return res.status(204).send();
});
reportsRouter.post('/:reportId/feedback', async (req, res) => {
    const owner = currentOwner(getAuthenticatedAccount(req));
    const report = await getReport(req.params.reportId);
    if (!ownsReport(report, owner)) {
        return res.status(404).json({ error: 'REPORT_NOT_FOUND', message: 'Report not found.' });
    }
    const note = String(req.body?.note || '').trim();
    if (!note)
        return res.status(400).json({ error: 'MISSING_NOTE', message: 'Feedback note is required.' });
    const feedback = await addFeedback(report.id, reportOwner(owner), {
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
    if (!current.analysis || !previous.analysis) {
        return res.status(409).json({ error: 'ANALYSIS_NOT_READY', message: 'Both reports must have completed analysis.' });
    }
    if (current.analysis.score == null || previous.analysis.score == null) {
        return res.status(409).json({ error: 'ANALYSIS_NOT_PUBLISHED', message: 'Both reports must pass the quality gate before comparison.' });
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
        summary: scoreDelta > 0
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
reportsRouter.post('/analyze/start', upload.single('reportFile'), async (req, res) => {
    let currentReportId = null;
    let currentJobId = null;
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
            source: req.body?.source === 'camera' || req.body?.source === 'gallery' || req.body?.source === 'pdf'
                ? req.body.source
                : uploadSession?.source,
            storageObjectRef: uploadSession?.storageObjectRef,
            documentHash: hash
        });
        currentReportId = record.id;
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
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to start report analysis.';
        if (currentReportId) {
            await updateReportStatus(currentReportId, 'FAILED', message);
        }
        if (currentJobId) {
            await updateProcessingJobStatus(currentJobId, 'failed', message);
        }
        return res.status(422).json({
            error: 'ANALYSIS_START_FAILED',
            message
        });
    }
});
reportsRouter.post('/analyze', upload.single('reportFile'), async (req, res) => {
    let currentReportId = null;
    let currentJobId = null;
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
                ...duplicate.analysis
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
            source: req.body?.source === 'camera' || req.body?.source === 'gallery' || req.body?.source === 'pdf'
                ? req.body.source
                : uploadSession?.source,
            storageObjectRef: uploadSession?.storageObjectRef,
            documentHash: hash
        });
        currentReportId = record.id;
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
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to analyze this report file.';
        if (currentReportId) {
            await updateReportStatus(currentReportId, 'FAILED', message);
        }
        if (currentJobId) {
            await updateProcessingJobStatus(currentJobId, 'failed', message);
        }
        return res.status(422).json({
            error: 'ANALYSIS_FAILED',
            message
        });
    }
});
