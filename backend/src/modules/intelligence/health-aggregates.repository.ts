import crypto from 'node:crypto';
import { HEALTH_AGGREGATION_VERSION } from '@fiteatsy/health-intelligence';
import { pool } from '../../db/pool.js';
import type { ClientOwnershipContext } from '../platform/platform.types.js';
import type { DailyAggregate } from './health-aggregation-v1.js';

export const replaceDailyAggregates = async (owner: ClientOwnershipContext, rows: DailyAggregate[]) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `delete from daily_health_aggregates where user_id=$1 and client_id=$2 and calculation_version=$3`,
      [owner.accountId, owner.clientId, HEALTH_AGGREGATION_VERSION]
    );
    for (const row of rows) {
      await client.query(
        `insert into daily_health_aggregates(
          id,user_id,client_id,aggregate_date,metric_type,aggregation_method,value,unit,
          source_observation_ids,source_count,freshness,calculation_version,lineage_hash,aggregate_source
        ) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,'CANONICAL_RAW_RECOMPUTATION')`,
        [`hagg_${crypto.randomUUID()}`, owner.accountId, owner.clientId, row.date, row.metric, row.method,
          row.value, row.unit, JSON.stringify(row.observationIds), row.observationIds.length, row.freshness,
          HEALTH_AGGREGATION_VERSION, row.lineageHash]
      );
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
};

export const listDailyAggregates = async (owner: ClientOwnershipContext, days = 28) => {
  const result = await pool.query(
    `select aggregate_date::text as date,metric_type as metric,value::float8 as value,unit,
      aggregation_method as method,source_observation_ids as "observationIds",freshness,lineage_hash as "lineageHash"
     from daily_health_aggregates
     where user_id=$1 and client_id=$2 and aggregate_date>=current_date-$3::int and calculation_version=$4
     order by aggregate_date desc`,
    [owner.accountId, owner.clientId, days, HEALTH_AGGREGATION_VERSION]
  );
  return result.rows as DailyAggregate[];
};
