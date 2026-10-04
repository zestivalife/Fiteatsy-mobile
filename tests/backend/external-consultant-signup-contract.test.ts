import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { canonicalExternalMobile } from '../../backend/src/modules/external-signup/external-signup.repository.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

test('P0.2 migration remains additive to frozen P0.1 tenant authority', () => {
  const migration = read('backend/src/db/migrations/0085_external_consultant_signup.sql');
  assert.match(migration, /references tenants\(id\)/);
  assert.match(migration, /references tenant_memberships\(id\)/);
  assert.doesNotMatch(migration, /alter table tenants/i);
  assert.doesNotMatch(migration, /alter table tenant_memberships/i);
  assert.doesNotMatch(migration, /create table if not exists tenants/i);
});

test('delegated provisioning is server-authoritative, replay protected and idempotent', () => {
  const routes = read('backend/src/modules/admin/delegated.routes.ts');
  assert.match(routes, /fiteatsy\.external\.signup\.provision/);
  assert.match(routes, /external_consultant_signup/);
  assert.match(routes, /consultant_auth_service/);
  assert.match(routes, /IDEMPOTENCY_KEY_REQUIRED/);
  assert.doesNotMatch(routes, /tenantId:\s*z\./);
});

test('tenant and OWNER membership are provisioned together without a Zestiva fallback', () => {
  const repository = read('backend/src/modules/external-signup/external-signup.repository.ts');
  assert.match(repository, /insert into tenants/);
  assert.match(repository, /insert into tenant_memberships/);
  assert.match(repository, /'OWNER','active'/);
  assert.match(repository, /await client\.query\('begin'\)/);
  assert.match(repository, /await client\.query\('commit'\)/);
  assert.doesNotMatch(repository, /ZESTIVA_TENANT_ID|ensureCanonicalZestivaMembership/);
});

test('external JWT bridge resolves canonical external OWNER while legacy bridge keeps Zestiva fallback', () => {
  const authRepository = read('backend/src/modules/auth/auth.repository.ts');
  assert.match(authRepository, /from external_consultant_signups/);
  assert.match(authRepository, /tenant_role='OWNER'/);
  assert.match(authRepository, /status='active'/);
  assert.match(authRepository, /if \(externalOwner\)/);
  assert.match(authRepository, /else \{\s*await ensureCanonicalZestivaMembership/s);
});

test('external mobile identities use the frozen digits-only canonical format', () => {
  assert.equal(canonicalExternalMobile('+91 97620-06688'), '919762006688');
  assert.equal(canonicalExternalMobile('9762006688'), '919762006688');
  assert.equal(canonicalExternalMobile(undefined), null);
});

test('external signup migration and repository share the canonical normalized identity columns', () => {
  const migration = read('backend/src/db/migrations/0085_external_consultant_signup.sql');
  const repository = read('backend/src/modules/external-signup/external-signup.repository.ts');

  for (const column of ['email_normalized', 'mobile_number_normalized']) {
    assert.match(migration, new RegExp(`\\b${column}\\b`));
    assert.match(repository, new RegExp(`\\b${column}\\b`));
  }

  assert.doesNotMatch(migration, /\bnormalized_email\b|\bnormalized_mobile_number\b/);
  assert.doesNotMatch(repository, /\bnormalized_email\b|\bnormalized_mobile_number\b/);
  assert.match(migration, /external_consultant_signups_email_unique[\s\S]*lower\(email_normalized\)/);
  assert.match(migration, /external_consultant_signups_mobile_unique[\s\S]*mobile_number_normalized/);
});

test('owner membership replay persists the canonical existing membership id', () => {
  const repository = read('backend/src/modules/external-signup/external-signup.repository.ts');
  assert.match(repository, /select id from tenant_memberships where tenant_id=\$1 and user_id=\$2/);
  assert.match(repository, /persistedMembershipId/);
  assert.match(repository, /OWNER_MEMBERSHIP_NOT_CREATED/);
});

test('onboarding persists explicit resumable completion fields without marking the workspace ready', () => {
  const migration = read('backend/src/db/migrations/0085_external_consultant_signup.sql');
  assert.match(migration, /account_type_complete boolean not null/);
  assert.match(migration, /professional_details_complete boolean not null/);
  assert.match(migration, /practice_details_complete boolean not null/);
  assert.match(migration, /workspace_ready boolean not null default false/);
});
