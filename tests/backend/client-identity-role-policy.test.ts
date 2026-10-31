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

test('assignment mutations require an active canonical client mapping instead of inferring identity from role', () => {
  const activeClientJoins = assignmentRepository.match(/join fiteatsy_clients (?:c|fc) on (?:c|fc)\.account_user_id = (?:u|client)\.id[\s\S]{0,160}?deleted_at is null[\s\S]{0,120}?status, ''\)\) = 'active'/g) ?? [];
  assert.ok(activeClientJoins.length >= 4, 'discovery and mutation paths must require an active canonical client mapping');
  assert.doesNotMatch(assignmentRepository, /lower\(coalesce\((?:u|client)\.role, 'user'\)\) in \('user', 'client'\)/);
});

test('backfill never converts a workforce identity into a client', () => {
  const clientBackfill = backfill.split('insert into fiteatsy_clients')[1]?.split('-- Professionals need')[0] ?? '';
  assert.match(clientBackfill, /lower\(coalesce\(u\.role, 'user'\)\) in \('user', 'client'\)/);
  assert.doesNotMatch(clientBackfill, /'consultant'|'senior_consultant'|'admin'|'super_admin'|'platform_owner'/);
});
