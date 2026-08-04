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
    sourceLocation: row.source_location == null ? null : String(row.source_location),
    referenceRange: row.reference_range == null ? null : String(row.reference_range),
    createdAtISO: new Date(String(row.created_at)).toISOString()
});
export const listBiomarkers = async () => {
    const result = await pool.query('select * from biomarkers order by canonical_name asc');
    return result.rows.map(rowToBiomarker);
};
export const upsertBiomarker = async (input) => {
    const id = `bio_${crypto.randomUUID()}`;
    const result = await pool.query(`
      insert into biomarkers (id, canonical_name, aliases, category, standard_unit)
      values ($1, $2, $3::jsonb, $4, $5)
      on conflict (canonical_name)
      do update set aliases = excluded.aliases, category = excluded.category, standard_unit = excluded.standard_unit, updated_at = now()
      returning *
    `, [id, input.canonicalName, JSON.stringify(input.aliases ?? []), input.category, input.standardUnit]);
    return rowToBiomarker(result.rows[0]);
};
export const createBiomarkerObservation = async (owner, input) => {
    const id = `bobs_${crypto.randomUUID()}`;
    const result = await pool.query(`
      with inserted as (
        insert into biomarker_observations (
          id, user_id, client_id, biomarker_id, source_report_id, value, unit, test_date,
          confidence, validation_status, source_location, reference_range
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        returning *
      )
      select inserted.*, b.canonical_name
      from inserted
      join biomarkers b on b.id = inserted.biomarker_id
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
        input.sourceLocation ?? null,
        input.referenceRange ?? null
    ]);
    return rowToObservation(result.rows[0]);
};
export const listBiomarkerHistory = async (owner, filters) => {
    const result = await pool.query(`
      select bo.*, b.canonical_name
      from biomarker_observations bo
      join biomarkers b on b.id = bo.biomarker_id
      where bo.user_id = $1
        and bo.client_id = $2
        and ($3::text is null or bo.biomarker_id = $3)
      order by bo.test_date desc, bo.created_at desc
      limit $4 offset $5
    `, [owner.accountId, owner.clientId, filters.biomarkerId ?? null, filters.limit, filters.offset]);
    return result.rows.map(rowToObservation);
};
export const countBiomarkerHistory = async (owner, biomarkerId) => {
    const result = await pool.query(`
      select count(*)::int as total
      from biomarker_observations
      where user_id = $1
        and client_id = $2
        and ($3::text is null or biomarker_id = $3)
    `, [owner.accountId, owner.clientId, biomarkerId ?? null]);
    return Number(result.rows[0]?.total ?? 0);
};
