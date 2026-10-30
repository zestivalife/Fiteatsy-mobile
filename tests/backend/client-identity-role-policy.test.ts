import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const consultantsRepository = readFileSync(
  new URL('../../backend/src/modules/consultants/consultants.repository.ts', import.meta.url),
  'utf8',
);
const assignmentRepository = readFileSync(
  new URL('../../backend/src/modules/professional-assignments/professional-assignments.repository.ts', import.meta.url),
  'utf8',
);
const backfill = readFileSync(
  new URL('../../backend/src/db/migrations/0071_assignable_fiteatsy_identity_backfill.sql', import.meta.url),
  'utf8',
);

test('automatic client conversion uses an explicit client-role allow-list', () => {
  assert.match(consultantsRepository, /const CLIENT_ACCOUNT_ROLES = \['user', 'client'\]/);
  assert.match(consultantsRepository, /lower\(coalesce\(u\.role, 'user'\)\) in/);
  const declaration = consultantsRepository.match(/const CLIENT_ACCOUNT_ROLES = \[([^\]]+)\]/)?.[1] ?? '';
  for (const workforceRole of ['admin', 'super_admin', 'platform_owner', 'consultant', 'senior_consultant']) {
    assert.doesNotMatch(declaration, new RegExp(`['\"]${workforceRole}['\"]`));
  }
});

test('assignment mutations reject stale workforce client mappings', () => {
  const matches = assignmentRepository.match(/lower\(coalesce\((?:u|client)\.role, 'user'\)\) in \('user', 'client'\)/g) ?? [];
  assert.ok(matches.length >= 4, 'all discovery and mutation paths must enforce client account roles');
});

test('backfill never converts a workforce identity into a client', () => {
  const clientBackfill = backfill.split('insert into fiteatsy_clients')[1]?.split('-- Professionals need')[0] ?? '';
  assert.match(clientBackfill, /lower\(coalesce\(u\.role, 'user'\)\) in \('user', 'client'\)/);
  assert.doesNotMatch(clientBackfill, /'consultant'|'senior_consultant'|'admin'|'super_admin'|'platform_owner'/);
});
