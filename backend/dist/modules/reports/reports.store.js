import crypto from 'node:crypto';
const reports = new Map();
const uploads = new Map();
const nowIso = () => new Date().toISOString();
export const createUploadSession = (input) => {
    const id = `upl_${crypto.randomUUID()}`;
    const createdAtISO = nowIso();
    const expiresAtISO = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const session = {
        id,
        userId: input.userId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        createdAtISO,
        expiresAtISO,
        status: 'initialized',
        source: input.source
    };
    uploads.set(id, session);
    return session;
};
export const completeUploadSession = (uploadId) => {
    const session = uploads.get(uploadId);
    if (!session)
        return null;
    if (Date.now() > new Date(session.expiresAtISO).getTime()) {
        session.status = 'expired';
        return null;
    }
    session.status = 'completed';
    uploads.set(uploadId, session);
    return session;
};
export const getUploadSession = (uploadId) => uploads.get(uploadId) ?? null;
export const createReportRecord = (input) => {
    const id = `rep_${crypto.randomUUID()}`;
    const record = {
        id,
        userId: input.userId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        status: 'queued',
        createdAtISO: nowIso(),
        updatedAtISO: nowIso(),
        reportDate: input.reportDate,
        labName: input.labName,
        source: input.source,
        analysisVersion: 1,
        feedback: []
    };
    reports.set(id, record);
    return record;
};
export const updateReportStatus = (reportId, status, error) => {
    const record = reports.get(reportId);
    if (!record)
        return null;
    record.status = status;
    record.error = error;
    record.updatedAtISO = nowIso();
    reports.set(reportId, record);
    return record;
};
export const attachReportAnalysis = (reportId, analysis) => {
    const record = reports.get(reportId);
    if (!record)
        return null;
    record.analysis = analysis;
    record.reportDate = analysis.reportDate;
    record.labName = analysis.labName;
    record.status = 'done';
    record.error = undefined;
    record.updatedAtISO = nowIso();
    reports.set(reportId, record);
    return record;
};
export const getReport = (reportId) => reports.get(reportId) ?? null;
export const listReports = (userId) => {
    return Array.from(reports.values())
        .filter((record) => record.userId === userId)
        .sort((a, b) => (a.createdAtISO < b.createdAtISO ? 1 : -1));
};
export const deleteReport = (reportId) => reports.delete(reportId);
export const updateReportMetadata = (reportId, patch) => {
    const record = reports.get(reportId);
    if (!record)
        return null;
    if (patch.labName !== undefined)
        record.labName = patch.labName;
    if (patch.reportDate !== undefined)
        record.reportDate = patch.reportDate;
    if (patch.source !== undefined)
        record.source = patch.source;
    if (record.analysis) {
        if (patch.labName !== undefined)
            record.analysis.labName = patch.labName;
        if (patch.reportDate !== undefined)
            record.analysis.reportDate = patch.reportDate;
    }
    record.updatedAtISO = nowIso();
    reports.set(reportId, record);
    return record;
};
export const addFeedback = (reportId, feedback) => {
    const record = reports.get(reportId);
    if (!record)
        return null;
    const entry = {
        id: `fb_${crypto.randomUUID()}`,
        note: feedback.note,
        correctedLabName: feedback.correctedLabName,
        correctedReportDate: feedback.correctedReportDate,
        createdAtISO: nowIso()
    };
    record.feedback.unshift(entry);
    if (feedback.correctedLabName) {
        record.labName = feedback.correctedLabName;
        if (record.analysis)
            record.analysis.labName = feedback.correctedLabName;
    }
    if (feedback.correctedReportDate) {
        record.reportDate = feedback.correctedReportDate;
        if (record.analysis)
            record.analysis.reportDate = feedback.correctedReportDate;
    }
    record.updatedAtISO = nowIso();
    reports.set(reportId, record);
    return entry;
};
