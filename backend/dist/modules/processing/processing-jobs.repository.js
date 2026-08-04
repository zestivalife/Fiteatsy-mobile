import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
const rowToJob = (row) => ({
    id: String(row.id),
    clientId: String(row.client_id),
    reportId: row.report_id == null ? null : String(row.report_id),
    jobType: String(row.job_type),
    status: String(row.status),
    error: row.error == null ? null : String(row.error),
    createdAtISO: new Date(String(row.created_at)).toISOString(),
    updatedAtISO: new Date(String(row.updated_at)).toISOString()
});
export const createProcessingJob = async (input) => {
    const result = await pool.query(`
      insert into processing_jobs (id, client_id, report_id, job_type, status)
      values ($1, $2, $3, $4, $5)
      returning *
    `, [`job_${crypto.randomUUID()}`, input.clientId, input.reportId ?? null, input.jobType, input.status ?? 'queued']);
    return rowToJob(result.rows[0]);
};
export const updateProcessingJobStatus = async (jobId, status, error) => {
    const result = await pool.query(`
      update processing_jobs
      set status = $2, error = $3, updated_at = now()
      where id = $1
      returning *
    `, [jobId, status, error ?? null]);
    return result.rows[0] ? rowToJob(result.rows[0]) : null;
};
