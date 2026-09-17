import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(new URL('../../backend/src/db/migrations/0079_consultant_client360_operations.sql', import.meta.url), 'utf8');
const server = readFileSync(new URL('../../backend/src/server.ts', import.meta.url), 'utf8');
const repository = readFileSync(new URL('../../backend/src/modules/consultants/client360.repository.ts', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../../backend/src/modules/consultants/client360.routes.ts', import.meta.url), 'utf8');
const directoryRoutes = readFileSync(new URL('../../backend/src/modules/consultants/consultants.routes.ts', import.meta.url), 'utf8');

test('Client 360 actor references use the canonical TEXT users.id type', () => {
  for (const column of ['created_by', 'updated_by', 'actor_id', 'consultant_id']) {
    assert.match(migration, new RegExp(`${column}\\s+text`, 'i'));
  }
  assert.doesNotMatch(migration, /(created_by|updated_by|actor_id|consultant_id)\s+uuid/i);
});

test('Client 360 is mounted behind the existing client assignment and consent guard', () => {
  const guardIndex = server.indexOf("app.use('/v1/consultants/clients/:clientId',requireAuthenticatedAccount,requireConsultantClientAssignment,requireGrantedConsultantAccess)");
  const routeIndex = server.indexOf("app.use('/v1/consultants', consultantClient360Router)");
  assert.ok(guardIndex >= 0, 'client guard middleware must exist');
  assert.ok(routeIndex > guardIndex, 'Client 360 router must be mounted after client guard middleware');
});

test('operation mutations enforce idempotency and optimistic concurrency', () => {
  assert.match(routes, /idempotency-key/i);
  assert.match(routes, /expectedVersion/);
  assert.match(repository, /consultant_client_operation_idempotency where actor_id = \$1 and idempotency_key = \$2/i);
  assert.match(repository, /version=version\+1/i);
  assert.match(repository, /kind: 'conflict'/);
});

test('client directory validates server-side search, sort, filters and pagination', () => {
  assert.match(directoryRoutes, /clientDirectoryQuerySchema/);
  assert.match(directoryRoutes, /pageSize/);
  assert.match(directoryRoutes, /sort/);
  assert.match(directoryRoutes, /status/);
});
