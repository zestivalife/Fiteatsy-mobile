import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { migrateDatabase, resetMigrationStateForTests } from '../../backend/src/db/migrator.js';
import { getPool } from '../../backend/src/db/pool.js';
import {
  createProfessionalAssignmentsBatch,
  ReassignmentRequiredError,
} from '../../backend/src/modules/professional-assignments/professional-assignments.repository.js';

const databaseTest = process.env.DATABASE_URL ? test : test.skip;

databaseTest('batch assignment uses text-backed canonical identities atomically', async () => {
  resetMigrationStateForTests();
  await migrateDatabase();
  const pool = getPool();
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const clientA = randomUUID();
  const clientB = randomUUID();
  const isolatedClient = randomUUID();
  const professionalA = `ext_${randomUUID()}`;
  const professionalB = randomUUID();
  const actorReference = `zestiva:test-${randomUUID()}`;

  try {
    await pool.query(
      `insert into tenants (id, name, slug, tenant_type, status)
       values ($1, 'Assignment Test', $2, 'EXTERNAL_PRACTICE', 'active'),
              ($3, 'Isolated Test', $4, 'EXTERNAL_PRACTICE', 'active')`,
      [tenantId, `assignment-${tenantId}`, otherTenantId, `assignment-${otherTenantId}`],
    );
    for (const [id, name, role] of [
      [clientA, 'Assignment Client A', 'user'],
      [clientB, 'Assignment Client B', 'user'],
      [isolatedClient, 'Isolated Assignment Client', 'user'],
      [professionalA, 'External Assignment Consultant', 'consultant'],
      [professionalB, 'Assignment Consultant B', 'consultant'],
    ] as const) {
      await pool.query(
        `insert into users (id, name, role, status, account_purpose)
         values ($1, $2, $3, 'active', 'QA_TEST')`,
        [id, name, role],
      );
    }
    await pool.query(
      `insert into tenant_memberships
         (id, tenant_id, user_id, tenant_role, status, joined_at, created_at, updated_at)
       values ($1, $2, $3, 'CONSULTANT', 'active', now(), now(), now()),
              ($4, $2, $5, 'CONSULTANT', 'active', now(), now(), now()),
              ($6, $2, $7, 'CLIENT', 'active', now(), now(), now()),
              ($8, $2, $9, 'CLIENT', 'active', now(), now(), now()),
              ($10, $11, $12, 'CLIENT', 'active', now(), now(), now())`,
      [randomUUID(), tenantId, professionalA, randomUUID(), professionalB,
       randomUUID(), clientA, randomUUID(), clientB,
       randomUUID(), otherTenantId, isolatedClient],
    );
    for (const [userId, clientId, ownerTenant] of [
      [clientA, `assignment-client-${clientA}`, tenantId],
      [clientB, `assignment-client-${clientB}`, tenantId],
      [isolatedClient, `assignment-client-${isolatedClient}`, otherTenantId],
    ] as const) {
      await pool.query(
        `insert into fiteatsy_clients (id, tenant_id, fiteatsy_client_id, account_user_id, status)
         values ($1, $2, $3, $4, 'active')`,
        [randomUUID(), ownerTenant, clientId, userId],
      );
    }

    const input = {
      actorUserId: null,
      actorReference,
      clientUserIds: [clientA, clientB],
      professionalUserId: professionalA,
      professionalType: 'CONSULTANT' as const,
      relationshipType: 'CLIENT_CARE',
    };
    const created = await createProfessionalAssignmentsBatch(input);
    assert.equal(created?.length, 2);

    const retry = await createProfessionalAssignmentsBatch(input);
    assert.deepEqual(retry?.map((row) => row.id), created?.map((row) => row.id));

    await assert.rejects(
      createProfessionalAssignmentsBatch({ ...input, clientUserIds: [clientA], professionalUserId: professionalB }),
      ReassignmentRequiredError,
    );

    const crossTenant = await createProfessionalAssignmentsBatch({ ...input, clientUserIds: [isolatedClient] });
    assert.equal(crossTenant, null);

    const mixedEligibility = await createProfessionalAssignmentsBatch({
      ...input,
      clientUserIds: [clientA, isolatedClient],
      allowReassignment: true,
    });
    assert.equal(mixedEligibility, null);

    const active = await pool.query(
      `select client_user_id, consultant_user_id
         from consultant_client_assignments
        where client_user_id = any($1::text[]) and status = 'active'
        order by client_user_id`,
      [[clientA, clientB, isolatedClient]],
    );
    assert.equal(active.rowCount, 2);
    assert.ok(active.rows.every((row) => row.consultant_user_id === professionalA));

    const audit = await pool.query(
      `select action, actor_user_id, actor_reference
         from professional_assignment_audit_events
        where client_user_id = any($1::text[])
        order by created_at`,
      [[clientA, clientB]],
    );
    assert.equal(audit.rowCount, 2);
    assert.ok(audit.rows.every((row) => row.action === 'CREATED'));
    assert.ok(audit.rows.every((row) => row.actor_user_id === null && row.actor_reference === actorReference));
  } finally {
    await pool.query('delete from professional_assignment_audit_events where client_user_id = any($1::text[])', [[clientA, clientB, isolatedClient]]);
    await pool.query('delete from consultant_client_assignments where client_user_id = any($1::text[])', [[clientA, clientB, isolatedClient]]);
    await pool.query('delete from fiteatsy_clients where account_user_id = any($1::text[])', [[clientA, clientB, isolatedClient]]);
    await pool.query('delete from tenant_memberships where user_id = any($1::text[])', [[clientA, clientB, isolatedClient, professionalA, professionalB]]);
    await pool.query('delete from users where id = any($1::text[])', [[clientA, clientB, isolatedClient, professionalA, professionalB]]);
    await pool.query('delete from tenants where id = any($1::uuid[])', [[tenantId, otherTenantId]]);
  }
});
