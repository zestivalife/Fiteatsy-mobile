import assert from 'node:assert/strict';
import { pool } from '../db/pool.js';

export const ZESTIVA_INTERNAL_TENANT_ID = '00000000-0000-4000-8000-000000000001';
export const TENANT_A_ID = '00000000-0000-4000-8000-00000000000a';
export const TENANT_B_ID = '00000000-0000-4000-8000-00000000000b';

type CanonicalTenant = {
  id: string;
  name: string;
  slug: string;
  tenantType: 'ZESTIVA_INTERNAL' | 'PRACTICE';
};
const canonicalTenants: readonly CanonicalTenant[] = [
  { id: ZESTIVA_INTERNAL_TENANT_ID, name: 'Zestiva', slug: 'zestiva', tenantType: 'ZESTIVA_INTERNAL' },
  { id: TENANT_A_ID, name: 'Tenant A', slug: 'test-tenant-a', tenantType: 'PRACTICE' },
  { id: TENANT_B_ID, name: 'Tenant B', slug: 'test-tenant-b', tenantType: 'PRACTICE' },
];

export const ensureCanonicalTestTenants = async (options: { includeIsolationTenants?: boolean } = {}) => {
  const tenants = options.includeIsolationTenants ? canonicalTenants : canonicalTenants.slice(0, 1);
  for (const tenant of tenants) {
    await pool.query(
      `insert into tenants(id,name,slug,tenant_type,status,default_timezone,country,currency)
       values ($1,$2,$3,$4,'active','Asia/Kolkata','IN','INR')
       on conflict (id) do update set
         name=excluded.name,
         slug=excluded.slug,
         tenant_type=excluded.tenant_type,
         status=excluded.status,
         default_timezone=excluded.default_timezone,
         country=excluded.country,
         currency=excluded.currency,
         updated_at=now()`,
      [tenant.id, tenant.name, tenant.slug, tenant.tenantType],
    );
    await pool.query(
      `insert into tenant_settings(tenant_id)
       values ($1)
       on conflict (tenant_id) do nothing`,
      [tenant.id],
    );
  }
};

export const assertCanonicalTestTenantInvariant = async () => {
  const result = await pool.query(
    `select tenant.id,tenant.slug,tenant.tenant_type,tenant.status,
            settings.tenant_id as settings_tenant_id
       from tenants tenant
       left join tenant_settings settings on settings.tenant_id=tenant.id
      where tenant.id=$1`,
    [ZESTIVA_INTERNAL_TENANT_ID],
  );
  assert.equal(result.rowCount, 1, 'test reset invariant: canonical Zestiva tenant is missing');
  const tenant = result.rows[0];
  assert.equal(tenant.slug, 'zestiva', 'test reset invariant: canonical Zestiva slug drifted');
  assert.equal(tenant.tenant_type, 'ZESTIVA_INTERNAL', 'test reset invariant: canonical Zestiva type drifted');
  assert.equal(tenant.status, 'active', 'test reset invariant: canonical Zestiva tenant is inactive');
  assert.equal(tenant.settings_tenant_id, ZESTIVA_INTERNAL_TENANT_ID, 'test reset invariant: canonical tenant settings are missing');
};
