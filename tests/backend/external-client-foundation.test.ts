import assert from 'node:assert/strict';import fs from 'node:fs';import test from 'node:test';
const migration=fs.readFileSync(new URL('../../backend/src/db/migrations/0089_external_consultant_clients.sql',import.meta.url),'utf8');const repository=fs.readFileSync(new URL('../../backend/src/modules/external-clients/external-clients.repository.ts',import.meta.url),'utf8');const routes=fs.readFileSync(new URL('../../backend/src/modules/external-clients/external-clients.routes.ts',import.meta.url),'utf8');const auth=fs.readFileSync(new URL('../../backend/src/modules/auth/auth.middleware.ts',import.meta.url),'utf8');
test('external client is tenant-owned without auth or membership coupling',()=>{assert.match(migration,/create table if not exists external_clients/);assert.match(migration,/tenant_id uuid not null references tenants/);assert.doesNotMatch(migration,/account_user_id/);});
test('same-tenant duplicate contacts are rejected',()=>{assert.match(migration,/external_clients\(tenant_id,mobile_normalized\)/);assert.match(migration,/external_clients\(tenant_id,email_normalized\)/);assert.match(repository,/EXTERNAL_CLIENT_DUPLICATE_CONTACT/);});
test('reads and mutations derive and enforce tenant scope',()=>{assert.match(repository,/resolveActiveTenantContext\(account\)/);assert.match(repository,/tenant_id=\$1/);assert.match(repository,/where id=\$1 and tenant_id=\$2/);assert.match(repository,/tenantType==='ZESTIVA_INTERNAL'/);});
test('manual creation has explicit lifecycle, provenance, and audit',()=>{assert.match(repository,/'ACTIVE','NOT_STARTED','CONSULTANT_ENTERED'/);assert.match(migration,/CLIENT_CREATED.*CLIENT_UPDATED.*CLIENT_STATUS_CHANGED/);assert.match(routes,/post\('\/'/);assert.match(routes,/patch\('\/:id'/);});
test('dashboard session scope narrowly admits external clients',()=>{assert.match(auth,/externalClientRouteAllowed/);assert.match(auth,/startsWith\('\/v1\/external\/clients'\)/);});
test('dashboard session scope admits only GET auth me for canonical tenant resolution',()=>{
  assert.match(auth,/tenantContextRouteAllowed = req\.method === 'GET'/);
  assert.match(auth,/\^\\\/v1\\\/auth\\\/me\(\?:\$\|\[\?#\]\)/);
  assert.match(auth,/!tenantContextRouteAllowed/);
  assert.doesNotMatch(auth,/startsWith\('\/v1\/auth'\)/);
});
