import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../backend/src/db/migrations/0071_assignable_fiteatsy_identity_backfill.sql', import.meta.url), 'utf8');

test('backfill is limited to active app-client roles and never mutates users', () => {
  assert.match(migration, /lower\(coalesce\(u\.status, ''\)\) = 'active'/);
  assert.match(migration, /lower\(coalesce\(u\.role, 'user'\)\) in \('user', 'client'\)/);
  assert.match(migration, /u\.deleted_at is null/);
  assert.doesNotMatch(migration, /update\s+users|delete from users|truncate/i);
});

test('professional backfill permits care roles and excludes administrators', () => {
  for (const role of ['consultant', 'provider', 'dietician', 'senior_consultant', 'practitioner', 'mentor']) assert.match(migration, new RegExp(`'${role}'`));
  assert.doesNotMatch(migration, /'admin'|'super_admin'|'platform_owner'/);
});

test('backfill is additive and preserves every existing membership and client', () => {
  assert.match(migration, /on conflict \(account_user_id\) do nothing/);
  assert.match(migration, /on conflict \(tenant_id, user_id\) do nothing/g);
  assert.doesNotMatch(migration, /on conflict[\s\S]*do update/i);
  assert.doesNotMatch(migration, /delete from|truncate|update\s+tenant_memberships|update\s+fiteatsy_clients/i);
});

test('home tenant is resolved by governed identity rather than an embedded id', () => {
  assert.match(migration, /slug = 'zestiva'/);
  assert.match(migration, /tenant_type = 'ZESTIVA_INTERNAL'/);
  assert.doesNotMatch(migration, /00000000-0000-4000-8000-000000000001/);
});
