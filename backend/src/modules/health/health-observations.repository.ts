import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
import { ClientOwnershipContext } from '../platform/platform.types.js';
import { resolveTrustedTenantForClientWrite } from '../tenancy/tenant-write-authority.js';

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
  const tenantId = await resolveTrustedTenantForClientWrite(owner, 'health_observation_ingest');
  const accepted: HealthObservationRecord[] = [];
  const duplicate: Array<{ syncKey: string; metricType: string }> = [];
  const rejected: Array<{ metricType: string; reason: string }> = [];

  let updated = 0;
  let deleted = 0;
  const client = await pool.connect();
  try {
    await client.query('begin');
    // One client-scoped transaction prevents concurrent retries/corrections from
    // racing between identity lookup and mutation while allowing other clients
    // to ingest independently.
    await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`health-observations:${owner.clientId}`]);
    const prepared = observations.map((observation) => ({ observation, syncKey: buildSyncKey(owner, observation) }));
    const existingResult = prepared.length ? await client.query(
      `select * from health_observations where client_id=$1 and sync_key=any($2::text[])`,
      [owner.clientId, prepared.map((item) => item.syncKey)]
    ) : { rows: [] };
    const existingBySyncKey = new Map(existingResult.rows.map((row) => [String(row.sync_key), row]));
    const isStale = (row: Record<string, unknown>, observation: HealthObservationInput) => {
      const currentTime = row.provider_updated_at == null ? null : Date.parse(String(row.provider_updated_at));
      const incomingTime = observation.providerUpdatedAtISO == null ? null : Date.parse(observation.providerUpdatedAtISO);
      if (currentTime != null && incomingTime != null && incomingTime < currentTime) return true;
      const currentVersion = row.provider_version == null ? null : Number(row.provider_version);
      const incomingVersion = observation.providerVersion == null ? null : Number(observation.providerVersion);
      return currentVersion != null && incomingVersion != null && Number.isFinite(currentVersion)
        && Number.isFinite(incomingVersion) && incomingVersion < currentVersion;
    };
    for (const { observation, syncKey } of prepared) {
    const measuredAt = new Date(observation.measuredAtISO);
    if (!Number.isFinite(observation.value) || Number.isNaN(measuredAt.getTime())) {
      rejected.push({ metricType: observation.metricType, reason: 'Invalid value or measuredAtISO.' });
      continue;
    }

    const id = `hobs_${crypto.randomUUID()}`;
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
    if (providerWideDeletion && observation.sourceRecordId) {
      const result = await client.query(
        `update health_observations set deleted_at=now(),provider_updated_at=$1,provider_version=$2,
         source_metadata=coalesce($3,source_metadata)
         where client_id=$4 and source_provider=$5 and source_record_id=$6 and deleted_at is null
         returning id`,
        [observation.providerUpdatedAtISO ?? null, observation.providerVersion ?? null,
          observation.sourceMetadata ?? null, owner.clientId, observation.sourceProvider, observation.sourceRecordId]
      );
      if (result.rowCount) deleted += result.rowCount;
      else duplicate.push({ syncKey, metricType: observation.metricType });
      continue;
    }
    const existing = existingBySyncKey.get(syncKey);
    if (existing) {
      if (isStale(existing, observation)) {
        duplicate.push({ syncKey, metricType: observation.metricType });
        continue;
      }
      if (observation.deleted) {
        if (existing.deleted_at != null) { duplicate.push({ syncKey, metricType: observation.metricType }); continue; }
        await client.query(`update health_observations set deleted_at=now(),provider_updated_at=$1,provider_version=$2,
          source_metadata=coalesce($3,source_metadata) where id=$4`, [observation.providerUpdatedAtISO ?? null,
          observation.providerVersion ?? null,observation.sourceMetadata ?? null,existing.id]);
        deleted += 1;
      } else if (existing.deleted_at != null) {
        // A provider deletion is authoritative. Only a strictly newer provider
        // timestamp/version may resurrect the same provider identity.
        const existingTime = existing.provider_updated_at == null ? null : Date.parse(String(existing.provider_updated_at));
        const incomingTime = observation.providerUpdatedAtISO == null ? null : Date.parse(observation.providerUpdatedAtISO);
        const existingVersion = existing.provider_version == null ? null : Number(existing.provider_version);
        const incomingVersion = observation.providerVersion == null ? null : Number(observation.providerVersion);
        const newer = existingTime != null && incomingTime != null && incomingTime > existingTime
          || Number.isFinite(existingVersion) && Number.isFinite(incomingVersion) && Number(incomingVersion) > Number(existingVersion);
        if (!newer) { duplicate.push({ syncKey, metricType: observation.metricType }); continue; }
        const result = await client.query(`update health_observations set value=$1,unit=$2,measured_at=$3,start_at=$4,end_at=$5,
          timezone_offset_minutes=$6,provider_updated_at=$7,provider_version=$8,content_hash=$9,
          quality_status=$10,source_metadata=$11,deleted_at=null where id=$12 returning *`,
          [observation.value,observation.unit,observation.measuredAtISO,observation.startAtISO ?? null,
            observation.endAtISO ?? null,observation.timezoneOffsetMinutes ?? null,observation.providerUpdatedAtISO ?? null,
            observation.providerVersion ?? null,contentHash,observation.qualityStatus ?? 'accepted',
            observation.sourceMetadata ?? null,existing.id]);
        accepted.push(rowToObservation(result.rows[0])); updated += 1;
      } else if (existing.content_hash !== contentHash) {
        const result = await client.query(`update health_observations set value=$1,unit=$2,measured_at=$3,start_at=$4,end_at=$5,
          timezone_offset_minutes=$6,provider_updated_at=$7,provider_version=$8,content_hash=$9,
          quality_status=$10,source_metadata=$11 where id=$12 returning *`,
          [observation.value,observation.unit,observation.measuredAtISO,observation.startAtISO ?? null,
            observation.endAtISO ?? null,observation.timezoneOffsetMinutes ?? null,observation.providerUpdatedAtISO ?? null,
            observation.providerVersion ?? null,contentHash,observation.qualityStatus ?? 'accepted',
            observation.sourceMetadata ?? null,existing.id]);
        accepted.push(rowToObservation(result.rows[0])); updated += 1;
      } else duplicate.push({ syncKey, metricType: observation.metricType });
      continue;
    }
    if (observation.deleted) { duplicate.push({ syncKey, metricType: observation.metricType }); continue; }
    const result = await client.query(
      `
        insert into health_observations (
          id, user_id, client_id, metric_type, value, unit, measured_at, source_provider,
          source_record_id, sync_key, quality_status, source_metadata,start_at,end_at,timezone_offset_minutes,
          provider_updated_at,provider_version,content_hash,tenant_id
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
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
        observation.providerVersion ?? null,contentHash,tenantId
      ]
    );

    if (result.rows[0]) {
      accepted.push(rowToObservation(result.rows[0]));
      existingBySyncKey.set(syncKey, result.rows[0]);
    } else {
      duplicate.push({ syncKey, metricType: observation.metricType });
    }
    }
    await client.query('commit');
    return { accepted, duplicate, rejected, updated, deleted };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
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

/** Complete calculation input. UI pagination limits must never truncate score inputs. */
export const listHealthObservationsForCalculation = async (owner: ClientOwnershipContext) => {
  const result = await pool.query(
    `select * from health_observations
     where user_id=$1 and client_id=$2 and deleted_at is null
     order by measured_at desc, created_at desc`,
    [owner.accountId, owner.clientId]
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
