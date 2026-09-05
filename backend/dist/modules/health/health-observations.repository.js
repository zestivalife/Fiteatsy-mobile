import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
const rowToObservation = (row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    clientId: String(row.client_id),
    metricType: String(row.metric_type),
    value: Number(row.value),
    unit: String(row.unit),
    measuredAtISO: new Date(String(row.measured_at)).toISOString(),
    sourceProvider: String(row.source_provider),
    sourceRecordId: row.source_record_id == null ? null : String(row.source_record_id),
    syncKey: String(row.sync_key),
    qualityStatus: String(row.quality_status),
    createdAtISO: new Date(String(row.created_at)).toISOString(),
    sourceMetadata: row.source_metadata == null ? null : row.source_metadata
});
const buildSyncKey = (owner, observation) => observation.syncKey?.trim() ||
    [
        owner.clientId,
        observation.sourceProvider.trim().toLowerCase(),
        observation.sourceRecordId?.trim() || observation.metricType.trim().toLowerCase(),
        observation.measuredAtISO,
        observation.unit.trim().toLowerCase()
    ].join(':');
export const ingestHealthObservations = async (owner, observations) => {
    const accepted = [];
    const duplicate = [];
    const rejected = [];
    for (const observation of observations) {
        const measuredAt = new Date(observation.measuredAtISO);
        if (!Number.isFinite(observation.value) || Number.isNaN(measuredAt.getTime())) {
            rejected.push({ metricType: observation.metricType, reason: 'Invalid value or measuredAtISO.' });
            continue;
        }
        const id = `hobs_${crypto.randomUUID()}`;
        const syncKey = buildSyncKey(owner, observation);
        const result = await pool.query(`
        insert into health_observations (
          id, user_id, client_id, metric_type, value, unit, measured_at, source_provider,
          source_record_id, sync_key, quality_status, source_metadata
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        on conflict (client_id, sync_key) do nothing
        returning *
      `, [
            id,
            owner.accountId,
            owner.clientId,
            observation.metricType,
            observation.value,
            observation.unit,
            observation.measuredAtISO,
            observation.sourceProvider,
            observation.sourceRecordId ?? null,
            syncKey,
            observation.qualityStatus ?? 'accepted',
            observation.sourceMetadata ?? null
        ]);
        if (result.rows[0]) {
            accepted.push(rowToObservation(result.rows[0]));
        }
        else {
            duplicate.push({ syncKey, metricType: observation.metricType });
        }
    }
    return { accepted, duplicate, rejected };
};
export const listHealthObservations = async (owner, filters) => {
    const result = await pool.query(`
      select *
      from health_observations
      where user_id = $1
        and client_id = $2
        and ($3::text is null or metric_type = $3)
      order by measured_at desc, created_at desc
      limit $4 offset $5
    `, [owner.accountId, owner.clientId, filters.metricType ?? null, filters.limit, filters.offset]);
    return result.rows.map(rowToObservation);
};
export const countHealthObservations = async (owner, metricType) => {
    const result = await pool.query(`
      select count(*)::int as total
      from health_observations
      where user_id = $1
        and client_id = $2
        and ($3::text is null or metric_type = $3)
    `, [owner.accountId, owner.clientId, metricType ?? null]);
    return Number(result.rows[0]?.total ?? 0);
};
