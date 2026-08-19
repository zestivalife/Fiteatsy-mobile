import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import type { ClientOwnershipContext } from '../platform/platform.types.js';
import {
  ASSESSMENT_TYPE_PSS10,
  AssessmentResponseInput,
  getPss10Interpretation,
  PSS10_INSTRUMENT_VERSION,
  PSS10_INTERPRETATION_VERSION,
  PSS10_SCORING_VERSION
} from './assessment-definitions.js';
import { scorePss10 } from './assessment-scoring.js';

export type AssessmentSessionRecord = {
  id: string;
  assessmentType: string;
  instrumentVersion: string;
  scoringVersion: string;
  status: 'DRAFT' | 'COMPLETED' | 'ABANDONED';
  startedAtISO: string;
  completedAtISO: string | null;
  responses: AssessmentResponseInput[];
};

export type AssessmentResultRecord = {
  id: string;
  sessionId: string;
  assessmentType: string;
  instrumentVersion: string;
  scoringVersion: string;
  rawScore: number;
  maxScore: number;
  completedAtISO: string;
  interpretationVersion: string;
  interpretationKey: 'LOW' | 'MODERATE' | 'HIGH';
  interpretationLabel: 'Low stress' | 'Moderate stress' | 'High perceived stress';
};

const rowToSession = (row: Record<string, unknown>, responses: AssessmentResponseInput[] = []): AssessmentSessionRecord => ({
  id: String(row.id),
  assessmentType: String(row.assessment_type),
  instrumentVersion: String(row.instrument_version),
  scoringVersion: String(row.scoring_version),
  status: String(row.status) as AssessmentSessionRecord['status'],
  startedAtISO: new Date(String(row.started_at)).toISOString(),
  completedAtISO: row.completed_at == null ? null : new Date(String(row.completed_at)).toISOString(),
  responses
});

const rowToResult = (row: Record<string, unknown>): AssessmentResultRecord => ({
  id: String(row.id),
  sessionId: String(row.session_id),
  assessmentType: String(row.assessment_type),
  instrumentVersion: String(row.instrument_version),
  scoringVersion: String(row.scoring_version),
  rawScore: Number(row.raw_score),
  maxScore: Number(row.max_score),
  completedAtISO: new Date(String(row.completed_at)).toISOString(),
  interpretationVersion: String(row.interpretation_version ?? PSS10_INTERPRETATION_VERSION),
  interpretationKey: getPss10Interpretation(Number(row.raw_score)).key,
  interpretationLabel: getPss10Interpretation(Number(row.raw_score)).label
});

const listResponsesForSession = async (sessionId: string, client: PoolClient | typeof pool = pool) => {
  const result = await client.query(
    `
      select item_id, selected_value
      from assessment_responses
      where session_id = $1
      order by item_id asc
    `,
    [sessionId]
  );
  return result.rows.map((row) => ({
    itemId: String(row.item_id),
    selectedValue: Number(row.selected_value)
  }));
};

export const createAssessmentSession = async (owner: ClientOwnershipContext): Promise<AssessmentSessionRecord> => {
  const result = await pool.query(
    `
      insert into assessment_sessions (
        id, user_id, client_id, assessment_type, instrument_version, scoring_version, status
      )
      values ($1, $2, $3, $4, $5, $6, 'DRAFT')
      returning *
    `,
    [randomUUID(), owner.accountId, owner.clientId, ASSESSMENT_TYPE_PSS10, PSS10_INSTRUMENT_VERSION, PSS10_SCORING_VERSION]
  );
  return rowToSession(result.rows[0]);
};

export const getAssessmentSession = async (
  owner: ClientOwnershipContext,
  sessionId: string
): Promise<AssessmentSessionRecord | null> => {
  const result = await pool.query(
    `
      select *
      from assessment_sessions
      where id = $1
        and user_id = $2
        and client_id = $3
        and deleted_at is null
    `,
    [sessionId, owner.accountId, owner.clientId]
  );
  if (!result.rows[0]) return null;
  const responses = await listResponsesForSession(sessionId);
  return rowToSession(result.rows[0], responses);
};

export const getLatestDraftSession = async (owner: ClientOwnershipContext): Promise<AssessmentSessionRecord | null> => {
  const result = await pool.query(
    `
      select *
      from assessment_sessions
      where user_id = $1
        and client_id = $2
        and assessment_type = $3
        and status = 'DRAFT'
        and deleted_at is null
      order by started_at desc, created_at desc
      limit 1
    `,
    [owner.accountId, owner.clientId, ASSESSMENT_TYPE_PSS10]
  );
  if (!result.rows[0]) return null;
  const responses = await listResponsesForSession(String(result.rows[0].id));
  return rowToSession(result.rows[0], responses);
};

export const saveAssessmentResponses = async (
  owner: ClientOwnershipContext,
  sessionId: string,
  responses: AssessmentResponseInput[]
): Promise<AssessmentSessionRecord | null> => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const session = await client.query(
      `
        select *
        from assessment_sessions
        where id = $1
          and user_id = $2
          and client_id = $3
          and status = 'DRAFT'
          and deleted_at is null
        for update
      `,
      [sessionId, owner.accountId, owner.clientId]
    );
    if (!session.rows[0]) {
      await client.query('rollback');
      return null;
    }

    for (const response of responses) {
      await client.query(
        `
          insert into assessment_responses (session_id, item_id, selected_value)
          values ($1, $2, $3)
          on conflict (session_id, item_id) do update set
            selected_value = excluded.selected_value,
            updated_at = now()
        `,
        [sessionId, response.itemId, response.selectedValue]
      );
    }

    await client.query(
      `update assessment_sessions set updated_at = now() where id = $1`,
      [sessionId]
    );
    const storedResponses = await listResponsesForSession(sessionId, client);
    await client.query('commit');
    return rowToSession(session.rows[0], storedResponses);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
};

export const completeAssessmentSession = async (
  owner: ClientOwnershipContext,
  sessionId: string
): Promise<{ result: AssessmentResultRecord; previousResult: AssessmentResultRecord | null } | null> => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const session = await client.query(
      `
        select *
        from assessment_sessions
        where id = $1
          and user_id = $2
          and client_id = $3
          and status = 'DRAFT'
          and deleted_at is null
        for update
      `,
      [sessionId, owner.accountId, owner.clientId]
    );
    if (!session.rows[0]) {
      await client.query('rollback');
      return null;
    }

    const responses = await listResponsesForSession(sessionId, client);
    const score = scorePss10(responses);
    const completedAtISO = new Date().toISOString();
    await client.query(
      `
        update assessment_sessions
        set status = 'COMPLETED',
            completed_at = $2,
            updated_at = now()
        where id = $1
      `,
      [sessionId, completedAtISO]
    );
    const inserted = await client.query(
      `
        insert into assessment_results (
          id, session_id, user_id, client_id, assessment_type, instrument_version,
          scoring_version, interpretation_version, raw_score, max_score, completed_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        returning *
      `,
      [
        randomUUID(),
        sessionId,
        owner.accountId,
        owner.clientId,
        score.assessmentType,
        PSS10_INSTRUMENT_VERSION,
        score.scoringVersion,
        score.interpretationVersion,
        score.rawScore,
        score.maxScore,
        completedAtISO
      ]
    );
    const previous = await client.query(
      `
        select *
        from assessment_results
        where user_id = $1
          and client_id = $2
          and assessment_type = $3
          and session_id <> $4
        order by completed_at desc
        limit 1
      `,
      [owner.accountId, owner.clientId, ASSESSMENT_TYPE_PSS10, sessionId]
    );
    await client.query('commit');
    return {
      result: rowToResult(inserted.rows[0]),
      previousResult: previous.rows[0] ? rowToResult(previous.rows[0]) : null
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
};

export const getLatestAssessmentResult = async (owner: ClientOwnershipContext) => {
  const result = await pool.query(
    `
      select *
      from assessment_results
      where user_id = $1
        and client_id = $2
        and assessment_type = $3
      order by completed_at desc
      limit 2
    `,
    [owner.accountId, owner.clientId, ASSESSMENT_TYPE_PSS10]
  );
  return {
    result: result.rows[0] ? rowToResult(result.rows[0]) : null,
    previousResult: result.rows[1] ? rowToResult(result.rows[1]) : null
  };
};

export const listAssessmentResults = async (owner: ClientOwnershipContext, limit = 50) => {
  const result = await pool.query(
    `
      select *
      from assessment_results
      where user_id = $1
        and client_id = $2
        and assessment_type = $3
      order by completed_at desc
      limit $4
    `,
    [owner.accountId, owner.clientId, ASSESSMENT_TYPE_PSS10, Math.max(1, Math.min(100, limit))]
  );
  return result.rows.map(rowToResult);
};

export const getAssessmentResultById = async (owner: ClientOwnershipContext, resultId: string) => {
  const result = await pool.query(
    `
      select *
      from assessment_results
      where id = $1
        and user_id = $2
        and client_id = $3
    `,
    [resultId, owner.accountId, owner.clientId]
  );
  return result.rows[0] ? rowToResult(result.rows[0]) : null;
};
