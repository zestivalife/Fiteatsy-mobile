import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
const toRecord = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    return value;
};
const rowToScore = (row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    clientId: String(row.client_id),
    scoreType: String(row.score_type),
    scoreValue: row.score_value == null ? null : Number(row.score_value),
    scoreStatus: String(row.score_status),
    confidence: Number(row.confidence),
    inputSummary: toRecord(row.input_summary),
    calculatedAtISO: new Date(String(row.calculated_at)).toISOString(),
    calculationVersion: String(row.calculation_version)
});
export const createHealthScore = async (owner, input) => {
    const result = await pool.query(`
      insert into health_scores (
        id, user_id, client_id, score_type, score_value, score_status,
        confidence, input_summary, calculation_version
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
      returning *
    `, [
        `score_${crypto.randomUUID()}`,
        owner.accountId,
        owner.clientId,
        input.scoreType,
        input.scoreValue,
        input.scoreStatus,
        input.confidence,
        JSON.stringify(input.inputSummary),
        input.calculationVersion
    ]);
    return rowToScore(result.rows[0]);
};
export const createHealthScores = async (owner, inputs) => {
    const scores = [];
    for (const input of inputs) {
        scores.push(await createHealthScore(owner, input));
    }
    return scores;
};
export const listLatestHealthScores = async (owner) => {
    const result = await pool.query(`
      select distinct on (score_type) *
      from health_scores
      where user_id = $1
        and client_id = $2
      order by score_type, calculated_at desc
    `, [owner.accountId, owner.clientId]);
    return result.rows.map(rowToScore);
};
export const listHealthScoreHistory = async (owner, filters) => {
    const result = await pool.query(`
      select *
      from health_scores
      where user_id = $1
        and client_id = $2
        and ($3::text is null or score_type = $3)
      order by calculated_at desc
      limit $4 offset $5
    `, [owner.accountId, owner.clientId, filters.scoreType ?? null, filters.limit, filters.offset]);
    return result.rows.map(rowToScore);
};
