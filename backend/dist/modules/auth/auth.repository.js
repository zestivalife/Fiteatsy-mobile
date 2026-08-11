import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
import { createOrResolveClientForAccount, resolveCurrentClientForAccount } from '../client/client.repository.js';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CONSULTANT_DASHBOARD_BRIDGE_ROLES = new Set(['consultant', 'practitioner', 'admin', 'super_admin']);
const normalizeEmail = (email) => email.trim().toLowerCase();
const normalizeMobileNumber = (mobileNumber) => mobileNumber.trim();
const getIndianNationalMobileNumber = (mobileNumber) => {
    const digits = mobileNumber.replace(/\D/g, '');
    return digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
};
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const now = () => new Date();
const base64UrlDecode = (value) => {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(`${normalized}${padding}`, 'base64');
};
const decodeJwtPayloadUnsafe = (token) => {
    const parts = token.split('.');
    if (parts.length !== 3)
        return null;
    try {
        return JSON.parse(base64UrlDecode(parts[1]).toString('utf8'));
    }
    catch {
        return null;
    }
};
const getConsultantDashboardJwtSecret = () => process.env.CONSULTANT_DASHBOARD_JWT_SECRET_KEY ??
    process.env.CONSULTANT_DASHBOARD_JWT_SECRET ??
    process.env.JWT_SECRET_KEY ??
    null;
const verifyConsultantDashboardJwt = (token) => {
    const secret = getConsultantDashboardJwtSecret();
    const parts = token.split('.');
    if (!secret || parts.length !== 3) {
        return { payload: null, expiryResult: 'not_configured_or_not_jwt' };
    }
    const [headerPart, payloadPart, signaturePart] = parts;
    let header;
    let payload;
    try {
        header = JSON.parse(base64UrlDecode(headerPart).toString('utf8'));
        payload = JSON.parse(base64UrlDecode(payloadPart).toString('utf8'));
    }
    catch {
        return { payload: null, expiryResult: 'invalid_json' };
    }
    if (header.alg !== 'HS256') {
        return { payload, expiryResult: 'unsupported_algorithm' };
    }
    const expected = crypto
        .createHmac('sha256', secret)
        .update(`${headerPart}.${payloadPart}`)
        .digest('base64url');
    const actual = Buffer.from(signaturePart);
    const expectedBuffer = Buffer.from(expected);
    if (actual.length !== expectedBuffer.length || !crypto.timingSafeEqual(actual, expectedBuffer)) {
        return { payload, expiryResult: 'invalid_signature' };
    }
    const expiresAtSeconds = typeof payload.exp === 'number' ? payload.exp : null;
    if (expiresAtSeconds == null) {
        return { payload, expiryResult: 'missing_expiry' };
    }
    if (expiresAtSeconds * 1000 <= Date.now()) {
        return { payload, expiryResult: 'expired' };
    }
    return { payload, expiryResult: 'valid' };
};
const toIso = (value) => {
    if (!value)
        return null;
    return new Date(String(value)).toISOString();
};
const mapUser = (row) => ({
    id: String(row.id),
    name: String(row.name),
    email: row.email_normalized == null ? null : String(row.email_normalized),
    mobileNumber: row.mobile_number_normalized == null ? null : String(row.mobile_number_normalized),
    role: row.role == null ? null : String(row.role),
    status: String(row.status),
    version: Number(row.version),
    createdAtISO: new Date(String(row.created_at)).toISOString(),
    updatedAtISO: new Date(String(row.updated_at)).toISOString(),
    deletedAtISO: toIso(row.deleted_at),
    lastLoginAtISO: toIso(row.last_login_at),
    emailVerifiedAtISO: toIso(row.email_verified_at),
    mobileVerifiedAtISO: toIso(row.mobile_verified_at)
});
const mapSession = (row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    createdAtISO: new Date(String(row.created_at)).toISOString(),
    expiresAtISO: new Date(String(row.expires_at)).toISOString(),
    revokedAtISO: toIso(row.revoked_at),
    lastUsedAtISO: toIso(row.last_used_at)
});
const mapPinUser = (row) => ({
    ...mapUser(row),
    pinHash: row.pin_hash == null ? null : String(row.pin_hash),
    pinCreatedAtISO: toIso(row.pin_created_at),
    pinLastChangedAtISO: toIso(row.pin_last_changed_at),
    forcePinChange: Boolean(row.force_pin_change),
    pinFailedAttempts: Number(row.pin_failed_attempts ?? 0),
    pinLockedUntilISO: toIso(row.pin_locked_until)
});
const rowToAuthenticatedAccount = async (row, input) => {
    const currentClient = await resolveCurrentClientForAccount(String(row.user_id_value));
    return {
        accountId: String(row.user_id_value),
        sessionId: input.sessionId,
        sessionExpiresAtISO: input.sessionExpiresAtISO,
        token: input.token,
        authProvider: 'fiteatsy',
        client: currentClient,
        user: {
            id: String(row.user_id_value),
            name: String(row.name),
            email: row.email_normalized == null ? null : String(row.email_normalized),
            mobileNumber: row.mobile_number_normalized == null ? null : String(row.mobile_number_normalized),
            role: row.role == null ? null : String(row.role),
            status: String(row.user_status),
            version: Number(row.user_version),
            createdAtISO: new Date(String(row.user_created_at)).toISOString(),
            updatedAtISO: new Date(String(row.user_updated_at)).toISOString(),
            deletedAtISO: toIso(row.user_deleted_at),
            lastLoginAtISO: toIso(row.user_last_login_at),
            emailVerifiedAtISO: toIso(row.email_verified_at),
            mobileVerifiedAtISO: toIso(row.mobile_verified_at)
        }
    };
};
const isUniqueViolation = (error) => typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code === '23505';
const findUserCandidates = async (email, mobileNumber, db = pool, options = {}) => {
    const lockClause = options.lockRows ? 'for update' : '';
    const result = await db.query(`
      select *
      from users
      where deleted_at is null
        and (email_normalized = $1 or mobile_number_normalized = $2)
      order by created_at asc
      ${lockClause}
    `, [email, mobileNumber]);
    return result.rows.map((row) => mapUser(row));
};
export const resolveVerifiedAccountIdentity = async (input) => {
    const normalizedEmail = normalizeEmail(input.email);
    const normalizedMobileNumber = normalizeMobileNumber(input.mobileNumber);
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const client = await pool.connect();
        try {
            await client.query('begin');
            const candidates = await findUserCandidates(normalizedEmail, normalizedMobileNumber, client, {
                lockRows: true
            });
            const distinctUserIds = Array.from(new Set(candidates.map((candidate) => candidate.id)));
            if (distinctUserIds.length > 1) {
                const error = new Error('Multiple accounts already exist for the provided contact details.');
                error.name = 'AUTH_CONTACT_CONFLICT';
                throw error;
            }
            let user;
            if (candidates.length === 0) {
                const id = crypto.randomUUID();
                const timestamp = now().toISOString();
                const inserted = await client.query(`
            insert into users (
              id,
              name,
              email_normalized,
              mobile_number_normalized,
              email_verified_at,
              mobile_verified_at,
              status,
              version,
              last_login_at,
              created_at,
              updated_at
            ) values ($1, $2, $3, $4, $5, $6, 'active', 1, $5, $5, $5)
            returning *
          `, [id, input.name.trim(), normalizedEmail, normalizedMobileNumber, timestamp, timestamp]);
                user = mapUser(inserted.rows[0]);
            }
            else {
                const existing = candidates[0];
                const updated = await client.query(`
            update users
            set
              name = $2,
              email_normalized = $3,
              mobile_number_normalized = $4,
              email_verified_at = coalesce(email_verified_at, $5),
              mobile_verified_at = coalesce(mobile_verified_at, $5),
              last_login_at = $5,
              updated_at = $5,
              version = version + 1
            where id = $1
            returning *
          `, [existing.id, input.name.trim(), normalizedEmail, normalizedMobileNumber, now().toISOString()]);
                user = mapUser(updated.rows[0]);
            }
            const resolvedClient = await createOrResolveClientForAccount(user.id, client);
            await client.query('commit');
            return {
                user,
                client: resolvedClient
            };
        }
        catch (error) {
            await client.query('rollback');
            if (isUniqueViolation(error)) {
                continue;
            }
            throw error;
        }
        finally {
            client.release();
        }
    }
    throw new Error('Failed to resolve verified account identity after retrying.');
};
export const createAuthSession = async (userId, metadata = {}) => {
    const token = crypto.randomBytes(32).toString('base64url');
    const sessionId = crypto.randomUUID();
    const createdAt = now();
    const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);
    const inserted = await pool.query(`
      insert into auth_sessions (
        id,
        user_id,
        token_hash,
        created_at,
        expires_at,
        last_used_at,
        user_agent,
        ip_address
      ) values ($1, $2, $3, $4, $5, $4, $6, $7)
      returning *
    `, [
        sessionId,
        userId,
        hashToken(token),
        createdAt.toISOString(),
        expiresAt.toISOString(),
        metadata.userAgent ?? null,
        metadata.ipAddress ?? null
    ]);
    return {
        token,
        session: mapSession(inserted.rows[0])
    };
};
export const findUserByMobileNumberForPin = async (mobileNumber) => {
    const normalizedMobile = normalizeMobileNumber(mobileNumber);
    const nationalMobile = getIndianNationalMobileNumber(normalizedMobile);
    const result = await pool.query(`
      select *
      from users
      where (
          mobile_number_normalized = $1
          or mobile_number_normalized = $2
          or right(regexp_replace(coalesce(mobile_number_normalized, ''), '[^0-9]', '', 'g'), 10) = $2
        )
        and deleted_at is null
      order by
        case
          when mobile_number_normalized = $1 then 0
          when mobile_number_normalized = $2 then 1
          else 2
        end,
        created_at asc
      limit 1
    `, [normalizedMobile, nationalMobile]);
    if (result.rowCount === 0)
        return null;
    return mapPinUser(result.rows[0]);
};
export const normalizeUserMobileNumber = async (userId, mobileNumber) => {
    await pool.query(`
      update users
      set
        mobile_number_normalized = $2,
        mobile_verified_at = coalesce(mobile_verified_at, $3),
        updated_at = $3,
        version = version + 1
      where id = $1
        and deleted_at is null
        and (mobile_number_normalized is null or mobile_number_normalized <> $2)
        and not exists (
          select 1
          from users existing
          where existing.id <> users.id
            and existing.deleted_at is null
            and existing.mobile_number_normalized = $2
        )
    `, [userId, normalizeMobileNumber(mobileNumber), now().toISOString()]);
};
export const findUserByIdForPin = async (userId) => {
    const result = await pool.query(`
      select *
      from users
      where id = $1
        and deleted_at is null
      limit 1
    `, [userId]);
    if (result.rowCount === 0)
        return null;
    return mapPinUser(result.rows[0]);
};
export const setUserPinHash = async (userId, pinHash, options) => {
    const timestamp = now().toISOString();
    const result = await pool.query(`
      update users
      set
        pin_hash = $2,
        pin_created_at = coalesce(pin_created_at, $3),
        pin_last_changed_at = $3,
        force_pin_change = $4,
        pin_failed_attempts = 0,
        pin_locked_until = null,
        updated_at = $3,
        version = version + 1
      where id = $1
        and deleted_at is null
      returning *
    `, [userId, pinHash, timestamp, options.forcePinChange]);
    if (result.rowCount === 0)
        throw new Error('PIN user not found.');
    return mapPinUser(result.rows[0]);
};
export const resetPinFailureState = async (userId) => {
    await pool.query(`
      update users
      set
        pin_failed_attempts = 0,
        pin_locked_until = null,
        last_login_at = $2,
        updated_at = $2
      where id = $1
        and deleted_at is null
    `, [userId, now().toISOString()]);
};
export const recordPinFailure = async (userId, options) => {
    const result = await pool.query(`
      update users
      set
        pin_failed_attempts = pin_failed_attempts + 1,
        pin_locked_until = case
          when pin_failed_attempts + 1 >= $2 then $3::timestamptz
          else pin_locked_until
        end,
        updated_at = $4
      where id = $1
        and deleted_at is null
      returning *
    `, [userId, options.maxAttempts, options.lockUntilISO, now().toISOString()]);
    if (result.rowCount === 0)
        throw new Error('PIN user not found.');
    return mapPinUser(result.rows[0]);
};
export const createAuthEvent = async (input) => {
    await pool.query(`
      insert into auth_events (
        id,
        user_id,
        event,
        metadata,
        ip_address,
        user_agent,
        created_at
      ) values ($1, $2, $3, $4::jsonb, $5, $6, $7)
    `, [
        crypto.randomUUID(),
        input.userId ?? null,
        input.event,
        JSON.stringify(input.metadata ?? {}),
        input.ipAddress ?? null,
        input.userAgent ?? null,
        now().toISOString()
    ]);
};
export const getAuthenticatedAccountByToken = async (token) => {
    const unsafePayload = decodeJwtPayloadUnsafe(token);
    const tokenUserId = typeof unsafePayload?.sub === 'string' ? unsafePayload.sub : null;
    const result = await pool.query(`
      select
        s.*,
        u.id as user_id_value,
        u.name,
        u.email_normalized,
        u.mobile_number_normalized,
        u.role,
        u.status as user_status,
        u.version as user_version,
        u.created_at as user_created_at,
        u.updated_at as user_updated_at,
        u.deleted_at as user_deleted_at,
        u.last_login_at as user_last_login_at,
        u.email_verified_at,
        u.mobile_verified_at
      from auth_sessions s
      join users u on u.id = s.user_id
      where s.token_hash = $1
        and s.revoked_at is null
        and s.expires_at > now()
        and u.deleted_at is null
      limit 1
    `, [hashToken(token)]);
    if (result.rows.length > 0) {
        const row = result.rows[0];
        await pool.query('update auth_sessions set last_used_at = $2 where id = $1', [
            String(row.id),
            now().toISOString()
        ]);
        console.info('CONSULTANT_SESSION_DEBUG', {
            tokenUserId: tokenUserId ?? String(row.user_id_value),
            sessionFound: true,
            sessionStatus: 'active',
            expiryResult: 'valid'
        });
        return rowToAuthenticatedAccount(row, {
            token,
            sessionId: String(row.id),
            sessionExpiresAtISO: new Date(String(row.expires_at)).toISOString()
        });
    }
    const bridge = verifyConsultantDashboardJwt(token);
    const bridgePayload = bridge.payload ?? unsafePayload;
    const bridgeUserId = typeof bridgePayload?.sub === 'string' ? bridgePayload.sub : tokenUserId;
    const bridgeRole = typeof bridgePayload?.role === 'string' ? bridgePayload.role.toLowerCase() : null;
    const bridgeEmail = typeof bridgePayload?.email === 'string' ? normalizeEmail(bridgePayload.email) : null;
    const bridgeStatus = typeof bridgePayload?.status === 'string' ? bridgePayload.status.toUpperCase() : null;
    const credentialStatus = typeof bridgePayload?.credential_status === 'string'
        ? bridgePayload.credential_status.toUpperCase()
        : null;
    if (bridge.expiryResult !== 'valid' ||
        !bridgeUserId ||
        !bridgeRole ||
        !CONSULTANT_DASHBOARD_BRIDGE_ROLES.has(bridgeRole) ||
        bridgeStatus !== 'ACTIVE' ||
        credentialStatus !== 'PERMANENT') {
        console.info('CONSULTANT_SESSION_DEBUG', {
            tokenUserId: bridgeUserId,
            sessionFound: false,
            sessionStatus: 'missing',
            expiryResult: bridge.expiryResult
        });
        return null;
    }
    const bridgedUser = await pool.query(`
      select
        u.id as user_id_value,
        u.name,
        u.email_normalized,
        u.mobile_number_normalized,
        u.role,
        u.status as user_status,
        u.version as user_version,
        u.created_at as user_created_at,
        u.updated_at as user_updated_at,
        u.deleted_at as user_deleted_at,
        u.last_login_at as user_last_login_at,
        u.email_verified_at,
        u.mobile_verified_at
      from users u
      where (u.id = $1 or ($2::text is not null and u.email_normalized = $2))
        and u.deleted_at is null
        and u.status = 'active'
        and coalesce(u.role, 'user') = any($3)
      limit 1
    `, [bridgeUserId, bridgeEmail, Array.from(CONSULTANT_DASHBOARD_BRIDGE_ROLES)]);
    const userRow = bridgedUser.rows[0];
    if (userRow) {
        console.info('CONSULTANT_SESSION_DEBUG', {
            tokenUserId: bridgeUserId,
            sessionFound: false,
            sessionStatus: 'consultant_jwt_bridge',
            expiryResult: bridge.expiryResult
        });
        return rowToAuthenticatedAccount(userRow, {
            token,
            sessionId: `consultant-dashboard:${bridgeUserId}`,
            sessionExpiresAtISO: new Date(Number(bridgePayload?.exp) * 1000).toISOString()
        });
    }
    console.info('CONSULTANT_SESSION_DEBUG', {
        tokenUserId: bridgeUserId,
        sessionFound: false,
        sessionStatus: 'consultant_jwt_bridge_external',
        expiryResult: bridge.expiryResult
    });
    return {
        accountId: bridgeUserId,
        sessionId: `consultant-dashboard:${bridgeUserId}`,
        sessionExpiresAtISO: new Date(Number(bridgePayload?.exp) * 1000).toISOString(),
        token,
        authProvider: 'consultant_dashboard',
        user: {
            id: bridgeUserId,
            name: bridgeEmail ?? 'Consultant Dashboard User',
            email: bridgeEmail,
            mobileNumber: null,
            role: bridgeRole,
            status: 'active',
            version: 1,
            createdAtISO: new Date(0).toISOString(),
            updatedAtISO: new Date(0).toISOString(),
            deletedAtISO: null,
            lastLoginAtISO: null,
            emailVerifiedAtISO: null,
            mobileVerifiedAtISO: null
        },
        client: undefined
    };
};
export const revokeAuthSession = async (sessionId) => {
    await pool.query('update auth_sessions set revoked_at = $2 where id = $1 and revoked_at is null', [
        sessionId,
        now().toISOString()
    ]);
};
export const countUsers = async () => {
    const result = await pool.query('select count(*)::int as count from users where deleted_at is null');
    return Number(result.rows[0]?.count ?? 0);
};
