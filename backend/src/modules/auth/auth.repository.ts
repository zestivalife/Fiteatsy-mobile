import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';

export type PersistedAuthUser = {
  id: string;
  name: string;
  email: string | null;
  mobileNumber: string | null;
  status: string;
  version: number;
  createdAtISO: string;
  updatedAtISO: string;
  deletedAtISO: string | null;
  lastLoginAtISO: string | null;
  emailVerifiedAtISO: string | null;
  mobileVerifiedAtISO: string | null;
};

export type PersistedAuthSession = {
  id: string;
  userId: string;
  createdAtISO: string;
  expiresAtISO: string;
  revokedAtISO: string | null;
  lastUsedAtISO: string | null;
};

export type AuthenticatedAccount = {
  accountId: string;
  sessionId: string;
  sessionExpiresAtISO: string;
  token: string;
  user: PersistedAuthUser;
};

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const normalizeMobileNumber = (mobileNumber: string) => mobileNumber.trim();
const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const now = () => new Date();

const toIso = (value: unknown) => {
  if (!value) return null;
  return new Date(String(value)).toISOString();
};

const mapUser = (row: Record<string, unknown>): PersistedAuthUser => ({
  id: String(row.id),
  name: String(row.name),
  email: row.email_normalized == null ? null : String(row.email_normalized),
  mobileNumber: row.mobile_number_normalized == null ? null : String(row.mobile_number_normalized),
  status: String(row.status),
  version: Number(row.version),
  createdAtISO: new Date(String(row.created_at)).toISOString(),
  updatedAtISO: new Date(String(row.updated_at)).toISOString(),
  deletedAtISO: toIso(row.deleted_at),
  lastLoginAtISO: toIso(row.last_login_at),
  emailVerifiedAtISO: toIso(row.email_verified_at),
  mobileVerifiedAtISO: toIso(row.mobile_verified_at)
});

const mapSession = (row: Record<string, unknown>): PersistedAuthSession => ({
  id: String(row.id),
  userId: String(row.user_id),
  createdAtISO: new Date(String(row.created_at)).toISOString(),
  expiresAtISO: new Date(String(row.expires_at)).toISOString(),
  revokedAtISO: toIso(row.revoked_at),
  lastUsedAtISO: toIso(row.last_used_at)
});

const findUserCandidates = async (email: string, mobileNumber: string) => {
  const result = await pool.query(
    `
      select *
      from users
      where deleted_at is null
        and (email_normalized = $1 or mobile_number_normalized = $2)
      order by created_at asc
    `,
    [email, mobileNumber]
  );
  return result.rows.map((row) => mapUser(row));
};

export const resolveVerifiedAccount = async (input: {
  name: string;
  email: string;
  mobileNumber: string;
}) => {
  const normalizedEmail = normalizeEmail(input.email);
  const normalizedMobileNumber = normalizeMobileNumber(input.mobileNumber);
  const candidates = await findUserCandidates(normalizedEmail, normalizedMobileNumber);
  const distinctUserIds = Array.from(new Set(candidates.map((candidate) => candidate.id)));

  if (distinctUserIds.length > 1) {
    const error = new Error('Multiple accounts already exist for the provided contact details.');
    error.name = 'AUTH_CONTACT_CONFLICT';
    throw error;
  }

  if (candidates.length === 0) {
    const id = crypto.randomUUID();
    const timestamp = now().toISOString();
    const inserted = await pool.query(
      `
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
      `,
      [id, input.name.trim(), normalizedEmail, normalizedMobileNumber, timestamp, timestamp]
    );
    return mapUser(inserted.rows[0]);
  }

  const existing = candidates[0];
  const updated = await pool.query(
    `
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
    `,
    [existing.id, input.name.trim(), normalizedEmail, normalizedMobileNumber, now().toISOString()]
  );
  return mapUser(updated.rows[0]);
};

export const createAuthSession = async (
  userId: string,
  metadata: { userAgent?: string | null; ipAddress?: string | null } = {}
) => {
  const token = crypto.randomBytes(32).toString('base64url');
  const sessionId = crypto.randomUUID();
  const createdAt = now();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);
  const inserted = await pool.query(
    `
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
    `,
    [
      sessionId,
      userId,
      hashToken(token),
      createdAt.toISOString(),
      expiresAt.toISOString(),
      metadata.userAgent ?? null,
      metadata.ipAddress ?? null
    ]
  );
  return {
    token,
    session: mapSession(inserted.rows[0])
  };
};

export const getAuthenticatedAccountByToken = async (token: string): Promise<AuthenticatedAccount | null> => {
  const result = await pool.query(
    `
      select
        s.*,
        u.id as user_id_value,
        u.name,
        u.email_normalized,
        u.mobile_number_normalized,
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
    `,
    [hashToken(token)]
  );

  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  await pool.query('update auth_sessions set last_used_at = $2 where id = $1', [
    String(row.id),
    now().toISOString()
  ]);

  return {
    accountId: String(row.user_id_value),
    sessionId: String(row.id),
    sessionExpiresAtISO: new Date(String(row.expires_at)).toISOString(),
    token,
    user: {
      id: String(row.user_id_value),
      name: String(row.name),
      email: row.email_normalized == null ? null : String(row.email_normalized),
      mobileNumber: row.mobile_number_normalized == null ? null : String(row.mobile_number_normalized),
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

export const revokeAuthSession = async (sessionId: string) => {
  await pool.query('update auth_sessions set revoked_at = $2 where id = $1 and revoked_at is null', [
    sessionId,
    now().toISOString()
  ]);
};

export const countUsers = async () => {
  const result = await pool.query('select count(*)::int as count from users where deleted_at is null');
  return Number(result.rows[0]?.count ?? 0);
};
