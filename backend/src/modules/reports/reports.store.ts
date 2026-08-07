import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
import { ReportAnalysisResult } from './reports.service.js';

export type ReportStatus =
  | 'UPLOADED'
  | 'PROCESSING'
  | 'DOCUMENT_ANALYSIS_COMPLETED'
  | 'EXTRACTION_COMPLETED'
  | 'VALIDATION_COMPLETED'
  | 'PRIORITIZATION_COMPLETED'
  | 'SCORE_GENERATED'
  | 'EXTRACTED'
  | 'VALIDATION_PENDING'
  | 'VALIDATED'
  | 'PRIORITIZED'
  | 'SCORED'
  | 'PUBLISHED'
  | 'FAILED'
  | 'REVIEW_REQUIRED'
  | 'INSUFFICIENT_DATA'
  // Backward-compatible status retained for already-deployed records.
  | 'COMPLETED';

export type ReportRecord = {
  id: string;
  userId: string;
  clientId: string;
  reportType: string;
  storageObjectRef: string;
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
  documentHash?: string;
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
  clientId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAtISO: string;
  expiresAtISO: string;
  status: 'initialized' | 'completed' | 'expired';
  source?: 'camera' | 'gallery' | 'pdf';
  storageObjectRef: string;
};

const nowIso = () => new Date().toISOString();

const parseJson = <T>(value: unknown, fallback: T): T => {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
};

const rowToReport = (row: Record<string, unknown>): ReportRecord => ({
  id: String(row.id),
  userId: String(row.user_id),
  clientId: String(row.client_id),
  reportType: String(row.report_type),
  storageObjectRef: String(row.storage_object_ref),
  fileName: String(row.original_filename),
  mimeType: String(row.mime_type),
  fileSize: Number(row.file_size),
  status: String(row.processing_status) as ReportStatus,
  createdAtISO: new Date(String(row.created_at)).toISOString(),
  updatedAtISO: new Date(String(row.updated_at)).toISOString(),
  reportDate: row.report_date == null ? undefined : String(row.report_date),
  labName: row.lab_name == null ? undefined : String(row.lab_name),
  source:
    row.upload_source === 'camera' || row.upload_source === 'gallery' || row.upload_source === 'pdf'
      ? row.upload_source
      : undefined,
  error: row.error == null ? undefined : String(row.error),
  documentHash: row.document_hash == null ? undefined : String(row.document_hash),
  analysis: parseJson<ReportAnalysisResult | undefined>(row.analysis, undefined),
  analysisVersion: Number(row.analysis_version),
  feedback: parseJson<ReportRecord['feedback']>(row.feedback, [])
});

const rowToUploadSession = (row: Record<string, unknown>): UploadSession => ({
  id: String(row.id),
  userId: String(row.user_id),
  clientId: String(row.client_id),
  fileName: String(row.file_name),
  mimeType: String(row.mime_type),
  fileSize: Number(row.file_size),
  createdAtISO: new Date(String(row.created_at)).toISOString(),
  expiresAtISO: new Date(String(row.expires_at)).toISOString(),
  status: String(row.status) as UploadSession['status'],
  source:
    row.upload_source === 'camera' || row.upload_source === 'gallery' || row.upload_source === 'pdf'
      ? row.upload_source
      : undefined,
  storageObjectRef: String(row.storage_object_ref)
});

export const createUploadSession = async (input: {
  userId: string;
  clientId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  source?: 'camera' | 'gallery' | 'pdf';
}) => {
  const id = `upl_${crypto.randomUUID()}`;
  const storageObjectRef = `pending-report://${input.clientId}/${id}/${encodeURIComponent(input.fileName)}`;
  const result = await pool.query(
    `
      insert into health_report_upload_sessions (
        id, user_id, client_id, file_name, mime_type, file_size, upload_source, storage_object_ref, expires_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, now() + interval '15 minutes')
      returning *
    `,
    [id, input.userId, input.clientId, input.fileName, input.mimeType, input.fileSize, input.source ?? null, storageObjectRef]
  );
  return rowToUploadSession(result.rows[0]);
};

export const completeUploadSession = async (uploadId: string, owner: { userId: string; clientId: string }) => {
  const result = await pool.query(
    `
      update health_report_upload_sessions
      set
        status = case when expires_at < now() then 'expired' else 'completed' end,
        completed_at = case when expires_at < now() then completed_at else now() end
      where id = $1
        and user_id = $2
        and client_id = $3
      returning *
    `,
    [uploadId, owner.userId, owner.clientId]
  );
  if (!result.rows[0]) return null;
  const session = rowToUploadSession(result.rows[0]);
  return session.status === 'expired' ? null : session;
};

export const getUploadSession = async (uploadId: string, owner?: { userId: string; clientId: string }) => {
  const result = await pool.query(
    `
      select *
      from health_report_upload_sessions
      where id = $1
        and ($2::text is null or user_id = $2)
        and ($3::text is null or client_id = $3)
        and status <> 'expired'
        and expires_at >= now()
    `,
    [uploadId, owner?.userId ?? null, owner?.clientId ?? null]
  );
  return result.rows[0] ? rowToUploadSession(result.rows[0]) : null;
};

export const createReportRecord = async (input: {
  userId: string;
  clientId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  reportDate?: string;
  labName?: string;
  source?: 'camera' | 'gallery' | 'pdf';
  storageObjectRef?: string;
  reportType?: string;
  documentHash?: string;
}) => {
  const id = `rep_${crypto.randomUUID()}`;
  const result = await pool.query(
    `
      insert into health_reports (
        id, user_id, client_id, report_type, storage_object_ref, original_filename, mime_type,
        file_size, upload_source, processing_status, report_date, lab_name, document_hash
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'UPLOADED', $10, $11, $12)
      returning *
    `,
    [
      id,
      input.userId,
      input.clientId,
      input.reportType ?? 'medical_report',
      input.storageObjectRef ?? `report://${input.clientId}/${id}/${encodeURIComponent(input.fileName)}`,
      input.fileName,
      input.mimeType,
      input.fileSize,
      input.source ?? null,
      input.reportDate ?? null,
      input.labName ?? null,
      input.documentHash ?? null
    ]
  );
  return rowToReport(result.rows[0]);
};

export const findActiveReportByDocumentHash = async (owner: { userId: string; clientId: string }, hash: string) => {
  const result = await pool.query(
    `
      select *
      from health_reports
      where user_id = $1
        and client_id = $2
        and document_hash = $3
        and deleted_at is null
        and processing_status not in ('FAILED', 'REVIEW_REQUIRED', 'INSUFFICIENT_DATA')
      order by created_at desc
      limit 1
    `,
    [owner.userId, owner.clientId, hash]
  );
  return result.rows[0] ? rowToReport(result.rows[0]) : null;
};

export const updateReportStatus = async (reportId: string, status: ReportStatus, error?: string) => {
  const result = await pool.query(
    `
      update health_reports
      set processing_status = $2, error = $3, updated_at = now()
      where id = $1
        and deleted_at is null
      returning *
    `,
    [reportId, status, error ?? null]
  );
  return result.rows[0] ? rowToReport(result.rows[0]) : null;
};

export const attachReportAnalysis = async (reportId: string, analysis: ReportAnalysisResult) => {
  const nextStatus: ReportStatus = analysis.qualityGate.canPublish
    ? 'PUBLISHED'
    : analysis.qualityGate.status === 'INSUFFICIENT_DATA'
      ? 'INSUFFICIENT_DATA'
      : 'REVIEW_REQUIRED';
  const result = await pool.query(
    `
      update health_reports
      set
        analysis = $2::jsonb,
        report_date = $3,
        lab_name = $4,
        processing_status = $5,
        error = $6,
        updated_at = now()
      where id = $1
        and deleted_at is null
      returning *
    `,
    [
      reportId,
      JSON.stringify(analysis),
      analysis.reportDate,
      analysis.labName,
      nextStatus,
      analysis.qualityGate.canPublish ? null : analysis.qualityGate.reasons.join(' ')
    ]
  );
  return result.rows[0] ? rowToReport(result.rows[0]) : null;
};

export const getReport = async (reportId: string) => {
  const result = await pool.query(
    `
      select *
      from health_reports
      where id = $1
        and deleted_at is null
    `,
    [reportId]
  );
  return result.rows[0] ? rowToReport(result.rows[0]) : null;
};

export const listReports = async (owner: { userId: string; clientId: string }) => {
  const result = await pool.query(
    `
      select *
      from health_reports
      where user_id = $1
        and client_id = $2
        and processing_status = 'PUBLISHED'
        and deleted_at is null
      order by created_at desc
    `,
    [owner.userId, owner.clientId]
  );
  return result.rows.map(rowToReport);
};

export const countReports = async (owner: { userId: string; clientId: string }) => {
  const result = await pool.query(
    `
      select count(*)::int as total
      from health_reports
      where user_id = $1
        and client_id = $2
        and processing_status = 'PUBLISHED'
        and deleted_at is null
    `,
    [owner.userId, owner.clientId]
  );
  return Number(result.rows[0]?.total ?? 0);
};

export const deleteReport = async (reportId: string, owner: { userId: string; clientId: string }) => {
  const result = await pool.query(
    `
      update health_reports
      set deleted_at = now(), updated_at = now()
      where id = $1
        and user_id = $2
        and client_id = $3
        and deleted_at is null
      returning id
    `,
    [reportId, owner.userId, owner.clientId]
  );
  return Boolean(result.rows[0]);
};

export const updateReportMetadata = async (
  reportId: string,
  owner: { userId: string; clientId: string },
  patch: Partial<Pick<ReportRecord, 'labName' | 'reportDate' | 'source'>>
) => {
  const current = await getReport(reportId);
  if (!current || current.userId !== owner.userId || current.clientId !== owner.clientId) return null;

  const nextAnalysis = current.analysis
    ? {
        ...current.analysis,
        labName: patch.labName ?? current.analysis.labName,
        reportDate: patch.reportDate ?? current.analysis.reportDate
      }
    : null;

  const result = await pool.query(
    `
      update health_reports
      set
        lab_name = coalesce($4, lab_name),
        report_date = coalesce($5, report_date),
        upload_source = coalesce($6, upload_source),
        analysis = coalesce($7::jsonb, analysis),
        updated_at = now()
      where id = $1
        and user_id = $2
        and client_id = $3
        and deleted_at is null
      returning *
    `,
    [
      reportId,
      owner.userId,
      owner.clientId,
      patch.labName ?? null,
      patch.reportDate ?? null,
      patch.source ?? null,
      nextAnalysis ? JSON.stringify(nextAnalysis) : null
    ]
  );
  return result.rows[0] ? rowToReport(result.rows[0]) : null;
};

export const addFeedback = async (
  reportId: string,
  owner: { userId: string; clientId: string },
  feedback: {
    note: string;
    correctedLabName?: string;
    correctedReportDate?: string;
  }
) => {
  const current = await getReport(reportId);
  if (!current || current.userId !== owner.userId || current.clientId !== owner.clientId) return null;
  const entry = {
    id: `fb_${crypto.randomUUID()}`,
    note: feedback.note,
    correctedLabName: feedback.correctedLabName,
    correctedReportDate: feedback.correctedReportDate,
    createdAtISO: nowIso()
  };
  const nextFeedback = [entry, ...current.feedback];
  await updateReportMetadata(reportId, owner, {
    labName: feedback.correctedLabName,
    reportDate: feedback.correctedReportDate
  });
  await pool.query(
    `
      update health_reports
      set feedback = $4::jsonb, updated_at = now()
      where id = $1
        and user_id = $2
        and client_id = $3
    `,
    [reportId, owner.userId, owner.clientId, JSON.stringify(nextFeedback)]
  );
  return entry;
};

export const resetReportsStoreForTests = async () => {
  await pool.query('truncate table processing_jobs, biomarker_observations, biomarkers, health_reports, health_report_upload_sessions, health_observations restart identity cascade');
};
