import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('consultant access is assignment-scoped, product-scoped, policy-versioned, and fail-closed', () => {
  const repository = read('backend/src/modules/consultant-access/consultant-access.repository.ts');

  assert.match(repository, /consent\.assignment_id = assignment\.id/);
  assert.match(repository, /consent\.consultant_user_id = assignment\.consultant_user_id/);
  assert.match(repository, /consent\.user_id = assignment\.client_user_id/);
  assert.match(repository, /consent\.product = assignment\.product/);
  assert.match(repository, /consent\.status = 'GRANTED'/);
  assert.match(repository, /CONSULTANT_ACCESS_POLICY_VERSION/);
  assert.match(repository, /assignment\.professional_type = 'CONSULTANT'/);
});

test('migration preserves legacy rows without converting them into relationship grants', () => {
  const migration = read('backend/src/db/migrations/0081_assignment_scoped_consultant_access.sql');

  assert.match(migration, /assignment_id uuid references consultant_client_assignments\(id\)/);
  assert.match(migration, /consultant_user_id text references users\(id\)/);
  assert.match(migration, /product text not null default 'FITEATSY'/);
  assert.match(migration, /consultant_access_consent_events/);
  assert.doesNotMatch(migration, /update\s+consultant_access_consents[\s\S]+status\s*=\s*'GRANTED'/i);
});

test('roster, client workspace, and client context reuse the canonical access predicate', () => {
  const roster = read('backend/src/modules/consultants/consultants.repository.ts');
  const client360 = read('backend/src/modules/consultants/client360.repository.ts');

  assert.match(roster, /consultantAccessSqlPredicate/);
  assert.match(client360, /consultantAccessSqlPredicate/);
});

test('nutrition access preserves assignment-first denial semantics without senior-consultant bypass', () => {
  const repository = read('backend/src/modules/consultant-access/consultant-access.repository.ts');
  const nutrition = read('backend/src/modules/nutrition/nutrition.service.ts');
  const commonFood = read('backend/src/modules/nutrition/common-food-consultant.service.ts');

  assert.match(repository, /reason: 'CLIENT_ASSIGNMENT_REQUIRED'/);
  assert.match(repository, /reason: 'CONSULTANT_ACCESS_CONSENT_REQUIRED'/);
  assert.match(repository, /left join consultant_access_consents consent/);
  assert.match(nutrition, /resolveConsultantClientAccess\(account\.accountId, publicClientId\)/);
  assert.match(nutrition, /_options: \{ allowSeniorAuthority\?: boolean \} = \{\},[\s\S]+resolveConsultantNutritionClientAccess\(publicClientId, account\)/);
  assert.match(commonFood, /new CommonFoodApiError\(access\.reason,403\)/);
});

test('mobile consent decisions identify the exact assignment and expose grant and revoke controls', () => {
  const service = read('src/services/consultantConsentService.ts');
  const screen = read('src/screens/profile/PrivacyConsentScreen.tsx');
  const prompt = read('src/components/ConsultantAccessPrompt.tsx');

  assert.match(service, /assignmentId: string/);
  assert.match(service, /'GRANTED' \| 'REVOKED'/);
  assert.match(screen, /Allow access/);
  assert.match(screen, /Revoke access/);
  assert.match(prompt, /Not now/);
  assert.match(prompt, /dataCategories/);
});
