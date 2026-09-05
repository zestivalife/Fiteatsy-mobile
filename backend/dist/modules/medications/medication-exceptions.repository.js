import { randomUUID } from 'node:crypto';
import { pool } from '../../db/pool.js';
const toIso = (value) => new Date(String(value)).toISOString();
const mapException = (row) => ({
    id: String(row.id),
    clientId: String(row.client_id),
    userId: String(row.user_id),
    type: String(row.exception_type),
    severity: String(row.severity),
    status: String(row.status),
    ruleVersion: String(row.rule_version),
    title: String(row.title),
    summary: String(row.summary),
    evidence: (row.evidence ?? {}),
    evidenceFingerprint: String(row.evidence_fingerprint),
    detectedAt: toIso(row.detected_at),
    acknowledgedAt: row.acknowledged_at == null ? null : toIso(row.acknowledged_at),
    acknowledgedByUserId: row.acknowledged_by_user_id == null ? null : String(row.acknowledged_by_user_id),
    resolvedAt: row.resolved_at == null ? null : toIso(row.resolved_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
});
export const listActiveMedicationExceptionsForOwner = async (owner) => {
    const result = await pool.query(`
      select *
      from client_medication_exceptions
      where client_id = $1
        and user_id = $2
        and deleted_at is null
        and status in ('OPEN', 'ACKNOWLEDGED')
      order by detected_at desc, exception_type asc
    `, [owner.clientId, owner.accountId]);
    return result.rows.map((row) => mapException(row));
};
export const listMedicationExceptionsForOwner = async (owner) => {
    const result = await pool.query(`
      select *
      from client_medication_exceptions
      where client_id = $1
        and user_id = $2
        and deleted_at is null
      order by
        case status when 'OPEN' then 0 when 'ACKNOWLEDGED' then 1 else 2 end,
        detected_at desc,
        exception_type asc
    `, [owner.clientId, owner.accountId]);
    return result.rows.map((row) => mapException(row));
};
export const getMedicationExceptionById = async (exceptionId) => {
    const result = await pool.query(`
      select *
      from client_medication_exceptions
      where id = $1
        and deleted_at is null
      limit 1
    `, [exceptionId]);
    return result.rows[0] ? mapException(result.rows[0]) : null;
};
export const upsertActiveMedicationException = async (input) => {
    const existing = await pool.query(`
      select *
      from client_medication_exceptions
      where client_id = $1
        and user_id = $2
        and exception_type = $3
        and rule_version = $4
        and status in ('OPEN', 'ACKNOWLEDGED')
        and deleted_at is null
      limit 1
    `, [input.clientId, input.userId, input.type, input.ruleVersion]);
    if (existing.rows[0]) {
        const status = String(existing.rows[0].status) === 'ACKNOWLEDGED' ? 'ACKNOWLEDGED' : 'OPEN';
        const result = await pool.query(`
        update client_medication_exceptions
        set severity = $2,
            title = $3,
            summary = $4,
            evidence = $5::jsonb,
            evidence_fingerprint = $6,
            detected_at = least(detected_at, $7::timestamptz),
            status = $8,
            resolved_at = null,
            updated_at = now()
        where id = $1
        returning *
      `, [
            existing.rows[0].id,
            input.severity,
            input.title,
            input.summary,
            JSON.stringify(input.evidence),
            input.evidenceFingerprint,
            input.detectedAt,
            status
        ]);
        return mapException(result.rows[0]);
    }
    const result = await pool.query(`
      insert into client_medication_exceptions (
        id, client_id, user_id, exception_type, severity, status, rule_version,
        title, summary, evidence, evidence_fingerprint, detected_at,
        created_at, updated_at, deleted_at
      ) values (
        $1, $2, $3, $4, $5, 'OPEN', $6,
        $7, $8, $9::jsonb, $10, $11,
        now(), now(), null
      )
      returning *
    `, [
        randomUUID(),
        input.clientId,
        input.userId,
        input.type,
        input.severity,
        input.ruleVersion,
        input.title,
        input.summary,
        JSON.stringify(input.evidence),
        input.evidenceFingerprint,
        input.detectedAt
    ]);
    return mapException(result.rows[0]);
};
export const resolveInactiveMedicationExceptions = async (owner, activeTypes, ruleVersion) => {
    const result = await pool.query(`
      update client_medication_exceptions
      set status = 'RESOLVED',
          resolved_at = now(),
          updated_at = now()
      where client_id = $1
        and user_id = $2
        and rule_version = $3
        and status in ('OPEN', 'ACKNOWLEDGED')
        and deleted_at is null
        and not (exception_type = any($4::text[]))
      returning *
    `, [owner.clientId, owner.accountId, ruleVersion, activeTypes]);
    return result.rows.map((row) => mapException(row));
};
export const acknowledgeMedicationException = async (exceptionId, acknowledgedByUserId) => {
    const result = await pool.query(`
      update client_medication_exceptions
      set status = 'ACKNOWLEDGED',
          acknowledged_at = coalesce(acknowledged_at, now()),
          acknowledged_by_user_id = coalesce(acknowledged_by_user_id, $2),
          updated_at = now()
      where id = $1
        and status = 'OPEN'
        and deleted_at is null
      returning *
    `, [exceptionId, acknowledgedByUserId]);
    if (result.rows[0])
        return mapException(result.rows[0]);
    return getMedicationExceptionById(exceptionId);
};
