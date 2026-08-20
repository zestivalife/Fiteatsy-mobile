import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';

export type ManagedRole = 'user' | 'consultant' | 'admin';

export type RoleAuditEventRecord = {
  id: string;
  performedByUserId: string | null;
  targetUserId: string;
  oldRole: string | null;
  newRole: string;
  reason: string | null;
  createdAtISO: string;
};

const SUPPORTED_ROLES = new Set<ManagedRole>(['user', 'consultant', 'admin']);

export const isManagedRole = (role: string): role is ManagedRole =>
  SUPPORTED_ROLES.has(role as ManagedRole);

const normalizeMobile = (mobile: string) => mobile.trim().replace(/\D/g, '');

const mapAuditEvent = (row: Record<string, unknown>): RoleAuditEventRecord => ({
  id: String(row.id),
  performedByUserId: row.performed_by_user_id == null ? null : String(row.performed_by_user_id),
  targetUserId: String(row.target_user_id),
  oldRole: row.old_role == null ? null : String(row.old_role),
  newRole: String(row.new_role),
  reason: row.reason == null ? null : String(row.reason),
  createdAtISO: new Date(String(row.created_at)).toISOString()
});

export const assignUserRole = async (input: {
  performedByUserId: string | null;
  targetUserId: string;
  role: ManagedRole;
  reason?: string | null;
}) => {
  const normalizedRole = input.role.toLowerCase() as ManagedRole;
  const client = await pool.connect();
  try {
    await client.query('begin');
    const target = await client.query(
      `
        select id, role
        from users
        where id = $1
          and deleted_at is null
        for update
      `,
      [input.targetUserId]
    );
    if (target.rowCount === 0) {
      await client.query('rollback');
      return null;
    }

    const oldRole = target.rows[0].role == null ? null : String(target.rows[0].role);
    const timestamp = new Date().toISOString();
    const updated = await client.query(
      `
        update users
        set
          role = $2,
          updated_at = $3,
          version = version + 1
        where id = $1
          and deleted_at is null
        returning id, role
      `,
      [input.targetUserId, normalizedRole, timestamp]
    );

    const audit = await client.query(
      `
        insert into role_audit_events (
          id,
          performed_by_user_id,
          target_user_id,
          old_role,
          new_role,
          reason,
          created_at
        ) values ($1, $2, $3, $4, $5, $6, $7)
        returning *
      `,
      [
        crypto.randomUUID(),
        input.performedByUserId,
        input.targetUserId,
        oldRole,
        normalizedRole,
        input.reason?.trim() || null,
        timestamp
      ]
    );
    await client.query('commit');
    return {
      userId: String(updated.rows[0].id),
      role: String(updated.rows[0].role),
      auditEvent: mapAuditEvent(audit.rows[0])
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
};

export const countRoleAuditEventsByReason = async (reason: string) => {
  const result = await pool.query(
    `
      select count(*)::int as count
      from role_audit_events
      where reason = $1
    `,
    [reason]
  );
  return Number(result.rows[0]?.count ?? 0);
};

export const countActiveAdmins = async () => {
  const result = await pool.query(
    `
      select count(*)::int as count
      from users
      where deleted_at is null
        and lower(coalesce(status, '')) = 'active'
        and lower(coalesce(role, '')) = 'admin'
    `
  );
  return Number(result.rows[0]?.count ?? 0);
};

export const findActiveVerifiedUserIdByMobile = async (mobile: string) => {
  const canonical = normalizeMobile(mobile);
  const national = canonical.startsWith('91') && canonical.length === 12 ? canonical.slice(2) : canonical;
  const result = await pool.query(
    `
      select id
      from users
      where deleted_at is null
        and lower(coalesce(status, '')) = 'active'
        and mobile_verified_at is not null
        and (
          regexp_replace(coalesce(mobile_number_normalized, ''), '[^0-9]', '', 'g') = $1
          or regexp_replace(coalesce(mobile_number_normalized, ''), '[^0-9]', '', 'g') = $2
          or right(regexp_replace(coalesce(mobile_number_normalized, ''), '[^0-9]', '', 'g'), 10) = $2
        )
      order by created_at asc
      limit 1
    `,
    [canonical, national]
  );
  return result.rowCount === 0 ? null : String(result.rows[0].id);
};

export const listFiteatsyClientDirectory = async (assignment: 'all' | 'assigned' | 'unassigned' = 'all') => {
  const assignmentFilter = assignment === 'assigned'
    ? 'and active_assignment.id is not null'
    : assignment === 'unassigned'
      ? 'and active_assignment.id is null'
      : '';
  const result = await pool.query(
    `
      select
        c.fiteatsy_client_id,
        u.id as user_id,
        u.name,
        u.email_normalized,
        u.mobile_number_normalized,
        u.status as user_status,
        u.account_purpose,
        u.created_at,
        active_assignment.id as assignment_id,
        active_assignment.consultant_user_id,
        consultant.name as consultant_name,
        subscription.status as subscription_status
      from users u
      join fiteatsy_clients c on c.account_user_id = u.id
        and c.deleted_at is null
        and lower(coalesce(c.status, '')) = 'active'
      left join lateral (
        select a.id, a.consultant_user_id
        from consultant_client_assignments a
        where a.client_user_id = u.id
          and a.status = 'active'
        order by a.updated_at desc
        limit 1
      ) active_assignment on true
      left join users consultant on consultant.id = active_assignment.consultant_user_id
      left join lateral (
        select s.status
        from user_subscriptions s
        where s.user_id = u.id
        order by s.updated_at desc, s.created_at desc
        limit 1
      ) subscription on true
      where u.deleted_at is null
        and lower(coalesce(u.status, '')) = 'active'
        and lower(coalesce(u.role, 'user')) = 'user'
        ${assignmentFilter}
      order by u.created_at desc
    `
  );
  return result.rows.map((row) => ({
    clientId: String(row.fiteatsy_client_id),
    userId: String(row.user_id),
    name: String(row.name),
    email: row.email_normalized == null ? null : String(row.email_normalized),
    mobileNumberMasked: row.mobile_number_normalized == null ? null : `****${String(row.mobile_number_normalized).replace(/\D/g, '').slice(-4)}`,
    accountStatus: String(row.user_status),
    accountPurpose: String(row.account_purpose),
    registeredAt: new Date(String(row.created_at)).toISOString(),
    assignmentStatus: row.assignment_id == null ? 'unassigned' : 'assigned',
    assignmentId: row.assignment_id == null ? null : String(row.assignment_id),
    consultantUserId: row.consultant_user_id == null ? null : String(row.consultant_user_id),
    consultantName: row.consultant_name == null ? null : String(row.consultant_name),
    subscriptionStatus: row.subscription_status == null ? 'none' : String(row.subscription_status)
  }));
};

export const createFiteatsyClientAssignment = async (input: {
  actorUserId: string;
  consultantUserId: string;
  clientUserId: string;
  reason: string;
}) => {
  const result = await pool.query(
    `insert into consultant_client_assignments (id, consultant_user_id, client_user_id, created_by_user_id)
     select $1, consultant.id, client.id, $4
     from users consultant
     cross join users client
     join fiteatsy_clients fc on fc.account_user_id = client.id
       and fc.deleted_at is null and lower(coalesce(fc.status, '')) = 'active'
     where consultant.id = $2 and client.id = $3
       and consultant.deleted_at is null and client.deleted_at is null
       and lower(coalesce(consultant.status, '')) = 'active'
       and lower(coalesce(client.status, '')) = 'active'
       and lower(coalesce(consultant.role, '')) in ('consultant', 'provider', 'dietician', 'senior_consultant')
       and lower(coalesce(client.role, 'user')) = 'user'
     on conflict (consultant_user_id, client_user_id, scope) where status = 'active'
     do update set updated_at = now()
     returning id, consultant_user_id, client_user_id, status, scope, created_at`,
    [crypto.randomUUID(), input.consultantUserId, input.clientUserId, input.actorUserId]
  );
  if (!result.rowCount) return null;
  const assignment = result.rows[0];
  await pool.query(
    `update health_profiles set assigned_consultant_id = $1, updated_at = now(), version = version + 1
     where user_id = $2 and deleted_at is null`,
    [input.consultantUserId, input.clientUserId]
  );
  await pool.query(
    `update care_cases set assigned_consultant_id = $1, updated_at = now(), version = version + 1
     where user_id = $2 and deleted_at is null`,
    [input.consultantUserId, input.clientUserId]
  );
  return assignment;
};
