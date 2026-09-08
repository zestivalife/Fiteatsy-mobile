import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
import { ClientOwnershipContext } from '../platform/platform.types.js';

export type HealthObservationInput = {
  metricType: string;
  value: number;
  unit: string;
  measuredAtISO: string;
  sourceProvider: string;
  sourceRecordId?: string | null;
  syncKey?: string | null;
  qualityStatus?: 'accepted' | 'estimated';
  sourceMetadata?: Record<string, unknown> | null;
  startAtISO?: string | null;
  endAtISO?: string | null;
  timezoneOffsetMinutes?: number | null;
  providerUpdatedAtISO?: string | null;
  providerVersion?: string | null;
  deleted?: boolean;
};

export type HealthObservationRecord = {
  id: string;
  userId: string;
  clientId: string;
  metricType: string;
  value: number;
  unit: string;
  measuredAtISO: string;
  sourceProvider: string;
  sourceRecordId: string | null;
  syncKey: string;
  qualityStatus: string;
  createdAtISO: string;
  sourceMetadata: Record<string, unknown> | null;
  startAtISO: string | null;
  endAtISO: string | null;
  timezoneOffsetMinutes: number | null;
  providerUpdatedAtISO: string | null;
  providerVersion: string | null;
  deletedAtISO: string | null;
};

const rowToObservation = (row: Record<string, unknown>): HealthObservationRecord => ({
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
  sourceMetadata: row.source_metadata == null ? null : row.source_metadata as Record<string, unknown>
  ,startAtISO: row.start_at == null ? null : new Date(String(row.start_at)).toISOString()
  ,endAtISO: row.end_at == null ? null : new Date(String(row.end_at)).toISOString()
  ,timezoneOffsetMinutes: row.timezone_offset_minutes == null ? null : Number(row.timezone_offset_minutes)
  ,providerUpdatedAtISO: row.provider_updated_at == null ? null : new Date(String(row.provider_updated_at)).toISOString()
  ,providerVersion: row.provider_version == null ? null : String(row.provider_version)
  ,deletedAtISO: row.deleted_at == null ? null : new Date(String(row.deleted_at)).toISOString()
});

const buildSyncKey = (owner: ClientOwnershipContext, observation: HealthObservationInput) =>
  observation.syncKey?.trim() ||
  [
    owner.clientId,
    observation.sourceProvider.trim().toLowerCase(),
    observation.sourceRecordId?.trim() || observation.metricType.trim().toLowerCase(),
    observation.measuredAtISO,
    observation.unit.trim().toLowerCase()
  ].join(':');

export const ingestHealthObservations = async (owner: ClientOwnershipContext, observations: HealthObservationInput[]) => {
  const accepted: HealthObservationRecord[] = [];
  const duplicate: Array<{ syncKey: string; metricType: string }> = [];
  const rejected: Array<{ metricType: string; reason: string }> = [];

  let updated = 0;
  let deleted = 0;
  for (const observation of observations) {
    const measuredAt = new Date(observation.measuredAtISO);
    if (!Number.isFinite(observation.value) || Number.isNaN(measuredAt.getTime())) {
      rejected.push({ metricType: observation.metricType, reason: 'Invalid value or measuredAtISO.' });
      continue;
    }

    const id = `hobs_${crypto.randomUUID()}`;
    const syncKey = buildSyncKey(owner, observation);
    const contentHash = crypto.createHash('sha256').update(JSON.stringify({
      metricType: observation.metricType,
      value: observation.value,
      unit: observation.unit,
      measuredAtISO: observation.measuredAtISO,
      startAtISO: observation.startAtISO ?? null,
      endAtISO: observation.endAtISO ?? null,
      timezoneOffsetMinutes: observation.timezoneOffsetMinutes ?? null,
      providerUpdatedAtISO: observation.providerUpdatedAtISO ?? null,
      providerVersion: observation.providerVersion ?? null,
      qualityStatus: observation.qualityStatus ?? 'accepted',
      sourceMetadata: observation.sourceMetadata ?? null,
      deleted: observation.deleted ?? false
    })).digest('hex');
    const providerWideDeletion = observation.deleted && observation.metricType === 'provider_record_deletion';
    const existing = observation.sourceRecordId ? await pool.query(
      `select * from health_observations where client_id=$1 and source_provider=$2 and source_record_id=$3
       and ($4::boolean or metric_type=$5) and deleted_at is null limit 1`,
      [owner.clientId, observation.sourceProvider, observation.sourceRecordId, providerWideDeletion, observation.metricType]
    ) : { rows: [] };
    if (existing.rows[0]) {
      if (observation.deleted) {
        await pool.query(`update health_observations set deleted_at=now(),provider_updated_at=$1,provider_version=$2,
          source_metadata=coalesce($3,source_metadata) where id=$4`, [observation.providerUpdatedAtISO ?? null,
          observation.providerVersion ?? null,observation.sourceMetadata ?? null,existing.rows[0].id]);
        deleted += 1;
      } else if (existing.rows[0].content_hash !== contentHash) {
        const result = await pool.query(`update health_observations set value=$1,unit=$2,measured_at=$3,start_at=$4,end_at=$5,
          timezone_offset_minutes=$6,provider_updated_at=$7,provider_version=$8,content_hash=$9,
          quality_status=$10,source_metadata=$11 where id=$12 returning *`,
          [observation.value,observation.unit,observation.measuredAtISO,observation.startAtISO ?? null,
            observation.endAtISO ?? null,observation.timezoneOffsetMinutes ?? null,observation.providerUpdatedAtISO ?? null,
            observation.providerVersion ?? null,contentHash,observation.qualityStatus ?? 'accepted',
            observation.sourceMetadata ?? null,existing.rows[0].id]);
        accepted.push(rowToObservation(result.rows[0])); updated += 1;
      } else duplicate.push({ syncKey, metricType: observation.metricType });
      continue;
    }
    if (observation.deleted) { duplicate.push({ syncKey, metricType: observation.metricType }); continue; }
    const result = await pool.query(
      `
        insert into health_observations (
          id, user_id, client_id, metric_type, value, unit, measured_at, source_provider,
          source_record_id, sync_key, quality_status, source_metadata,start_at,end_at,timezone_offset_minutes,
          provider_updated_at,provider_version,content_hash
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        on conflict (client_id, sync_key) do nothing
        returning *
      `,
      [
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
        observation.sourceMetadata ?? null,observation.startAtISO ?? null,observation.endAtISO ?? null,
        observation.timezoneOffsetMinutes ?? null,observation.providerUpdatedAtISO ?? null,
        observation.providerVersion ?? null,contentHash
      ]
    );

    if (result.rows[0]) {
      accepted.push(rowToObservation(result.rows[0]));
    } else {
      duplicate.push({ syncKey, metricType: observation.metricType });
    }
  }

  return { accepted, duplicate, rejected, updated, deleted };
};

export const listHealthObservations = async (
  owner: ClientOwnershipContext,
  filters: { metricType?: string; limit: number; offset: number }
) => {
  const result = await pool.query(
    `
      select *
      from health_observations
      where user_id = $1
        and client_id = $2
        and deleted_at is null
        and ($3::text is null or metric_type = $3)
      order by measured_at desc, created_at desc
      limit $4 offset $5
    `,
    [owner.accountId, owner.clientId, filters.metricType ?? null, filters.limit, filters.offset]
  );
  return result.rows.map(rowToObservation);
};

export const countHealthObservations = async (owner: ClientOwnershipContext, metricType?: string) => {
  const result = await pool.query(
    `
      select count(*)::int as total
      from health_observations
      where user_id = $1
        and client_id = $2
        and deleted_at is null
        and ($3::text is null or metric_type = $3)
    `,
    [owner.accountId, owner.clientId, metricType ?? null]
  );
  return Number(result.rows[0]?.total ?? 0);
};
