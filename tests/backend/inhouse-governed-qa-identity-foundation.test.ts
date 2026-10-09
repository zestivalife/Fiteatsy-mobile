import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.cwd(), '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const repository = read('backend/src/modules/admin/qa-provisioning.repository.ts');
const routes = read('backend/src/modules/admin/delegated.routes.ts');
const auth = read('backend/src/modules/auth/auth.repository.ts');
const migration = read('backend/src/db/migrations/0094_inhouse_governed_qa_identity_links.sql');

const roles = ['user','consultant','provider','dietician','senior_consultant','practitioner','mentor','admin','super_admin','platform_owner'];

test('governed QA provisioner supports the complete canonical role matrix', () => {
  for (const role of roles) assert.match(repository, new RegExp(`['\"]${role}['\"]`));
  assert.match(repository, /super_admin' \|\| role === 'platform_owner'\) return null/);
  assert.match(repository, /input\.role === 'admin' \? 'STAFF'/);
  assert.match(repository, /account_purpose, version/);
  assert.match(repository, /'QA_TEST'/);
});

test('explicit identity link is one-to-one, active and expand-safe', () => {
  assert.match(migration, /auth_identity_id uuid not null unique/);
  assert.match(migration, /application_user_id text not null unique/);
  assert.match(migration, /fixture_key text not null unique/);
  assert.match(migration, /GOVERNED_QA_INHOUSE/);
  assert.doesNotMatch(migration, /update users|backfill/i);
});

test('JWT bridge gives explicit governed QA linkage precedence without email dependence', () => {
  assert.match(auth, /from inhouse_qa_identity_links/);
  assert.match(auth, /auth_identity_id\s*=\s*\$1/);
  assert.match(auth, /account_purpose\) !== 'QA_TEST'/);
  assert.match(auth, /explicitQaLink/);
  assert.match(auth, /explicitQaLink \|\| externalOwner \? null : input\.bridgeEmail/);
});

test('auth me serialises governed staff bridge sessions without a client row', () => {
  const authRoutes = read('backend/src/modules/auth/auth.routes.ts');
  assert.match(authRoutes, /client:\s*account\.client\s*\?/);
  assert.match(authRoutes, /:\s*null,/);
});

test('auth role aliases normalize to canonical governed application roles', () => {
  assert.match(auth, /role === 'organization_admin'\) return 'admin'/);
  assert.match(auth, /role === 'member'\) return 'user'/);
  assert.match(auth, /normalizeConsultantDashboardBridgeRole\(/);
});

test('provisioning surface is delegated, purpose-bound and platform-owner-only', () => {
  assert.match(routes, /qa-inhouse-identities\/provision/);
  assert.match(routes, /fiteatsy\.qa\.identity\.create', 'qa_provisioning', 'platform_owner'/);
  assert.match(routes, /IDEMPOTENCY_KEY_REQUIRED/);
  assert.match(routes, /GOVERNED_QA_INHOUSE/);
});

test('provisioning is transactional and idempotent without credential behavior', () => {
  assert.match(repository, /await client\.query\('begin'\)/);
  assert.match(repository, /pg_advisory_xact_lock/);
  assert.match(repository, /on conflict \(fixture_key\) do update/);
  assert.match(repository, /await client\.query\('rollback'\)/);
  assert.doesNotMatch(repository, /password|credential/i);
});
