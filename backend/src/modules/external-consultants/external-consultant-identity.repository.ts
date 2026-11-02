import { pool } from '../../db/pool.js';

export type ConsultantIdentityResolution =
  | { status: 'RESOLVED'; applicationUserId: string; source: 'EXTERNAL_CONSULTANT_SIGNUP' | 'NATIVE_ACCOUNT'; tenantId: string | null }
  | { status: 'AMBIGUOUS'; applicationUserId: null; source: 'EXTERNAL_CONSULTANT_SIGNUP'; tenantId: null }
  | { status: 'INACTIVE'; applicationUserId: null; source: 'EXTERNAL_CONSULTANT_SIGNUP'; tenantId: null };

/** Resolve an Auth subject to the Fiteatsy user used by assignments. */
export const resolveConsultantApplicationIdentity = async (
  authIdentityId: string,
  nativeAccountId: string,
): Promise<ConsultantIdentityResolution> => {
  const schema = await pool.query<{ available: boolean }>(
    "select to_regclass('public.external_consultant_signups') is not null as available",
  );
  if (schema.rows[0]?.available !== true) {
    return { status: 'RESOLVED', applicationUserId: nativeAccountId, source: 'NATIVE_ACCOUNT', tenantId: null };
  }
  const linked = await pool.query(
    `select signup.fiteatsy_user_id, signup.tenant_id, professional.status, professional.deleted_at
       from external_consultant_signups signup
       left join users professional on professional.id = signup.fiteatsy_user_id
      where signup.auth_identity_id::text = $1
        and signup.signup_state = 'READY'
      order by signup.updated_at desc
      limit 2`,
    [authIdentityId],
  );
  if ((linked.rowCount ?? 0) > 1) return { status: 'AMBIGUOUS', applicationUserId: null, source: 'EXTERNAL_CONSULTANT_SIGNUP', tenantId: null };
  if (linked.rowCount === 1) {
    const row = linked.rows[0];
    if (row.deleted_at != null || String(row.status ?? '').toLowerCase() !== 'active') {
      return { status: 'INACTIVE', applicationUserId: null, source: 'EXTERNAL_CONSULTANT_SIGNUP', tenantId: null };
    }
    return { status: 'RESOLVED', applicationUserId: String(row.fiteatsy_user_id), source: 'EXTERNAL_CONSULTANT_SIGNUP', tenantId: String(row.tenant_id) };
  }
  return { status: 'RESOLVED', applicationUserId: nativeAccountId, source: 'NATIVE_ACCOUNT', tenantId: null };
};
