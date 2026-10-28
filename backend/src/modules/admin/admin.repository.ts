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

export const FITEATSY_INTAKE_LEADS_QUERY = `
    with mobile_users as (
      select source.*,
             case
               when length(source.mobile_digits) = 12 and left(source.mobile_digits, 2) = '91' then right(source.mobile_digits, 10)
               else source.mobile_digits
             end as verified_mobile_key
        from (
          select u.*, regexp_replace(coalesce(u.mobile_number_normalized, ''), '[^0-9]', '', 'g') as mobile_digits
           from users u
           where u.deleted_at is null
             and lower(coalesce(u.role, 'user')) in ('user', 'client')
        ) source
       where length(source.mobile_digits) between 10 and 15
    ), unique_mobile_users as (
      select mobile_users.*,
             row_number() over (
               partition by verified_mobile_key
               order by created_at desc, id desc
             ) as mobile_identity_rank
        from mobile_users
    )
    select u.id as user_id, c.fiteatsy_client_id, u.name, u.email_normalized,
           u.verified_mobile_key as mobile_number_normalized,
           u.created_at, u.status, u.pin_hash is not null as has_login_pin,
           active_assignment.id as assignment_id,
           active_assignment.consultant_user_id,
           professional.name as consultant_name,
           professional.role as consultant_role
      from unique_mobile_users u
      left join fiteatsy_clients c on c.account_user_id = u.id and c.deleted_at is null
      left join lateral (
        select a.id, a.consultant_user_id
          from consultant_client_assignments a
         where a.client_user_id = u.id and a.status = 'active' and a.product = 'FITEATSY'
         order by a.updated_at desc limit 1
      ) active_assignment on true
      left join users professional on professional.id = active_assignment.consultant_user_id
     where u.mobile_identity_rank = 1
     order by u.created_at desc
  `;

export const mapFiteatsyIntakeLead = (row: Record<string, unknown>) => ({
    userId: String(row.user_id),
    clientId: row.fiteatsy_client_id == null ? null : String(row.fiteatsy_client_id),
    name: String(row.name),
    email: row.email_normalized == null ? null : String(row.email_normalized),
    mobileNumber: row.mobile_number_normalized == null ? null : String(row.mobile_number_normalized),
    registeredAtISO: new Date(String(row.created_at)).toISOString(),
    leadStatus: row.assignment_id ? 'ASSIGNED' : 'NEW',
    loginPinStatus: row.has_login_pin ? 'CONFIGURED' : 'SETUP_REQUIRED',
    assignment: row.assignment_id ? {
      assignmentId: String(row.assignment_id),
      consultantUserId: String(row.consultant_user_id),
      consultantName: row.consultant_name == null ? null : String(row.consultant_name),
      consultantRole: row.consultant_role == null ? null : String(row.consultant_role)
    } : null
  });

export const listFiteatsyIntakeLeads = async () => {
  const result = await pool.query(FITEATSY_INTAKE_LEADS_QUERY);
  return result.rows.map((row) => mapFiteatsyIntakeLead(row));
};
