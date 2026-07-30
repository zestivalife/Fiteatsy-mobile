import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateDatabase, resetMigrationStateForTests } from '../../backend/src/db/migrator.js';
import { pool } from '../../backend/src/db/pool.js';
import {
  countClients,
  createOrResolveClientForAccount,
  getClientByFiteatsyClientId,
  resolveCurrentClientForAccount
} from '../../backend/src/modules/client/client.repository.js';
import { resolveVerifiedAccountIdentity } from '../../backend/src/modules/auth/auth.repository.js';
import { resetBackendStateForTests } from '../../backend/src/test-support/reset.js';

const CLIENT_MIGRATION_FILE = '0002_m3a_client_identity_foundation.sql';

test.beforeEach(async () => {
  await resetBackendStateForTests();
});

test('client repository creates a stable one-to-one client identity for a verified account', async () => {
  const resolved = await resolveVerifiedAccountIdentity({
    name: 'Client Repo User',
    email: 'client-repo@example.com',
    mobileNumber: '+919876543298'
  });

  const currentClient = await resolveCurrentClientForAccount(resolved.user.id);
  const idempotentClient = await createOrResolveClientForAccount(resolved.user.id);
  const byPublicId = await getClientByFiteatsyClientId(resolved.client.fiteatsyClientId);

  assert.equal(resolved.client.id, currentClient.id);
  assert.equal(currentClient.id, idempotentClient.id);
  assert.equal(currentClient.fiteatsyClientId, idempotentClient.fiteatsyClientId);
  assert.equal(currentClient.accountUserId, resolved.user.id);
  assert.equal(currentClient.version, 1);
  assert.equal(byPublicId?.accountUserId, resolved.user.id);
  assert.equal(await countClients(), 1);
});

test('migration backfills one client for an existing account and records the migration', async () => {
  const timestamp = new Date().toISOString();
  await pool.query(
    `
      insert into users (
        id,
        name,
        email_normalized,
        mobile_number_normalized,
        email_verified_at,
        mobile_verified_at,
        status,
        version,
        last_login_at,
        created_at,
        updated_at
      ) values ($1, $2, $3, $4, $5, $5, 'active', 1, $5, $5, $5)
    `,
    ['legacy-account-user', 'Legacy User', 'legacy@example.com', '+919876543297', timestamp]
  );

  await pool.query('drop table if exists fiteatsy_clients cascade');
  await pool.query('delete from schema_migrations where version = $1', [CLIENT_MIGRATION_FILE]);

  resetMigrationStateForTests();
  await migrateDatabase();

  const currentClient = await resolveCurrentClientForAccount('legacy-account-user');
  const migrationRow = await pool.query(
    'select version from schema_migrations where version = $1',
    [CLIENT_MIGRATION_FILE]
  );

  assert.match(currentClient.fiteatsyClientId, /^fc_[a-f0-9]{32}$/i);
  assert.equal(currentClient.accountUserId, 'legacy-account-user');
  assert.equal(await countClients(), 1);
  assert.equal(migrationRow.rowCount, 1);
});
