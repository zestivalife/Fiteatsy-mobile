import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path:string)=>fs.readFileSync(new URL(`../../${path}`,import.meta.url),'utf8');

test('expand migration creates deterministic Zestiva tenant and additive nullable ownership',()=>{
  const migration=read('backend/src/db/migrations/0082_multi_tenant_expand_backfill.sql');
  assert.match(migration,/create table if not exists tenants/);
  assert.match(migration,/create table if not exists tenant_memberships/);
  assert.match(migration,/create table if not exists tenant_settings/);
  assert.match(migration,/00000000-0000-4000-8000-000000000001/);
  assert.match(migration,/add column if not exists tenant_id uuid/);
  assert.doesNotMatch(migration,/alter column tenant_id set not null/i);
  assert.match(migration,/tenant_backfill_verification/);
  assert.match(migration,/if new\.tenant_id is null and exists/);
});

test('tenant request projection resolves only active server-side membership',()=>{
  const source=read('backend/src/modules/tenancy/tenant-context.ts');
  assert.match(source,/membership\.user_id=\$1/);
  assert.match(source,/membership\.status='active'/);
  assert.match(source,/tenant\.status='active'/);
  assert.doesNotMatch(source,/req\.(body|query).*tenant/i);
});

test('dual-read helper never permits a mismatched tenant and legacy requires prior sealed access',async()=>{
  const {assertTenantResourceScope}=await import('../../backend/src/modules/tenancy/tenant-context.ts');
  const context={tenantId:'tenant-a',tenantName:'A',tenantType:'PRACTICE' as const,currentMembershipRole:'CONSULTANT' as const};
  assert.equal(assertTenantResourceScope(context,'tenant-a',false),true);
  assert.equal(assertTenantResourceScope(context,'tenant-b',true),false);
  assert.equal(assertTenantResourceScope(context,null,false),false);
  assert.equal(assertTenantResourceScope(context,null,true),true);
});

test('sealed assignment and Senior review authorities are not replaced',()=>{
  const server=read('backend/src/server.ts');
  const senior=read('backend/src/modules/nutrition/nutrition.service.ts');
  assert.match(server,/requireConsultantClientAssignment/);
  assert.match(senior,/allowSeniorAuthority/);
});

test('migrated Consultant access requires assignment, matching resource tenant, and both memberships',()=>{
  const repository=read('backend/src/modules/consultant-access/consultant-access.repository.ts');
  assert.match(repository,/assignment\.tenant_id = client\.tenant_id/);
  assert.match(repository,/consultant_membership\.tenant_id = assignment\.tenant_id/);
  assert.match(repository,/consultant_membership\.user_id = assignment\.consultant_user_id/);
  assert.match(repository,/client_membership\.user_id = assignment\.client_user_id/);
  assert.match(repository,/assignment\.tenant_id is null/);
});
