import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';

export type ProcessingJobStatus =
  | 'queued'
  | 'processing'
  | 'extraction_completed'
  | 'validation_pending'
  | 'completed'
  | 'failed'
  | 'review_required';

export type ProcessingJobRecord = {
  id: string;
  clientId: string;
  reportId: string | null;
  jobType: string;
  status: ProcessingJobStatus;
  error: string | null;
  createdAtISO: string;
  updatedAtISO: string;
};

const rowToJob = (row: Record<string, unknown>): ProcessingJobRecord => ({
  id: String(row.id),
  clientId: String(row.client_id),
  reportId: row.report_id == null ? null : String(row.report_id),
  jobType: String(row.job_type),
  status: String(row.status) as ProcessingJobStatus,
  error: row.error == null ? null : String(row.error),
  createdAtISO: new Date(String(row.created_at)).toISOString(),
  updatedAtISO: new Date(String(row.updated_at)).toISOString()
});

export const createProcessingJob = async (input: {
  clientId: string;
  reportId?: string | null;
  jobType: string;
  status?: ProcessingJobStatus;
}) => {
  const result = await pool.query(
    `
      insert into processing_jobs (id, client_id, report_id, job_type, status)
      values ($1, $2, $3, $4, $5)
      returning *
    `,
    [`job_${crypto.randomUUID()}`, input.clientId, input.reportId ?? null, input.jobType, input.status ?? 'queued']
  );
  return rowToJob(result.rows[0]);
};

export const updateProcessingJobStatus = async (jobId: string, status: ProcessingJobStatus, error?: string | null) => {
  const result = await pool.query(
    `
      update processing_jobs
      set status = $2, error = $3, updated_at = now()
      where id = $1
      returning *
    `,
    [jobId, status, error ?? null]
  );
  return result.rows[0] ? rowToJob(result.rows[0]) : null;
};
