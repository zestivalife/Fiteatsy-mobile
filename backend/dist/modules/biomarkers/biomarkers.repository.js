import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
const parseAliases = (value) => {
    if (Array.isArray(value))
        return value.map(String);
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed.map(String) : [];
        }
        catch {
            return [];
        }
    }
    return [];
};
const resolveBiomarkerTenantId = async (owner) => {
    const result = await pool.query(`select client.tenant_id, client.account_user_id
       from fiteatsy_clients client
      where client.id = $1 and client.deleted_at is null
      limit 1`, [owner.clientId]);
    const client = result.rows[0];
    if (!client || client.account_user_id !== owner.accountId)
        throw new Error('TENANT_RESOURCE_MISMATCH');
    if (client.tenant_id)
        return client.tenant_id;
    const membership = await pool.query(`select membership.tenant_id
       from tenant_memberships membership
       join tenants tenant on tenant.id = membership.tenant_id
      where membership.user_id = $1
        and membership.status = 'active'
        and tenant.status = 'active'
      order by (tenant.tenant_type = 'ZESTIVA_INTERNAL') desc, membership.joined_at asc
      limit 1`, [owner.accountId]);
    const tenantId = membership.rows[0]?.tenant_id;
    if (!tenantId)
        throw new Error('TENANT_CONTEXT_REQUIRED');
    return tenantId;
};
const rowToBiomarker = (row) => ({
    id: String(row.id),
    canonicalName: String(row.canonical_name),
    aliases: parseAliases(row.aliases),
    category: String(row.category),
    standardUnit: String(row.standard_unit)
});
const rowToObservation = (row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    clientId: String(row.client_id),
    biomarkerId: String(row.biomarker_id),
    biomarkerName: String(row.canonical_name),
    sourceReportId: row.source_report_id == null ? null : String(row.source_report_id),
    value: Number(row.value),
    unit: String(row.unit),
    testDate: new Date(String(row.test_date)).toISOString().slice(0, 10),
    confidence: Number(row.confidence),
    validationStatus: String(row.validation_status),
    originalParameterName: row.original_parameter_name == null ? null : String(row.original_parameter_name),
    sourceLocation: row.source_location == null ? null : String(row.source_location),
    referenceRange: row.reference_range == null ? null : String(row.reference_range),
    createdAtISO: new Date(String(row.created_at)).toISOString()
});
export const listBiomarkers = async (owner) => {
    const tenantId = await resolveBiomarkerTenantId(owner);
    const result = await pool.query('select * from biomarkers where tenant_id = $1 order by canonical_name asc', [tenantId]);
    return result.rows.map(rowToBiomarker);
};
export const upsertBiomarker = async (owner, input) => {
    const tenantId = await resolveBiomarkerTenantId(owner);
    const id = `bio_${crypto.randomUUID()}`;
    const result = await pool.query(`
      insert into biomarkers (id, canonical_name, aliases, category, standard_unit, tenant_id)
      values ($1, $2, $3::jsonb, $4, $5, $6)
      on conflict (tenant_id, canonical_name)
      do update set aliases = excluded.aliases, category = excluded.category, standard_unit = excluded.standard_unit, updated_at = now()
      returning *
    `, [id, input.canonicalName, JSON.stringify(input.aliases ?? []), input.category, input.standardUnit, tenantId]);
    return rowToBiomarker(result.rows[0]);
};
export const createBiomarkerObservation = async (owner, input) => {
    const tenantId = await resolveBiomarkerTenantId(owner);
    const id = `bobs_${crypto.randomUUID()}`;
    const result = await pool.query(`
      with inserted as (
        insert into biomarker_observations (
          id, user_id, client_id, biomarker_id, source_report_id, value, unit, test_date,
          confidence, validation_status, original_parameter_name, source_location, reference_range, tenant_id
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        returning *
      )
      select inserted.*, b.canonical_name
      from inserted
      join biomarkers b on b.id = inserted.biomarker_id and b.tenant_id = inserted.tenant_id
    `, [
        id,
        owner.accountId,
        owner.clientId,
        input.biomarkerId,
        input.sourceReportId ?? null,
        input.value,
        input.unit,
        input.testDate,
        input.confidence,
        input.validationStatus ?? 'pending',
        input.originalParameterName ?? null,
        input.sourceLocation ?? null,
        input.referenceRange ?? null,
        tenantId
    ]);
    return rowToObservation(result.rows[0]);
};
export const deleteBiomarkerObservationsForReport = async (owner, reportId) => {
    const result = await pool.query(`
      delete from biomarker_observations
      where user_id = $1
        and client_id = $2
        and source_report_id = $3
      returning id
    `, [owner.accountId, owner.clientId, reportId]);
    return result.rows.map((row) => String(row.id));
};
export const listBiomarkerHistory = async (owner, filters) => {
    const result = await pool.query(`
      select bo.*, b.canonical_name
      from biomarker_observations bo
      join biomarkers b on b.id = bo.biomarker_id
      left join health_reports hr on hr.id = bo.source_report_id
      where bo.user_id = $1
        and bo.client_id = $2
        and ($3::text is null or bo.biomarker_id = $3)
        and (bo.source_report_id is null or (hr.deleted_at is null and hr.processing_status <> 'DELETED'))
      order by bo.test_date desc, bo.created_at desc
      limit $4 offset $5
    `, [owner.accountId, owner.clientId, filters.biomarkerId ?? null, filters.limit, filters.offset]);
    return result.rows.map(rowToObservation);
};
export const countBiomarkerHistory = async (owner, biomarkerId) => {
    const result = await pool.query(`
      select count(*)::int as total
      from biomarker_observations bo
      left join health_reports hr on hr.id = bo.source_report_id
      where bo.user_id = $1
        and bo.client_id = $2
        and ($3::text is null or bo.biomarker_id = $3)
        and (bo.source_report_id is null or (hr.deleted_at is null and hr.processing_status <> 'DELETED'))
    `, [owner.accountId, owner.clientId, biomarkerId ?? null]);
    return Number(result.rows[0]?.total ?? 0);
};
