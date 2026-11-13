import type { AuthenticatedAccount } from '../auth/auth.repository.js';
import { pool } from '../../db/pool.js';
import { ExternalClientError } from './external-clients.repository.js';

type ExternalResourceAuthorityCode =
  | 'EXTERNAL_HEALTH_RECORD_AUTHORITY_REQUIRED'
  | 'EXTERNAL_BIOMARKER_AUTHORITY_REQUIRED'
  | 'EXTERNAL_REPORT_AUTHORITY_REQUIRED';

/**
 * Resolve authority from the requested tenant-owned client record instead of
 * selecting an arbitrary membership from a multi-membership account.
 *
 * `external_clients.id` is globally unique, so a successful join identifies
 * one practice unambiguously. The membership must still be active, belong to
 * that exact practice, and carry an external-practice authoring role.
 */
export const resolveExternalClientResourceAuthority = async (
  account: AuthenticatedAccount,
  clientId: string,
  authorityCode: ExternalResourceAuthorityCode,
) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientId)) {
    throw new ExternalClientError('EXTERNAL_CLIENT_NOT_FOUND', 404, 'Client not found.');
  }
  const authorised = await pool.query<{ tenant_id: string }>(
    `select client.tenant_id
       from external_clients client
       join tenants tenant
         on tenant.id=client.tenant_id
        and tenant.status='active'
        and tenant.tenant_type<>'ZESTIVA_INTERNAL'
       join tenant_memberships membership
         on membership.tenant_id=client.tenant_id
        and membership.user_id=$2
        and membership.status='active'
        and membership.tenant_role in ('OWNER','CONSULTANT')
      where client.id=$1
        and client.deleted_at is null`,
    [clientId, account.user.id],
  );

  if (authorised.rowCount === 1) return authorised.rows[0].tenant_id;

  const hasExternalPracticeAuthority = await pool.query(
    `select 1
       from tenant_memberships membership
       join tenants tenant
         on tenant.id=membership.tenant_id
        and tenant.status='active'
        and tenant.tenant_type<>'ZESTIVA_INTERNAL'
      where membership.user_id=$1
        and membership.status='active'
        and membership.tenant_role in ('OWNER','CONSULTANT')
      limit 1`,
    [account.user.id],
  );

  if (hasExternalPracticeAuthority.rowCount) {
    throw new ExternalClientError('EXTERNAL_CLIENT_NOT_FOUND', 404, 'Client not found.');
  }
  throw new ExternalClientError(authorityCode, 403, 'External practice authority is required.');
};
