import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
const nowIso = () => new Date().toISOString();
const parseJson = (value, fallback) => {
    if (value == null)
        return fallback;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        }
        catch {
            return fallback;
        }
    }
    return value;
};
const rowToReport = (row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    clientId: String(row.client_id),
    reportType: String(row.report_type),
    storageObjectRef: String(row.storage_object_ref),
    fileName: String(row.original_filename),
    mimeType: String(row.mime_type),
    fileSize: Number(row.file_size),
    status: String(row.processing_status),
    createdAtISO: new Date(String(row.created_at)).toISOString(),
    updatedAtISO: new Date(String(row.updated_at)).toISOString(),
    reportDate: row.report_date == null ? undefined : String(row.report_date),
    labName: row.lab_name == null ? undefined : String(row.lab_name),
    source: row.upload_source === 'camera' || row.upload_source === 'gallery' || row.upload_source === 'pdf'
        ? row.upload_source
        : undefined,
    error: row.error == null ? undefined : String(row.error),
    analysis: parseJson(row.analysis, undefined),
    analysisVersion: Number(row.analysis_version),
    feedback: parseJson(row.feedback, [])
});
const rowToUploadSession = (row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    clientId: String(row.client_id),
    fileName: String(row.file_name),
    mimeType: String(row.mime_type),
    fileSize: Number(row.file_size),
    createdAtISO: new Date(String(row.created_at)).toISOString(),
    expiresAtISO: new Date(String(row.expires_at)).toISOString(),
    status: String(row.status),
    source: row.upload_source === 'camera' || row.upload_source === 'gallery' || row.upload_source === 'pdf'
        ? row.upload_source
        : undefined,
    storageObjectRef: String(row.storage_object_ref)
});
export const createUploadSession = async (input) => {
    const id = `upl_${crypto.randomUUID()}`;
    const storageObjectRef = `pending-report://${input.clientId}/${id}/${encodeURIComponent(input.fileName)}`;
    const result = await pool.query(`
      insert into health_report_upload_sessions (
        id, user_id, client_id, file_name, mime_type, file_size, upload_source, storage_object_ref, expires_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, now() + interval '15 minutes')
      returning *
    `, [id, input.userId, input.clientId, input.fileName, input.mimeType, input.fileSize, input.source ?? null, storageObjectRef]);
    return rowToUploadSession(result.rows[0]);
};
export const completeUploadSession = async (uploadId, owner) => {
    const result = await pool.query(`
      update health_report_upload_sessions
      set
        status = case when expires_at < now() then 'expired' else 'completed' end,
        completed_at = case when expires_at < now() then completed_at else now() end
      where id = $1
        and user_id = $2
        and client_id = $3
      returning *
    `, [uploadId, owner.userId, owner.clientId]);
    if (!result.rows[0])
        return null;
    const session = rowToUploadSession(result.rows[0]);
    return session.status === 'expired' ? null : session;
};
export const getUploadSession = async (uploadId, owner) => {
    const result = await pool.query(`
      select *
      from health_report_upload_sessions
      where id = $1
        and ($2::text is null or user_id = $2)
        and ($3::text is null or client_id = $3)
        and status <> 'expired'
        and expires_at >= now()
    `, [uploadId, owner?.userId ?? null, owner?.clientId ?? null]);
    return result.rows[0] ? rowToUploadSession(result.rows[0]) : null;
};
export const createReportRecord = async (input) => {
    const id = `rep_${crypto.randomUUID()}`;
    const result = await pool.query(`
      insert into health_reports (
        id, user_id, client_id, report_type, storage_object_ref, original_filename, mime_type,
        file_size, upload_source, processing_status, report_date, lab_name
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'UPLOADED', $10, $11)
      returning *
    `, [
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
        input.labName ?? null
    ]);
    return rowToReport(result.rows[0]);
};
export const updateReportStatus = async (reportId, status, error) => {
    const result = await pool.query(`
      update health_reports
      set processing_status = $2, error = $3, updated_at = now()
      where id = $1
        and deleted_at is null
      returning *
    `, [reportId, status, error ?? null]);
    return result.rows[0] ? rowToReport(result.rows[0]) : null;
};
export const attachReportAnalysis = async (reportId, analysis) => {
    const result = await pool.query(`
      update health_reports
      set
        analysis = $2::jsonb,
        report_date = $3,
        lab_name = $4,
        processing_status = 'COMPLETED',
        error = null,
        updated_at = now()
      where id = $1
        and deleted_at is null
      returning *
    `, [reportId, JSON.stringify(analysis), analysis.reportDate, analysis.labName]);
    return result.rows[0] ? rowToReport(result.rows[0]) : null;
};
export const getReport = async (reportId) => {
    const result = await pool.query(`
      select *
      from health_reports
      where id = $1
        and deleted_at is null
    `, [reportId]);
    return result.rows[0] ? rowToReport(result.rows[0]) : null;
};
export const listReports = async (owner) => {
    const result = await pool.query(`
      select *
      from health_reports
      where user_id = $1
        and client_id = $2
        and deleted_at is null
      order by created_at desc
    `, [owner.userId, owner.clientId]);
    return result.rows.map(rowToReport);
};
export const countReports = async (owner) => {
    const result = await pool.query(`
      select count(*)::int as total
      from health_reports
      where user_id = $1
        and client_id = $2
        and deleted_at is null
    `, [owner.userId, owner.clientId]);
    return Number(result.rows[0]?.total ?? 0);
};
export const deleteReport = async (reportId, owner) => {
    const result = await pool.query(`
      update health_reports
      set deleted_at = now(), updated_at = now()
      where id = $1
        and user_id = $2
        and client_id = $3
        and deleted_at is null
      returning id
    `, [reportId, owner.userId, owner.clientId]);
    return Boolean(result.rows[0]);
};
export const updateReportMetadata = async (reportId, owner, patch) => {
    const current = await getReport(reportId);
    if (!current || current.userId !== owner.userId || current.clientId !== owner.clientId)
        return null;
    const nextAnalysis = current.analysis
        ? {
            ...current.analysis,
            labName: patch.labName ?? current.analysis.labName,
            reportDate: patch.reportDate ?? current.analysis.reportDate
        }
        : null;
    const result = await pool.query(`
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
    `, [
        reportId,
        owner.userId,
        owner.clientId,
        patch.labName ?? null,
        patch.reportDate ?? null,
        patch.source ?? null,
        nextAnalysis ? JSON.stringify(nextAnalysis) : null
    ]);
    return result.rows[0] ? rowToReport(result.rows[0]) : null;
};
export const addFeedback = async (reportId, owner, feedback) => {
    const current = await getReport(reportId);
    if (!current || current.userId !== owner.userId || current.clientId !== owner.clientId)
        return null;
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
    await pool.query(`
      update health_reports
      set feedback = $4::jsonb, updated_at = now()
      where id = $1
        and user_id = $2
        and client_id = $3
    `, [reportId, owner.userId, owner.clientId, JSON.stringify(nextFeedback)]);
    return entry;
};
export const resetReportsStoreForTests = async () => {
    await pool.query('truncate table processing_jobs, biomarker_observations, biomarkers, health_reports, health_report_upload_sessions, health_observations restart identity cascade');
};
