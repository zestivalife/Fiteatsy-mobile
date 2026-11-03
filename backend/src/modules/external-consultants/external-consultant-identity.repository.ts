import { pool } from '../../db/pool.js';

export type ConsultantIdentityResolution =
  | { status: 'RESOLVED'; applicationUserId: string; source: 'AUTH_TOKEN' | 'EXTERNAL_CONSULTANT_SIGNUP' | 'NATIVE_ACCOUNT'; tenantId: string | null }
  | { status: 'AMBIGUOUS'; applicationUserId: null; source: 'EXTERNAL_CONSULTANT_SIGNUP'; tenantId: null }
  | { status: 'INACTIVE'; applicationUserId: null; source: 'EXTERNAL_CONSULTANT_SIGNUP' | 'AUTH_TOKEN'; tenantId: null }
  | { status: 'TENANT_MISMATCH'; applicationUserId: null; source: 'EXTERNAL_CONSULTANT_SIGNUP'; tenantId: null };

/** Resolve an Auth subject to the Fiteatsy user used by assignments. */
export const resolveConsultantApplicationIdentity = async (
  authIdentityId: string,
  nativeAccountId: string,
  governedApplicationUserId?: string,
  authorizedTenantId?: string,
): Promise<ConsultantIdentityResolution> => {
  const schema = await pool.query<{ available: boolean }>(
    "select to_regclass('public.external_consultant_signups') is not null as available",
  );
  if (schema.rows[0]?.available !== true) {
    return { status: 'RESOLVED', applicationUserId: nativeAccountId, source: 'NATIVE_ACCOUNT', tenantId: null };
  }
  const linked = await pool.query(
    `select signup.fiteatsy_user_id, signup.tenant_id, signup.signup_state, professional.status, professional.deleted_at
       from external_consultant_signups signup
       left join users professional on professional.id = signup.fiteatsy_user_id
      where signup.auth_identity_id::text = $1
      order by signup.updated_at desc`,
    [authIdentityId],
  );
  const activeLinks = linked.rows.filter((row) =>
    String(row.signup_state ?? '').toUpperCase() === 'READY'
      && row.deleted_at == null
      && String(row.status ?? '').toLowerCase() === 'active',
  );
  if (activeLinks.length > 1) return { status: 'AMBIGUOUS', applicationUserId: null, source: 'EXTERNAL_CONSULTANT_SIGNUP', tenantId: null };
  if (activeLinks.length === 1) {
    const row = activeLinks[0];
    const tenantId = row.tenant_id == null ? null : String(row.tenant_id);
    if (authorizedTenantId && tenantId !== authorizedTenantId) {
      return { status: 'TENANT_MISMATCH', applicationUserId: null, source: 'EXTERNAL_CONSULTANT_SIGNUP', tenantId: null };
    }
    return { status: 'RESOLVED', applicationUserId: String(row.fiteatsy_user_id), source: 'EXTERNAL_CONSULTANT_SIGNUP', tenantId };
  }
  if ((linked.rowCount ?? 0) > 0) {
    return { status: 'INACTIVE', applicationUserId: null, source: 'EXTERNAL_CONSULTANT_SIGNUP', tenantId: null };
  }
  if (governedApplicationUserId) {
    const asserted = await pool.query(
      `select id from users where id = $1 and deleted_at is null and lower(status) = 'active' limit 1`,
      [governedApplicationUserId],
    );
    if (asserted.rowCount !== 1) {
      return { status: 'INACTIVE', applicationUserId: null, source: 'AUTH_TOKEN', tenantId: null };
    }
    return { status: 'RESOLVED', applicationUserId: governedApplicationUserId, source: 'AUTH_TOKEN', tenantId: null };
  }
  return { status: 'RESOLVED', applicationUserId: nativeAccountId, source: 'NATIVE_ACCOUNT', tenantId: null };
};
