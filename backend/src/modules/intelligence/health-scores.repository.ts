import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
import { ClientOwnershipContext } from '../platform/platform.types.js';

export type HealthScoreType =
  | 'energy_balance'
  | 'body_support'
  | 'nourishment'
  | 'recovery'
  | 'physical_wellness_index'
  | 'active_performance'
  | 'stress_resilience'
  | 'nutrition'
  | 'clinical'
  | 'activity'
  | 'sleep'
  | 'calm'
  | 'overall';
export type HealthScoreStatus = 'calculated' | 'insufficient_data';

export type HealthScoreRecord = {
  id: string;
  userId: string;
  clientId: string;
  scoreType: HealthScoreType;
  scoreValue: number | null;
  scoreStatus: HealthScoreStatus;
  confidence: number;
  inputSummary: Record<string, unknown>;
  calculatedAtISO: string;
  calculationVersion: string;
};

export type HealthScoreInput = {
  scoreType: HealthScoreType;
  scoreValue: number | null;
  scoreStatus: HealthScoreStatus;
  confidence: number;
  inputSummary: Record<string, unknown>;
  calculationVersion: string;
};

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const rowToScore = (row: Record<string, unknown>): HealthScoreRecord => ({
  id: String(row.id),
  userId: String(row.user_id),
  clientId: String(row.client_id),
  scoreType: String(row.score_type) as HealthScoreType,
  scoreValue: row.score_value == null ? null : Number(row.score_value),
  scoreStatus: String(row.score_status) as HealthScoreStatus,
  confidence: Number(row.confidence),
  inputSummary: toRecord(row.input_summary),
  calculatedAtISO: new Date(String(row.calculated_at)).toISOString(),
  calculationVersion: String(row.calculation_version)
});

export const createHealthScore = async (owner: ClientOwnershipContext, input: HealthScoreInput) => {
  const result = await pool.query(
    `
      insert into health_scores (
        id, user_id, client_id, score_type, score_value, score_status,
        confidence, input_summary, calculation_version
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
      returning *
    `,
    [
      `score_${crypto.randomUUID()}`,
      owner.accountId,
      owner.clientId,
      input.scoreType,
      input.scoreValue,
      input.scoreStatus,
      input.confidence,
      JSON.stringify(input.inputSummary),
      input.calculationVersion
    ]
  );
  return rowToScore(result.rows[0]);
};

export const createHealthScores = async (owner: ClientOwnershipContext, inputs: HealthScoreInput[]) => {
  const scores: HealthScoreRecord[] = [];
  for (const input of inputs) {
    scores.push(await createHealthScore(owner, input));
  }
  return scores;
};

export const clearHealthScoresForOwner = async (owner: ClientOwnershipContext) => {
  const result = await pool.query(
    `
      delete from health_scores
      where user_id = $1
        and client_id = $2
      returning id
    `,
    [owner.accountId, owner.clientId]
  );
  return result.rows.map((row) => String(row.id));
};

export const listLatestHealthScores = async (owner: ClientOwnershipContext) => {
  const result = await pool.query(
    `
      select distinct on (score_type) *
      from health_scores
      where user_id = $1
        and client_id = $2
      order by score_type, calculated_at desc
    `,
    [owner.accountId, owner.clientId]
  );
  return result.rows.map(rowToScore);
};

export const listHealthScoreHistory = async (
  owner: ClientOwnershipContext,
  filters: { scoreType?: HealthScoreType; limit: number; offset: number }
) => {
  const result = await pool.query(
    `
      select *
      from health_scores
      where user_id = $1
        and client_id = $2
        and ($3::text is null or score_type = $3)
      order by calculated_at desc
      limit $4 offset $5
    `,
    [owner.accountId, owner.clientId, filters.scoreType ?? null, filters.limit, filters.offset]
  );
  return result.rows.map(rowToScore);
};
