import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { pool } from '../../db/pool.js';
import { createAuthSessionWithClient } from './auth.repository.js';
import { redisCommand } from './otp-store.js';
export const QA_ADMIN_HANDOFF_PURPOSE = 'qa_admin_session_handoff';
const HANDOFF_TTL_MS = 3 * 60 * 1000;
const HANDOFF_RATE_WINDOW_MS = 60 * 1000;
const HANDOFF_RATE_MAX = 10;
const exchangeAttempts = new Map();
const handoffError = (code, status, message, retryAfterSec) => Object.assign(new Error(message), { code, status, retryAfterSec });
const digest = (code) => crypto.createHash('sha256').update(code).digest('hex');
const audit = async (client, input) => {
    await client.query(`insert into qa_provisioning_audit_events
      (id, actor_user_id, target_user_id, action, account_purpose, role, reason, metadata)
     values ($1, null, $2, $3, 'QA_TEST', 'admin', $4, $5::jsonb)`, [crypto.randomUUID(), input.targetUserId ?? null, input.action, input.reason,
        JSON.stringify({ ...(input.metadata ?? {}), ...(input.actorReference ? { delegatedActorReference: input.actorReference } : {}) })]);
};
const isTestRuntime = () => env.environment.toLowerCase() === 'test' || process.execArgv.some((arg) => arg.includes('--test'));
export const assertQaHandoffExchangeRate = async (key) => {
    if (!isTestRuntime()) {
        const window = Math.floor(Date.now() / HANDOFF_RATE_WINDOW_MS);
        const safeKey = crypto.createHash('sha256').update(key).digest('hex');
        const redisKey = `fiteatsy:qa-handoff:exchange:${safeKey}:${window}`;
        const count = Number(await redisCommand(['INCR', redisKey]));
        if (count === 1)
            await redisCommand(['EXPIRE', redisKey, String(Math.ceil(HANDOFF_RATE_WINDOW_MS / 1000))]);
        if (count > HANDOFF_RATE_MAX) {
            throw handoffError('QA_HANDOFF_RATE_LIMITED', 429, 'Too many handoff attempts. Please try again later.', Math.max(1, Math.ceil(HANDOFF_RATE_WINDOW_MS / 1000)));
        }
        return;
    }
    const now = Date.now();
    const recent = (exchangeAttempts.get(key) ?? []).filter((timestamp) => now - timestamp < HANDOFF_RATE_WINDOW_MS);
    if (recent.length >= HANDOFF_RATE_MAX) {
        const retryAfterSec = Math.max(1, Math.ceil((HANDOFF_RATE_WINDOW_MS - (now - recent[0])) / 1000));
        throw handoffError('QA_HANDOFF_RATE_LIMITED', 429, 'Too many handoff attempts. Please try again later.', retryAfterSec);
    }
    exchangeAttempts.set(key, [...recent, now]);
};
export const resetQaHandoffRateLimitForTests = () => exchangeAttempts.clear();
export const issueQaAdminSessionHandoff = async (input) => {
    const code = crypto.randomBytes(32).toString('base64url');
    const handoffId = crypto.randomUUID();
    const auditReference = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS);
    const client = await pool.connect();
    try {
        await client.query('begin');
        const target = await client.query(`select id from users
        where id = $1 and deleted_at is null and status = 'active'
          and account_purpose = 'QA_TEST' and lower(role) = 'admin'
        for update`, [input.targetUserId]);
        if (!target.rowCount)
            throw handoffError('QA_HANDOFF_DENIED', 404, 'Eligible QA Admin was not found.');
        const revoked = await client.query(`update qa_admin_session_handoffs
          set status = 'revoked'
        where target_user_id = $1 and purpose = $2 and status = 'pending'
        returning id, audit_reference`, [input.targetUserId, QA_ADMIN_HANDOFF_PURPOSE]);
        for (const row of revoked.rows) {
            await audit(client, {
                actorReference: input.actorReference,
                targetUserId: input.targetUserId,
                action: 'QASessionHandoffRevoked',
                reason: 'Prior unconsumed QA Admin handoff invalidated by a new issue request.',
                metadata: { handoffId: String(row.id), auditReference: String(row.audit_reference), purpose: QA_ADMIN_HANDOFF_PURPOSE }
            });
        }
        await client.query(`insert into qa_admin_session_handoffs
        (id, code_digest, target_user_id, purpose, status, actor_reference, audit_reference, expires_at)
       values ($1, $2, $3, $4, 'pending', $5, $6, $7)`, [handoffId, digest(code), input.targetUserId, QA_ADMIN_HANDOFF_PURPOSE, input.actorReference, auditReference, expiresAt.toISOString()]);
        await audit(client, {
            actorReference: input.actorReference,
            targetUserId: input.targetUserId,
            action: 'QASessionHandoffIssued',
            reason: input.reason,
            metadata: { handoffId, auditReference, purpose: QA_ADMIN_HANDOFF_PURPOSE, expiresAtISO: expiresAt.toISOString() }
        });
        await client.query('commit');
        return {
            targetUserId: input.targetUserId,
            purpose: QA_ADMIN_HANDOFF_PURPOSE,
            code,
            expiresAtISO: expiresAt.toISOString()
        };
    }
    catch (error) {
        await client.query('rollback');
        throw error;
    }
    finally {
        client.release();
    }
};
export const exchangeQaAdminSessionHandoff = async (input) => {
    const client = await pool.connect();
    let transactionOpen = false;
    try {
        await client.query('begin');
        transactionOpen = true;
        const result = await client.query(`select h.id, h.target_user_id, h.purpose, h.status, h.actor_reference,
              h.audit_reference, h.expires_at, h.consumed_at,
              u.role, u.account_purpose, u.status as user_status
         from qa_admin_session_handoffs h
         join users u on u.id = h.target_user_id and u.deleted_at is null
        where h.code_digest = $1
        for update of h, u`, [digest(input.code)]);
        if (!result.rowCount) {
            await audit(client, { action: 'QASessionHandoffDenied', reason: 'Unknown or modified QA Admin handoff denied.', metadata: { result: 'unknown' } });
            await client.query('commit');
            transactionOpen = false;
            throw handoffError('QA_HANDOFF_DENIED', 401, 'The QA session handoff is invalid.');
        }
        const row = result.rows[0];
        const metadata = { handoffId: String(row.id), auditReference: String(row.audit_reference), purpose: String(row.purpose) };
        const common = { actorReference: String(row.actor_reference), targetUserId: String(row.target_user_id) };
        if (String(row.target_user_id) !== input.targetUserId
            || String(row.purpose) !== QA_ADMIN_HANDOFF_PURPOSE
            || input.purpose !== QA_ADMIN_HANDOFF_PURPOSE
            || String(row.account_purpose) !== 'QA_TEST'
            || String(row.role).toLowerCase() !== 'admin'
            || String(row.user_status).toLowerCase() !== 'active') {
            await audit(client, { ...common, action: 'QASessionHandoffDenied', reason: 'QA Admin handoff boundary validation denied.', metadata: { ...metadata, result: 'boundary_denied' } });
            await client.query('commit');
            transactionOpen = false;
            throw handoffError('QA_HANDOFF_DENIED', 401, 'The QA session handoff is invalid.');
        }
        if (String(row.status) !== 'pending' || row.consumed_at != null) {
            await audit(client, { ...common, action: 'QASessionHandoffReplayDenied', reason: 'Consumed or revoked QA Admin handoff replay denied.', metadata: { ...metadata, result: 'replay_denied' } });
            await client.query('commit');
            transactionOpen = false;
            throw handoffError('QA_HANDOFF_REPLAYED', 401, 'The QA session handoff is invalid.');
        }
        if (new Date(String(row.expires_at)).getTime() <= Date.now()) {
            await client.query(`update qa_admin_session_handoffs set status = 'expired' where id = $1`, [row.id]);
            await audit(client, { ...common, action: 'QASessionHandoffExpired', reason: 'Expired QA Admin handoff denied.', metadata: { ...metadata, result: 'expired' } });
            await client.query('commit');
            transactionOpen = false;
            throw handoffError('QA_HANDOFF_EXPIRED', 401, 'The QA session handoff is invalid.');
        }
        await client.query(`update qa_admin_session_handoffs set status = 'consumed', consumed_at = now()
        where id = $1 and status = 'pending' and consumed_at is null`, [row.id]);
        const session = await createAuthSessionWithClient(client, input.targetUserId, {
            userAgent: input.userAgent ?? 'qa-session-handoff',
            ipAddress: input.ipAddress ?? null
        });
        await audit(client, { ...common, action: 'QASessionHandoffExchanged', reason: 'QA Admin handoff exchanged for a canonical session.', metadata: { ...metadata, result: 'exchanged', sessionId: session.session.id } });
        await client.query('commit');
        transactionOpen = false;
        return session;
    }
    catch (error) {
        if (transactionOpen) {
            try {
                await client.query('rollback');
            }
            catch { }
        }
        throw error;
    }
    finally {
        client.release();
    }
};
