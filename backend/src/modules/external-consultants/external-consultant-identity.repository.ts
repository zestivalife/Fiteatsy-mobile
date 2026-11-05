import { pool } from '../../db/pool.js';

export type ConsultantIdentityResolution =
  | { status: 'RESOLVED'; applicationUserId: string; source: 'EXTERNAL_CONSULTANT_SIGNUP' | 'NATIVE_ACCOUNT' }
  | { status: 'AMBIGUOUS' | 'INACTIVE'; applicationUserId: null; source: 'EXTERNAL_CONSULTANT_SIGNUP' };

/** Resolve the Auth identity to the Fiteatsy user referenced by assignments. */
export const resolveConsultantApplicationIdentity = async (
  authIdentityId: string,
  nativeAccountId: string,
): Promise<ConsultantIdentityResolution> => {
  const schema = await pool.query<{ available: boolean }>(
    "select to_regclass('public.external_consultant_signups') is not null as available",
  );
  if (schema.rows[0]?.available !== true) {
    return { status: 'RESOLVED', applicationUserId: nativeAccountId, source: 'NATIVE_ACCOUNT' };
  }

  const linked = await pool.query(
    `select signup.fiteatsy_user_id, signup.signup_state, professional.status, professional.deleted_at
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
  if (activeLinks.length > 1) {
    return { status: 'AMBIGUOUS', applicationUserId: null, source: 'EXTERNAL_CONSULTANT_SIGNUP' };
  }
  if (activeLinks.length === 1) {
    return {
      status: 'RESOLVED',
      applicationUserId: String(activeLinks[0].fiteatsy_user_id),
      source: 'EXTERNAL_CONSULTANT_SIGNUP',
    };
  }
  if ((linked.rowCount ?? 0) > 0) {
    return { status: 'INACTIVE', applicationUserId: null, source: 'EXTERNAL_CONSULTANT_SIGNUP' };
  }
  return { status: 'RESOLVED', applicationUserId: nativeAccountId, source: 'NATIVE_ACCOUNT' };
};
