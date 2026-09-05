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
    documentHash: row.document_hash == null ? undefined : String(row.document_hash),
    deletedAtISO: row.deleted_at == null ? undefined : new Date(String(row.deleted_at)).toISOString(),
    deletedBy: row.deleted_by == null ? undefined : String(row.deleted_by),
    analysis: parseJson(row.analysis, undefined),
    analysisAttempts: parseJson(row.analysis_attempts, []),
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
const statusForAnalysis = (analysis) => analysis.qualityGate.canPublish
    ? analysis.qualityGate.status === 'PARTIALLY_VALIDATED'
        ? 'PARTIALLY_VALIDATED'
        : 'PUBLISHED'
    : analysis.qualityGate.status === 'INSUFFICIENT_DATA'
        ? 'INSUFFICIENT_DATA'
        : 'REVIEW_REQUIRED';
const analysisStatusRank = (analysis) => {
    if (analysis.qualityGate.status === 'PUBLISHABLE')
        return 4;
    if (analysis.qualityGate.status === 'PARTIALLY_VALIDATED')
        return 3;
    if (analysis.qualityGate.status === 'REVIEW_REQUIRED')
        return 2;
    return 1;
};
const compareAnalysisQuality = (candidate, current) => {
    if (!current)
        return 1;
    const candidateRejected = candidate.qualityGate.rejectedBiomarkers?.length ?? 0;
    const currentRejected = current.qualityGate.rejectedBiomarkers?.length ?? 0;
    const candidateConflicts = candidate.qualityGate.conflicts?.length ?? 0;
    const currentConflicts = current.qualityGate.conflicts?.length ?? 0;
    const candidateScore = [
        analysisStatusRank(candidate),
        candidate.qualityGate.validatedRequiredTier1Biomarkers ?? 0,
        candidate.qualityGate.validatedBiomarkers,
        candidate.parameters.length,
        -candidateRejected,
        -candidateConflicts,
        candidate.qualityGate.confidence,
        candidate.qualityGate.extractionConfidence
    ];
    const currentScore = [
        analysisStatusRank(current),
        current.qualityGate.validatedRequiredTier1Biomarkers ?? 0,
        current.qualityGate.validatedBiomarkers,
        current.parameters.length,
        -currentRejected,
        -currentConflicts,
        current.qualityGate.confidence,
        current.qualityGate.extractionConfidence
    ];
    for (let index = 0; index < candidateScore.length; index += 1) {
        if (candidateScore[index] > currentScore[index])
            return 1;
        if (candidateScore[index] < currentScore[index])
            return -1;
    }
    return 0;
};
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
        file_size, upload_source, processing_status, report_date, lab_name, document_hash
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'UPLOADED', $10, $11, $12)
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
        input.labName ?? null,
        input.documentHash ?? null
    ]);
    return rowToReport(result.rows[0]);
};
export const saveReportFile = async (reportId, owner, input) => {
    await pool.query(`
      insert into health_report_files (report_id, user_id, client_id, mime_type, original_filename, file_size, content)
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (report_id)
      do update set
        mime_type = excluded.mime_type,
        original_filename = excluded.original_filename,
        file_size = excluded.file_size,
        content = excluded.content,
        created_at = now()
    `, [reportId, owner.userId, owner.clientId, input.mimeType, input.fileName, input.fileSize, input.content]);
};
export const getReportFile = async (reportId, owner) => {
    const result = await pool.query(`
      select *
      from health_report_files
      where report_id = $1
        and user_id = $2
        and client_id = $3
    `, [reportId, owner.userId, owner.clientId]);
    const row = result.rows[0];
    if (!row)
        return null;
    return {
        reportId: String(row.report_id),
        userId: String(row.user_id),
        clientId: String(row.client_id),
        mimeType: String(row.mime_type),
        fileName: String(row.original_filename),
        fileSize: Number(row.file_size),
        content: Buffer.from(row.content)
    };
};
export const createDocumentIntelligenceAudit = async (input) => {
    const result = await pool.query(`
      insert into document_intelligence_audit (
        report_id, trigger_source, provider, model, user_id, client_id, cost_estimate
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      returning *
    `, [
        input.reportId,
        input.triggerSource,
        input.provider,
        input.model,
        input.userId,
        input.clientId,
        input.costEstimate ?? null
    ]);
    const row = result.rows[0];
    return {
        id: String(row.id),
        reportId: String(row.report_id),
        triggerSource: String(row.trigger_source),
        provider: String(row.provider),
        model: String(row.model),
        userId: String(row.user_id),
        clientId: String(row.client_id),
        costEstimate: row.cost_estimate == null ? undefined : Number(row.cost_estimate),
        createdAtISO: new Date(String(row.created_at)).toISOString()
    };
};
export const findActiveReportByDocumentHash = async (owner, hash) => {
    const result = await pool.query(`
      select *
      from health_reports
      where user_id = $1
        and client_id = $2
        and document_hash = $3
        and deleted_at is null
        and processing_status not in ('FAILED', 'REVIEW_REQUIRED', 'INSUFFICIENT_DATA')
      order by created_at desc
      limit 1
    `, [owner.userId, owner.clientId, hash]);
    return result.rows[0] ? rowToReport(result.rows[0]) : null;
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
export const attachReportAnalysis = async (reportId, analysis, analysisMode = 'standard', deferTerminalStatus = false) => {
    const current = await pool.query(`
      select analysis
      from health_reports
      where id = $1
        and deleted_at is null
    `, [reportId]);
    const currentAnalysis = parseJson(current.rows[0]?.analysis, undefined);
    const selectedAnalysis = compareAnalysisQuality(analysis, currentAnalysis) >= 0 ? analysis : currentAnalysis ?? analysis;
    const selectedStatus = statusForAnalysis(selectedAnalysis);
    const attemptStatus = statusForAnalysis(analysis);
    const result = await pool.query(`
      update health_reports
      set
        analysis = $2::jsonb,
        report_date = $3,
        lab_name = $4,
        processing_status = case when $20::boolean then processing_status else $5 end,
        error = $6,
        analysis_attempts = (
          case
            when $10::boolean then (
              select coalesce(
                jsonb_agg(
                  case
                    when jsonb_typeof(attempt.value) = 'object'
                      then jsonb_set(attempt.value, '{selected}', 'false'::jsonb, true)
                    else attempt.value
                  end
                ),
                '[]'::jsonb
              )
              from jsonb_array_elements(coalesce(health_reports.analysis_attempts, '[]'::jsonb)) as attempt(value)
            )
            else coalesce(health_reports.analysis_attempts, '[]'::jsonb)
          end
        ) || jsonb_build_array(
          jsonb_build_object(
            'id', $7::text,
            'analysisMode', $8::text,
            'status', $9::text,
            'selected', $10::boolean,
            'createdAtISO', to_jsonb(to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
            'summary', jsonb_build_object(
              'parameterCount', $11::int,
              'confidence', $12::numeric,
              'canPublish', $13::boolean,
              'qualityGateStatus', $14::text,
              'validatedBiomarkers', $15::int,
              'extractionConfidence', $16::numeric,
              'strategies', $17::jsonb,
              'reasons', $18::jsonb
            ),
            'analysis', $19::jsonb
          )
        ),
        updated_at = now()
      where id = $1
        and deleted_at is null
      returning *
    `, [
        reportId,
        JSON.stringify(selectedAnalysis),
        selectedAnalysis.reportDate,
        selectedAnalysis.labName,
        selectedStatus,
        selectedAnalysis.qualityGate.canPublish ? null : selectedAnalysis.qualityGate.reasons.join(' '),
        `attempt_${crypto.randomUUID()}`,
        analysisMode,
        attemptStatus,
        selectedAnalysis === analysis,
        analysis.parameters.length,
        analysis.qualityGate.confidence,
        analysis.qualityGate.canPublish,
        analysis.qualityGate.status,
        analysis.qualityGate.validatedBiomarkers,
        analysis.qualityGate.extractionConfidence,
        JSON.stringify(analysis.extractionAttempts.map((attempt) => attempt.strategy)),
        JSON.stringify(analysis.qualityGate.reasons),
        JSON.stringify(analysis),
        deferTerminalStatus
    ]);
    return result.rows[0]
        ? { ...rowToReport(result.rows[0]), selectedStatus }
        : null;
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
        and processing_status in ('PUBLISHED', 'PARTIALLY_VALIDATED')
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
        and processing_status in ('PUBLISHED', 'PARTIALLY_VALIDATED')
        and deleted_at is null
    `, [owner.userId, owner.clientId]);
    return Number(result.rows[0]?.total ?? 0);
};
export const deleteReport = async (reportId, owner) => {
    const result = await pool.query(`
      update health_reports
      set processing_status = 'DELETED', deleted_at = now(), deleted_by = $4, updated_at = now()
      where id = $1
        and user_id = $2
        and client_id = $3
        and deleted_at is null
      returning id
    `, [reportId, owner.userId, owner.clientId, owner.userId]);
    return Boolean(result.rows[0]);
};
export const deleteAllReports = async (owner) => {
    const result = await pool.query(`
      update health_reports
      set processing_status = 'DELETED', deleted_at = now(), deleted_by = $3, updated_at = now()
      where user_id = $1
        and client_id = $2
        and deleted_at is null
      returning id
    `, [owner.userId, owner.clientId, owner.userId]);
    return result.rows.map((row) => String(row.id));
};
export const purgeDeletedReportsPastRecoveryWindow = async (retentionDays = 30) => {
    const result = await pool.query(`
      with expired as (
        select id
        from health_reports
        where processing_status = 'DELETED'
          and deleted_at is not null
          and deleted_at < now() - ($1::int * interval '1 day')
      ),
      deleted_observations as (
        delete from biomarker_observations
        where source_report_id in (select id from expired)
        returning id
      ),
      deleted_reports as (
        delete from health_reports
        where id in (select id from expired)
        returning id
      )
      select
        (select count(*)::int from deleted_reports) as reports,
        (select count(*)::int from deleted_observations) as observations
    `, [retentionDays]);
    return {
        reports: Number(result.rows[0]?.reports ?? 0),
        observations: Number(result.rows[0]?.observations ?? 0)
    };
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
