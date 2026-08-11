import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
const SUPPORTED_ROLES = new Set(['user', 'consultant', 'admin']);
export const isManagedRole = (role) => SUPPORTED_ROLES.has(role);
const normalizeMobile = (mobile) => mobile.trim().replace(/\D/g, '');
const mapAuditEvent = (row) => ({
    id: String(row.id),
    performedByUserId: row.performed_by_user_id == null ? null : String(row.performed_by_user_id),
    targetUserId: String(row.target_user_id),
    oldRole: row.old_role == null ? null : String(row.old_role),
    newRole: String(row.new_role),
    reason: row.reason == null ? null : String(row.reason),
    createdAtISO: new Date(String(row.created_at)).toISOString()
});
export const assignUserRole = async (input) => {
    const client = await pool.connect();
    try {
        await client.query('begin');
        const target = await client.query(`
        select id, role
        from users
        where id = $1
          and deleted_at is null
        for update
      `, [input.targetUserId]);
        if (target.rowCount === 0) {
            await client.query('rollback');
            return null;
        }
        const oldRole = target.rows[0].role == null ? null : String(target.rows[0].role);
        const timestamp = new Date().toISOString();
        const updated = await client.query(`
        update users
        set
          role = $2,
          updated_at = $3,
          version = version + 1
        where id = $1
          and deleted_at is null
        returning id, role
      `, [input.targetUserId, input.role, timestamp]);
        const audit = await client.query(`
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
      `, [
            crypto.randomUUID(),
            input.performedByUserId,
            input.targetUserId,
            oldRole,
            input.role,
            input.reason?.trim() || null,
            timestamp
        ]);
        await client.query('commit');
        return {
            userId: String(updated.rows[0].id),
            role: String(updated.rows[0].role),
            auditEvent: mapAuditEvent(audit.rows[0])
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
export const countRoleAuditEventsByReason = async (reason) => {
    const result = await pool.query(`
      select count(*)::int as count
      from role_audit_events
      where reason = $1
    `, [reason]);
    return Number(result.rows[0]?.count ?? 0);
};
export const countActiveAdmins = async () => {
    const result = await pool.query(`
      select count(*)::int as count
      from users
      where deleted_at is null
        and status = 'active'
        and role = 'admin'
    `);
    return Number(result.rows[0]?.count ?? 0);
};
export const findActiveUserIdByMobile = async (mobile) => {
    const canonical = normalizeMobile(mobile);
    const national = canonical.startsWith('91') && canonical.length === 12 ? canonical.slice(2) : canonical;
    const result = await pool.query(`
      select id
      from users
      where deleted_at is null
        and status = 'active'
        and (
          regexp_replace(coalesce(mobile_number_normalized, ''), '[^0-9]', '', 'g') = $1
          or regexp_replace(coalesce(mobile_number_normalized, ''), '[^0-9]', '', 'g') = $2
          or right(regexp_replace(coalesce(mobile_number_normalized, ''), '[^0-9]', '', 'g'), 10) = $2
        )
      order by created_at asc
      limit 1
    `, [canonical, national]);
    return result.rowCount === 0 ? null : String(result.rows[0].id);
};
