import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
import { createAuthSessionWithClient } from './auth.repository.js';
export const QA_DIET_HYDRATION_PURPOSE = 'DIET_PARTIAL_PLAN_HYDRATION_E2E';
const HANDOFF_TTL_MS = 3 * 60 * 1000;
const SESSION_TTL_MS = 30 * 60 * 1000;
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const failure = (code, status = 401) => Object.assign(new Error('The QA browser handoff is invalid.'), { code, status });
const audit = (client, action, targetUserId, role, metadata) => client.query(`insert into qa_provisioning_audit_events
    (id,actor_user_id,target_user_id,action,account_purpose,role,reason,metadata)
    values($1,null,$2,$3,'QA_TEST',$4,$5,$6::jsonb)`, [crypto.randomUUID(), targetUserId, action, role, action, JSON.stringify(metadata)]);
export const issueQaBrowserHandoff = async (input) => {
    const client = await pool.connect();
    const code = crypto.randomBytes(32).toString('base64url');
    const id = crypto.randomUUID();
    const auditReference = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS);
    try {
        await client.query('begin');
        const eligible = await client.query(`select u.id
      from qa_fixture_sets f
      join qa_fixture_entities e on e.fixture_set_id=f.id and e.entity_type='USER'
      join users u on u.id=e.entity_id
      where f.id=$1 and f.status='ACTIVE' and f.environment='PRODUCTION_QA'
        and f.purpose=$2 and f.expires_at>now() and u.id=$3 and u.account_purpose='QA_TEST'
        and u.status='active' and lower(u.role)=$4`, [input.fixtureSetId, QA_DIET_HYDRATION_PURPOSE, input.identityId, input.role]);
        if (!eligible.rowCount)
            throw failure('QA_HANDOFF_BOUNDARY_DENIED', 403);
        if (input.role === 'consultant') {
            const unsafe = await client.query(`select 1 from consultant_client_assignments a
        join users u on u.id=a.client_user_id
        left join qa_fixture_entities e on e.fixture_set_id=$1 and e.entity_type='USER' and e.entity_id=u.id
        where a.consultant_user_id=$2 and a.status='active'
          and (u.account_purpose<>'QA_TEST' or e.entity_id is null) limit 1`, [input.fixtureSetId, input.identityId]);
            if (unsafe.rowCount)
                throw failure('QA_CLIENT_ISOLATION_NOT_ESTABLISHED', 403);
        }
        await client.query(`update qa_browser_handoffs set status='REVOKED',revoked_at=now()
      where fixture_set_id=$1 and qa_identity_id=$2 and role=$3 and status='ISSUED'`, [input.fixtureSetId, input.identityId, input.role]);
        await client.query(`insert into qa_browser_handoffs
      (id,code_digest,fixture_set_id,qa_identity_id,role,purpose,environment,created_by_actor_id,expires_at,status,audit_reference)
      values($1,$2,$3,$4,$5,$6,'PRODUCTION_QA',$7,$8,'ISSUED',$9)`, [id, hash(code), input.fixtureSetId, input.identityId, input.role, QA_DIET_HYDRATION_PURPOSE, input.actorId, expiresAt.toISOString(), auditReference]);
        await audit(client, 'QA_HANDOFF_ISSUED', input.identityId, input.role, { handoffId: id, fixtureSetId: input.fixtureSetId, auditReference });
        await client.query('commit');
        return { id, code, fixtureSetId: input.fixtureSetId, identityId: input.identityId, role: input.role, purpose: QA_DIET_HYDRATION_PURPOSE, expiresAtISO: expiresAt.toISOString() };
    }
    catch (error) {
        await client.query('rollback');
        throw error;
    }
    finally {
        client.release();
    }
};
export const exchangeQaBrowserHandoff = async (input) => {
    const client = await pool.connect();
    try {
        await client.query('begin');
        const result = await client.query(`select h.*,u.status user_status,u.account_purpose,u.role user_role,f.status fixture_status,f.expires_at fixture_expires
      from qa_browser_handoffs h join users u on u.id=h.qa_identity_id join qa_fixture_sets f on f.id=h.fixture_set_id
      where h.code_digest=$1 for update of h,u,f`, [hash(input.code)]);
        if (!result.rowCount)
            throw failure('QA_HANDOFF_DENIED');
        const row = result.rows[0];
        const meta = { handoffId: String(row.id), fixtureSetId: String(row.fixture_set_id), auditReference: String(row.audit_reference) };
        if (row.status !== 'ISSUED')
            throw failure('QA_HANDOFF_ALREADY_CONSUMED');
        if (new Date(row.expires_at) <= new Date()) {
            await client.query(`update qa_browser_handoffs set status='EXPIRED' where id=$1`, [row.id]);
            await client.query('commit');
            throw failure('QA_HANDOFF_EXPIRED');
        }
        if (String(row.fixture_set_id) !== input.fixtureSetId || row.role !== input.role || row.user_role !== input.role)
            throw failure('QA_HANDOFF_ROLE_OR_FIXTURE_MISMATCH', 403);
        if (row.purpose !== QA_DIET_HYDRATION_PURPOSE || row.environment !== 'PRODUCTION_QA' || row.account_purpose !== 'QA_TEST' || row.user_status !== 'active' || row.fixture_status !== 'ACTIVE' || new Date(row.fixture_expires) <= new Date())
            throw failure('QA_HANDOFF_BOUNDARY_DENIED', 403);
        const consumed = await client.query(`update qa_browser_handoffs set status='CONSUMED',consumed_at=now()
      where id=$1 and status='ISSUED' returning id`, [row.id]);
        if (!consumed.rowCount)
            throw failure('QA_HANDOFF_ALREADY_CONSUMED');
        const session = await createAuthSessionWithClient(client, String(row.qa_identity_id), { userAgent: input.userAgent, ipAddress: input.ipAddress, ttlMs: SESSION_TTL_MS, qaFixtureSetId: input.fixtureSetId, qaPurpose: QA_DIET_HYDRATION_PURPOSE, qaRole: input.role });
        await audit(client, 'QA_HANDOFF_CONSUMED', String(row.qa_identity_id), input.role, { ...meta, sessionId: session.session.id });
        await audit(client, 'QA_SESSION_CREATED', String(row.qa_identity_id), input.role, { ...meta, sessionId: session.session.id });
        await client.query('commit');
        return session;
    }
    catch (error) {
        try {
            await client.query('rollback');
        }
        catch { }
        throw error;
    }
    finally {
        client.release();
    }
};
export const revokeQaFixtureSessions = async (fixtureSetId) => {
    const result = await pool.query(`update auth_sessions set revoked_at=now() where qa_fixture_set_id=$1 and revoked_at is null returning id,user_id,qa_role`, [fixtureSetId]);
    for (const row of result.rows)
        await pool.query(`insert into qa_provisioning_audit_events(id,actor_user_id,target_user_id,action,account_purpose,role,reason,metadata)
    values($1,null,$2,'QA_SESSION_REVOKED','QA_TEST',$3,'QA_SESSION_REVOKED',$4::jsonb)`, [crypto.randomUUID(), row.user_id, row.qa_role, JSON.stringify({ fixtureSetId, sessionId: row.id })]);
    await pool.query(`update qa_browser_handoffs set status='REVOKED',revoked_at=now() where fixture_set_id=$1 and status='ISSUED'`, [fixtureSetId]);
    return { revokedSessions: result.rowCount ?? 0 };
};
