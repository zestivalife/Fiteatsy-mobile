import crypto from 'node:crypto';
import { ReportAnalysisResult } from './reports.service.js';

export type ReportStatus = 'queued' | 'processing' | 'done' | 'failed';

export type ReportRecord = {
  id: string;
  userId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: ReportStatus;
  createdAtISO: string;
  updatedAtISO: string;
  reportDate?: string;
  labName?: string;
  source?: 'camera' | 'gallery' | 'pdf';
  error?: string;
  analysis?: ReportAnalysisResult;
  analysisVersion: number;
  feedback: Array<{
    id: string;
    note: string;
    correctedLabName?: string;
    correctedReportDate?: string;
    createdAtISO: string;
  }>;
};

export type UploadSession = {
  id: string;
  userId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAtISO: string;
  expiresAtISO: string;
  status: 'initialized' | 'completed' | 'expired';
  source?: 'camera' | 'gallery' | 'pdf';
};

const reports = new Map<string, ReportRecord>();
const uploads = new Map<string, UploadSession>();

const nowIso = () => new Date().toISOString();

export const createUploadSession = (input: {
  userId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  source?: 'camera' | 'gallery' | 'pdf';
}) => {
  const id = `upl_${crypto.randomUUID()}`;
  const createdAtISO = nowIso();
  const expiresAtISO = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const session: UploadSession = {
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

export const completeUploadSession = (uploadId: string) => {
  const session = uploads.get(uploadId);
  if (!session) return null;
  if (Date.now() > new Date(session.expiresAtISO).getTime()) {
    session.status = 'expired';
    return null;
  }
  session.status = 'completed';
  uploads.set(uploadId, session);
  return session;
};

export const getUploadSession = (uploadId: string) => uploads.get(uploadId) ?? null;

export const createReportRecord = (input: {
  userId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  reportDate?: string;
  labName?: string;
  source?: 'camera' | 'gallery' | 'pdf';
}) => {
  const id = `rep_${crypto.randomUUID()}`;
  const record: ReportRecord = {
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

export const updateReportStatus = (reportId: string, status: ReportStatus, error?: string) => {
  const record = reports.get(reportId);
  if (!record) return null;
  record.status = status;
  record.error = error;
  record.updatedAtISO = nowIso();
  reports.set(reportId, record);
  return record;
};

export const attachReportAnalysis = (reportId: string, analysis: ReportAnalysisResult) => {
  const record = reports.get(reportId);
  if (!record) return null;
  record.analysis = analysis;
  record.reportDate = analysis.reportDate;
  record.labName = analysis.labName;
  record.status = 'done';
  record.error = undefined;
  record.updatedAtISO = nowIso();
  reports.set(reportId, record);
  return record;
};

export const getReport = (reportId: string) => reports.get(reportId) ?? null;

export const listReports = (userId: string) => {
  return Array.from(reports.values())
    .filter((record) => record.userId === userId)
    .sort((a, b) => (a.createdAtISO < b.createdAtISO ? 1 : -1));
};

export const deleteReport = (reportId: string) => reports.delete(reportId);

export const updateReportMetadata = (
  reportId: string,
  patch: Partial<Pick<ReportRecord, 'labName' | 'reportDate' | 'source'>>
) => {
  const record = reports.get(reportId);
  if (!record) return null;
  if (patch.labName !== undefined) record.labName = patch.labName;
  if (patch.reportDate !== undefined) record.reportDate = patch.reportDate;
  if (patch.source !== undefined) record.source = patch.source;
  if (record.analysis) {
    if (patch.labName !== undefined) record.analysis.labName = patch.labName;
    if (patch.reportDate !== undefined) record.analysis.reportDate = patch.reportDate;
  }
  record.updatedAtISO = nowIso();
  reports.set(reportId, record);
  return record;
};

export const addFeedback = (
  reportId: string,
  feedback: {
    note: string;
    correctedLabName?: string;
    correctedReportDate?: string;
  }
) => {
  const record = reports.get(reportId);
  if (!record) return null;
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
    if (record.analysis) record.analysis.labName = feedback.correctedLabName;
  }
  if (feedback.correctedReportDate) {
    record.reportDate = feedback.correctedReportDate;
    if (record.analysis) record.analysis.reportDate = feedback.correctedReportDate;
  }
  record.updatedAtISO = nowIso();
  reports.set(reportId, record);
  return entry;
};

