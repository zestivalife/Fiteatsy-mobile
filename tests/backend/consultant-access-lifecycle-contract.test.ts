import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('historical consultant consent records remain assignment-scoped and auditable', () => {
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

test('roster and every Client 360 context share the same active-assignment authority', () => {
  const roster = read('backend/src/modules/consultants/consultants.repository.ts');
  const client360 = read('backend/src/modules/consultants/client360.repository.ts');

  assert.match(roster, /from consultant_client_assignments assignment/);
  assert.match(roster, /assignment\.status = 'active'/);
  assert.match(roster, /HEALTH_ACCESS_REQUIRED/);
  assert.match(roster, /const protectedClientSelect/);
  assert.match(roster, /consultantAssignmentSqlPredicate/);
  assert.doesNotMatch(roster, /join consultant_access_consents consent/);
  assert.doesNotMatch(client360, /consultant_access_consents/);
});

test('nutrition access uses active assignment without a consent business gate or senior-consultant bypass', () => {
  const repository = read('backend/src/modules/consultant-access/consultant-access.repository.ts');
  const nutrition = read('backend/src/modules/nutrition/nutrition.service.ts');
  const routes = read('backend/src/modules/nutrition/nutrition.routes.ts');
  const commonFood = read('backend/src/modules/nutrition/common-food-consultant.service.ts');

  assert.match(repository, /reason: 'CLIENT_ASSIGNMENT_REQUIRED'/);
  assert.doesNotMatch(repository, /reason: 'CONSULTANT_ACCESS_CONSENT_REQUIRED'/);
  assert.match(repository, /consultantAssignmentSqlPredicate/);
  assert.match(nutrition, /resolveConsultantClientAccess\(account\.accountId, publicClientId\)/);
  assert.match(nutrition, /_options: \{ allowSeniorAuthority\?: boolean \} = \{\},[\s\S]+resolveConsultantNutritionClientAccess\(publicClientId, account\)/);
  assert.match(routes, /const access = await resolveConsultantNutritionClientAccess\(String\(req\.params\.clientId\), account\)/);
  assert.match(routes, /error: access\.reason/);
  assert.doesNotMatch(routes, /if \(!await canAccessConsultantNutritionClient\(String\(req\.params\.clientId\), account,[\s\S]+error: 'CLIENT_ASSIGNMENT_REQUIRED'/);
  assert.match(commonFood, /new CommonFoodApiError\(access\.reason,403\)/);
});

test('legacy mobile consent preferences remain auditable but are not Consultant workspace authority', () => {
  const service = read('src/services/consultantConsentService.ts');
  const screen = read('src/screens/profile/PrivacyConsentScreen.tsx');
  const prompt = read('src/components/ConsultantAccessPrompt.tsx');

  assert.match(service, /assignmentId: string/);
  assert.match(service, /'GRANTED' \| 'REVOKED'/);
  assert.match(screen, /Allow access/);
  assert.match(screen, /Revoke access/);
  assert.match(prompt, /Not now/);
  assert.match(prompt, /dataCategories/);
  const repository = read('backend/src/modules/consultant-access/consultant-access.repository.ts');
  assert.doesNotMatch(
    repository.match(/export const resolveConsultantClientAccess[\s\S]*?^};/m)?.[0] || '',
    /consultant_access_consents|CONSULTANT_ACCESS_CONSENT_REQUIRED/
  );
});
