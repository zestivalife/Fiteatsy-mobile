import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { migrateDatabase, resetMigrationStateForTests } from '../../backend/src/db/migrator.js';
import { getPool } from '../../backend/src/db/pool.js';
import {
  createProfessionalAssignmentsBatch,
  createExternalPracticeReferral,
  createSeniorDelegatedAssignmentsBatch,
  listProfessionalAssignments,
  ReassignmentRequiredError,
  revokeSeniorDelegatedAssignment,
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

databaseTest('external practice referral preserves assignment while leaving connection and consent pending', async () => {
  resetMigrationStateForTests();
  await migrateDatabase();
  const pool = getPool();
  const clientTenantId = randomUUID();
  const practiceTenantId = randomUUID();
  const clientId = randomUUID();
  const professionalId = `ext_${randomUUID()}`;
  const replacementProfessionalId = `ext_${randomUUID()}`;
  const ownerMembershipId = randomUUID();
  const replacementMembershipId = randomUUID();
  const replacementPracticeTenantId = randomUUID();
  const actorReference = `zestiva:external-referral-${randomUUID()}`;

  try {
    await pool.query(
      `insert into tenants (id, name, slug, tenant_type, status)
       values ($1, 'Referral Client Tenant', $2, 'EXTERNAL_PRACTICE', 'active'),
              ($3, 'Referral Practice', $4, 'EXTERNAL_PRACTICE', 'active'),
              ($5, 'Replacement Referral Practice', $6, 'EXTERNAL_PRACTICE', 'active')`,
      [clientTenantId, `referral-client-${clientTenantId}`, practiceTenantId, `referral-practice-${practiceTenantId}`,
        replacementPracticeTenantId, `referral-practice-${replacementPracticeTenantId}`],
    );
    await pool.query(
      `insert into users (id, name, email_normalized, role, status, account_purpose)
       values ($1, 'Referral Client', $2, 'user', 'active', 'QA_TEST'),
              ($3, 'External Referral Consultant', $4, 'consultant', 'active', 'QA_TEST'),
              ($5, 'Replacement External Consultant', $6, 'consultant', 'active', 'QA_TEST')`,
      [clientId, `client-${clientId}@example.test`, professionalId, `consultant-${professionalId}@example.test`,
        replacementProfessionalId, `consultant-${replacementProfessionalId}@example.test`],
    );
    await pool.query(
      `insert into fiteatsy_clients (id, tenant_id, fiteatsy_client_id, account_user_id, status)
       values ($1, $2, $3, $4, 'active')`,
      [randomUUID(), clientTenantId, `referral-client-${clientId}`, clientId],
    );
    await pool.query(
      `insert into tenant_memberships
        (id, tenant_id, user_id, tenant_role, status, joined_at, created_at, updated_at)
       values ($1, $2, $3, 'OWNER', 'active', now(), now(), now()),
              ($4, $5, $6, 'OWNER', 'active', now(), now(), now())`,
      [ownerMembershipId, practiceTenantId, professionalId,
        replacementMembershipId, replacementPracticeTenantId, replacementProfessionalId],
    );
    await pool.query(
      `insert into external_consultant_signups
        (id, auth_identity_id, fiteatsy_user_id, email_normalized, account_type, signup_state,
         tenant_id, owner_membership_id, idempotency_key, created_by_reference)
       values ($1,$2,$3,$4,'INDEPENDENT_CONSULTANT','READY',$5,$6,$7,'EXTERNAL_REFERRAL_TEST')`,
      [randomUUID(), `auth-${professionalId}`, professionalId, `signup-${professionalId}@example.test`, practiceTenantId, ownerMembershipId, randomUUID()],
    );
    await pool.query(
      `insert into external_consultant_signups
        (id, auth_identity_id, fiteatsy_user_id, email_normalized, account_type, signup_state,
         tenant_id, owner_membership_id, idempotency_key, created_by_reference)
       values ($1,$2,$3,$4,'INDEPENDENT_CONSULTANT','READY',$5,$6,$7,'EXTERNAL_REFERRAL_TEST')`,
      [randomUUID(), `auth-${replacementProfessionalId}`, replacementProfessionalId,
        `signup-${replacementProfessionalId}@example.test`, replacementPracticeTenantId, replacementMembershipId, randomUUID()],
    );

    await pool.query(`update tenant_memberships set status='inactive' where id=$1`, [ownerMembershipId]);
    assert.equal(await createExternalPracticeReferral({
      actorUserId: null,
      actorReference,
      clientUserId: clientId,
      professionalUserId: professionalId,
    }), null);
    await pool.query(`update tenant_memberships set status='active' where id=$1`, [ownerMembershipId]);

    await pool.query(`update users set status='inactive' where id=$1`, [professionalId]);
    assert.equal(await createExternalPracticeReferral({
      actorUserId: null,
      actorReference,
      clientUserId: clientId,
      professionalUserId: professionalId,
    }), null);
    await pool.query(`update users set status='active' where id=$1`, [professionalId]);

    const input = {
      actorUserId: null,
      actorReference,
      clientUserId: clientId,
      professionalUserId: professionalId,
      reason: 'QA external practice referral',
    };
    const created = await createExternalPracticeReferral(input);
    assert.equal(created?.relationship_type, 'EXTERNAL_PRACTICE_REFERRAL');
    assert.equal(created?.tenant_id, clientTenantId);
    assert.equal(created?.consultant_user_id, professionalId);

    const retry = await createExternalPracticeReferral(input);
    assert.equal(retry?.id, created?.id);
    const assignmentCount = await pool.query(
      `select count(*)::int as count from consultant_client_assignments
        where client_user_id=$1 and consultant_user_id=$2 and status='active'`,
      [clientId, professionalId],
    );
    assert.equal(assignmentCount.rows[0].count, 1);
    const persisted = await pool.query(
      `select consultant_user_id, client_user_id, tenant_id, relationship_type
         from consultant_client_assignments where id=$1`,
      [created?.id],
    );
    assert.deepEqual(persisted.rows[0], {
      consultant_user_id: professionalId,
      client_user_id: clientId,
      tenant_id: clientTenantId,
      relationship_type: 'EXTERNAL_PRACTICE_REFERRAL',
    });

    await assert.rejects(createExternalPracticeReferral({
      ...input,
      professionalUserId: replacementProfessionalId,
    }), ReassignmentRequiredError);
    const reassigned = await createExternalPracticeReferral({
      ...input,
      professionalUserId: replacementProfessionalId,
      allowReassignment: true,
    });
    assert.equal(reassigned?.consultant_user_id, replacementProfessionalId);
    const history = await pool.query(
      `select consultant_user_id, status from consultant_client_assignments
        where client_user_id=$1 order by created_at`,
      [clientId],
    );
    assert.deepEqual(history.rows, [
      { consultant_user_id: professionalId, status: 'revoked' },
      { consultant_user_id: replacementProfessionalId, status: 'active' },
    ]);
    // PIN connections and consent are owned by Practice Operations. This
    // transaction persists only the administrative Fiteatsy assignment.
  } finally {
    await pool.query('delete from professional_assignment_audit_events where client_user_id=$1', [clientId]);
    await pool.query('delete from consultant_client_assignments where client_user_id=$1', [clientId]);
    await pool.query('delete from external_consultant_signups where fiteatsy_user_id = any($1::text[])', [[professionalId, replacementProfessionalId]]);
    await pool.query('delete from fiteatsy_clients where account_user_id=$1', [clientId]);
    await pool.query('delete from tenant_memberships where id = any($1::uuid[])', [[ownerMembershipId, replacementMembershipId]]);
    await pool.query('delete from users where id = any($1::text[])', [[clientId, professionalId, replacementProfessionalId]]);
    await pool.query('delete from tenants where id = any($1::uuid[])', [[clientTenantId, practiceTenantId, replacementPracticeTenantId]]);
  }
});

databaseTest('senior delegation preserves supervision and scopes delivery management', async () => {
  resetMigrationStateForTests();
  await migrateDatabase();
  const pool = getPool();
  const tenantId = randomUUID();
  const clientId = randomUUID();
  const seniorId = randomUUID();
  const otherSeniorId = randomUUID();
  const internalId = randomUUID();
  const replacementId = randomUUID();
  const externalId = `ext_${randomUUID()}`;

  try {
    await pool.query(
      `insert into tenants (id, name, slug, tenant_type, status)
       values ($1, 'Delegation Test', $2, 'EXTERNAL_PRACTICE', 'active')`,
      [tenantId, `delegation-${tenantId}`],
    );
    for (const [id, name, role] of [
      [clientId, 'Delegation Client', 'user'],
      [seniorId, 'Supervising Senior', 'senior_consultant'],
      [otherSeniorId, 'Other Senior', 'senior_consultant'],
      [internalId, 'Internal Delivery Consultant', 'consultant'],
      [replacementId, 'Replacement Delivery Consultant', 'consultant'],
      [externalId, 'External Consultant', 'consultant'],
    ] as const) {
      await pool.query(
        `insert into users (id, name, role, status, account_purpose)
         values ($1, $2, $3, 'active', 'QA_TEST')`,
        [id, name, role],
      );
      await pool.query(
        `insert into tenant_memberships
          (id, tenant_id, user_id, tenant_role, status, joined_at, created_at, updated_at)
         values ($1, $2, $3, $4, 'active', now(), now(), now())`,
        [randomUUID(), tenantId, id, role === 'user' ? 'CLIENT' : 'CONSULTANT'],
      );
    }
    await pool.query(
      `insert into fiteatsy_clients (id, tenant_id, fiteatsy_client_id, account_user_id, status)
       values ($1, $2, $3, $4, 'active')`,
      [randomUUID(), tenantId, `delegation-client-${clientId}`, clientId],
    );
    const supervision = await createProfessionalAssignmentsBatch({
      actorUserId: seniorId,
      clientUserIds: [clientId],
      professionalUserId: seniorId,
      professionalType: 'CONSULTANT',
      relationshipType: 'CLIENT_CARE',
    });
    assert.equal(supervision?.length, 1);

    const delegated = await createSeniorDelegatedAssignmentsBatch({
      actorUserId: seniorId,
      clientUserIds: [clientId],
      professionalUserId: internalId,
      reason: 'QA delivery delegation',
    });
    assert.equal(delegated?.length, 1);

    const active = await pool.query(
      `select consultant_user_id, relationship_type from consultant_client_assignments
        where client_user_id=$1 and status='active' order by relationship_type`,
      [clientId],
    );
    assert.deepEqual(active.rows, [
      { consultant_user_id: seniorId, relationship_type: 'CLIENT_CARE' },
      { consultant_user_id: internalId, relationship_type: 'DELEGATED_CLIENT_CARE' },
    ]);
    assert.equal(await createSeniorDelegatedAssignmentsBatch({ actorUserId: otherSeniorId, clientUserIds: [clientId], professionalUserId: replacementId }), null);
    assert.equal(await createSeniorDelegatedAssignmentsBatch({ actorUserId: seniorId, clientUserIds: [clientId], professionalUserId: externalId }), null);
    await assert.rejects(
      createSeniorDelegatedAssignmentsBatch({ actorUserId: seniorId, clientUserIds: [clientId], professionalUserId: replacementId }),
      ReassignmentRequiredError,
    );

    const seniorView = await listProfessionalAssignments(seniorId, true);
    assert.equal(seniorView.filter((row) => row.client_user_id === clientId).length, 2);
    assert.equal(await revokeSeniorDelegatedAssignment(String(delegated?.[0]?.id), otherSeniorId), null);
    assert.ok(await revokeSeniorDelegatedAssignment(String(delegated?.[0]?.id), seniorId, 'QA cleanup'));

    const remaining = await pool.query(
      `select consultant_user_id, relationship_type from consultant_client_assignments
        where client_user_id=$1 and status='active'`,
      [clientId],
    );
    assert.deepEqual(remaining.rows, [{ consultant_user_id: seniorId, relationship_type: 'CLIENT_CARE' }]);
  } finally {
    await pool.query('delete from professional_assignment_audit_events where client_user_id=$1', [clientId]);
    await pool.query('delete from consultant_client_assignments where client_user_id=$1', [clientId]);
    await pool.query('delete from fiteatsy_clients where account_user_id=$1', [clientId]);
    await pool.query('delete from tenant_memberships where user_id = any($1::text[])', [[clientId, seniorId, otherSeniorId, internalId, replacementId, externalId]]);
    await pool.query('delete from users where id = any($1::text[])', [[clientId, seniorId, otherSeniorId, internalId, replacementId, externalId]]);
    await pool.query('delete from tenants where id=$1', [tenantId]);
  }
});
