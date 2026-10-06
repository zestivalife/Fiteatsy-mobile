import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const repository = readFileSync(new URL('../../backend/src/modules/external-clients/external-client360.repository.ts', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../../backend/src/modules/external-clients/external-clients.routes.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../backend/src/db/migrations/0092_external_client360_projection.sql', import.meta.url), 'utf8');

test('Client 360 is tenant-scoped, external-only, and batch projected', () => {
  assert.match(repository, /tenantType === 'ZESTIVA_INTERNAL'/);
  assert.match(repository, /'OWNER', 'CONSULTANT'/);
  assert.match(repository, /Promise\.all/);
  assert.ok((repository.match(/tenant_id=\$1 and client_id=\$2/g) || []).length >= 4);
  assert.match(repository, /client_id=\$2 and tenant_id=\$3/);
});
test('projection includes completeness, provenance, history, documents, consent and BMI', () => {
  for (const contract of ['profileCompleteness', 'missingSections', 'basicProfile', 'CLIENT_SELF_REPORTED', 'CONSULTANT_ENTERED', 'LAB_REPORT', 'SYSTEM_DERIVED', 'documents:', 'consent:', 'timeline:', 'bmi:']) assert.ok(repository.includes(contract));
});
test('Consultant editing preserves superseded history and audits categories without health values', () => {
  assert.match(migration, /external_client_profile_overrides/);
  assert.match(migration, /superseded_at/);
  assert.match(repository, /set superseded_at=now\(\)/);
  assert.match(repository, /fields: Object\.keys\(input\.values\)/);
  assert.match(repository, /JSON\.stringify\(\{ section: input\.section, fields: Object\.keys\(input\.values\) \}\)/);
});
test('Client 360 API includes scoped read, edit, timeline and document routes', () => {
  for (const endpoint of ["/:id/360", "/:id/profile", "/:id/timeline", "/:id/documents", "/:id/documents/:documentId/download"]) assert.ok(routes.includes(endpoint));
  assert.match(routes, /requireAuthenticatedAccount/);
});
