import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../../backend/src/db/pool.js';
import { bootstrapInitialAdminFromEnvironment } from '../../backend/src/modules/admin/admin.service.js';
import { createProfessionalAssignment } from '../../backend/src/modules/professional-assignments/professional-assignments.repository.js';
import { authHeaders, createAuthenticatedSession } from '../helpers/auth.js';
import { getJson, postJson } from '../helpers/http.js';
import { resetTestState, startTestServer } from '../helpers/testServer.js';

let server: Awaited<ReturnType<typeof startTestServer>>;

test.before(async () => {
  server = await startTestServer();
});

test.after(async () => {
  await server?.close();
});

test.beforeEach(async () => {
  delete process.env.INITIAL_ADMIN_PHONE;
  await resetTestState();
});

const promoteRole = async (userId: string, role: 'admin' | 'consultant' | 'senior_consultant' | 'user') => {
  await pool.query('update users set role = $2 where id = $1', [userId, role]);
};

test('INITIAL_ADMIN_PHONE bootstraps the first admin from an existing verified user', async () => {
  const candidate = await createAuthenticatedSession(server.baseUrl, {
    name: 'QA Bootstrap Admin',
    email: `qa-bootstrap-admin-${Date.now()}@example.com`,
    mobileNumber: '+919876500001'
  });
  process.env.INITIAL_ADMIN_PHONE = '9876500001';

  const bootstrap = await bootstrapInitialAdminFromEnvironment();

  assert.equal(bootstrap.status, 'bootstrapped');
  assert.equal(bootstrap.enabled, true);
  assert.equal(bootstrap.adminUserFound, true);
  assert.equal(bootstrap.completed, true);

  const user = await pool.query('select role from users where id = $1', [candidate.current.body.accountId]);
  assert.equal(user.rows[0].role, 'admin');

  const audit = await pool.query(
    'select old_role, new_role, reason from role_audit_events where target_user_id = $1',
    [candidate.current.body.accountId]
  );
  assert.equal(audit.rowCount, 1);
  assert.equal(audit.rows[0].old_role, null);
  assert.equal(audit.rows[0].new_role, 'admin');
  assert.equal(audit.rows[0].reason, 'initial_admin_bootstrap');
});

test('INITIAL_ADMIN_PHONE does not run when an active admin already exists', async () => {
  const admin = await createAuthenticatedSession(server.baseUrl, {
    name: 'Existing Admin',
    email: `existing-admin-${Date.now()}@example.com`,
    mobileNumber: '+919876500002'
  });
  const candidate = await createAuthenticatedSession(server.baseUrl, {
    name: 'Skipped Bootstrap Candidate',
    email: `skipped-bootstrap-${Date.now()}@example.com`,
    mobileNumber: '+919876500003'
  });
  await promoteRole(admin.current.body.accountId, 'admin');
  process.env.INITIAL_ADMIN_PHONE = '9876500003';

  const bootstrap = await bootstrapInitialAdminFromEnvironment();

  assert.equal(bootstrap.status, 'skipped');
  assert.equal(bootstrap.reason, 'admin_exists');
  const skipped = await pool.query('select role from users where id = $1', [candidate.current.body.accountId]);
  assert.equal(skipped.rows[0].role, null);
  const audit = await pool.query('select count(*)::int as count from role_audit_events');
  assert.equal(audit.rows[0].count, 0);
});

test('admin assigns consultant role and creates an audit event', async () => {
  const admin = await createAuthenticatedSession(server.baseUrl, {
    name: 'QA Admin',
    email: `qa-admin-${Date.now()}@example.com`
  });
  const target = await createAuthenticatedSession(server.baseUrl, {
    name: 'QA Consultant Candidate',
    email: `qa-consultant-${Date.now()}@example.com`
  });
  await promoteRole(admin.current.body.accountId, 'admin');

  const assigned = await postJson(
    server.baseUrl,
    `/v1/admin/users/${target.current.body.accountId}/role`,
    {
      role: 'consultant',
      reason: 'M1.1 QA validation'
    },
    { headers: authHeaders(admin.token) }
  );

  assert.equal(assigned.response.status, 200);
  assert.equal(assigned.body.user.id, target.current.body.accountId);
  assert.equal(assigned.body.user.role, 'consultant');
  assert.equal(assigned.body.auditEvent.performedByUserId, admin.current.body.accountId);
  assert.equal(assigned.body.auditEvent.targetUserId, target.current.body.accountId);
  assert.equal(assigned.body.auditEvent.newRole, 'consultant');

  const audit = await pool.query(
    'select old_role, new_role, reason from role_audit_events where target_user_id = $1',
    [target.current.body.accountId]
  );
  assert.equal(audit.rowCount, 1);
  assert.equal(audit.rows[0].new_role, 'consultant');
  assert.equal(audit.rows[0].reason, 'M1.1 QA validation');

  const status = await getJson(server.baseUrl, '/v1/admin/status', {
    headers: authHeaders(admin.token)
  });
  assert.equal(status.response.status, 200);
  assert.equal(status.body.role, 'admin');
  assert.deepEqual(status.body.permissions, ['role_management']);
  assert.equal(typeof status.body.bootstrapConfigured, 'boolean');
});

test('admin role management accepts historical uppercase admin casing and normalizes writes', async () => {
  const admin = await createAuthenticatedSession(server.baseUrl, {
    name: 'Uppercase Admin',
    email: `uppercase-admin-${Date.now()}@example.com`
  });
  const target = await createAuthenticatedSession(server.baseUrl, {
    name: 'Uppercase Consultant Candidate',
    email: `uppercase-consultant-${Date.now()}@example.com`
  });
  await pool.query('update users set status = $2, role = $3 where id = $1', [admin.current.body.accountId, 'ACTIVE', 'ADMIN']);

  const assigned = await postJson(
    server.baseUrl,
    `/v1/admin/users/${target.current.body.accountId}/role`,
    {
      role: 'CONSULTANT',
      reason: 'Uppercase role compatibility'
    },
    { headers: authHeaders(admin.token) }
  );

  assert.equal(assigned.response.status, 200);
  assert.equal(assigned.body.user.role, 'consultant');
  assert.equal(assigned.body.auditEvent.newRole, 'consultant');

  const targetRole = await pool.query('select role from users where id = $1', [target.current.body.accountId]);
  assert.equal(targetRole.rows[0].role, 'consultant');
});

test('consultant cannot assign roles', async () => {
  const consultant = await createAuthenticatedSession(server.baseUrl, {
    name: 'QA Consultant',
    email: `qa-consultant-deny-${Date.now()}@example.com`
  });
  const target = await createAuthenticatedSession(server.baseUrl, {
    name: 'QA Target',
    email: `qa-target-${Date.now()}@example.com`
  });
  await promoteRole(consultant.current.body.accountId, 'consultant');

  const denied = await postJson(
    server.baseUrl,
    `/v1/admin/users/${target.current.body.accountId}/role`,
    { role: 'admin' },
    { headers: authHeaders(consultant.token) }
  );

  assert.equal(denied.response.status, 403);
  assert.equal(denied.body.error, 'ROLE_NOT_ALLOWED');

  const statusDenied = await getJson(server.baseUrl, '/v1/admin/status', {
    headers: authHeaders(consultant.token)
  });
  assert.equal(statusDenied.response.status, 403);
  assert.equal(statusDenied.body.error, 'ROLE_NOT_ALLOWED');
});

test('QA_TEST admin cannot mutate production roles and reports only QA provisioning permission', async () => {
  const admin = await createAuthenticatedSession(server.baseUrl, {
    name: 'Restricted QA Admin', email: `restricted-qa-admin-${Date.now()}@example.com`
  });
  const target = await createAuthenticatedSession(server.baseUrl, {
    name: 'Production Role Target', email: `production-role-target-${Date.now()}@example.com`
  });
  await pool.query("update users set role = 'admin', account_purpose = 'QA_TEST' where id = $1", [admin.current.body.accountId]);

  const denied = await postJson(server.baseUrl, `/v1/admin/users/${target.current.body.accountId}/role`, {
    role: 'admin', reason: 'Must remain production-safe'
  }, { headers: authHeaders(admin.token) });
  assert.equal(denied.response.status, 403);
  assert.equal(denied.body.error, 'QA_ADMIN_SCOPE_RESTRICTED');
  const persisted = await pool.query('select role from users where id = $1', [target.current.body.accountId]);
  assert.equal(persisted.rows[0].role, null);

  const status = await getJson(server.baseUrl, '/v1/admin/status', { headers: authHeaders(admin.token) });
  assert.equal(status.response.status, 200);
  assert.deepEqual(status.body.permissions, ['qa_provisioning']);
});

test('normal user cannot assign roles and cannot access consultant client API', async () => {
  const user = await createAuthenticatedSession(server.baseUrl, {
    name: 'QA Normal User',
    email: `qa-user-${Date.now()}@example.com`
  });
  const target = await createAuthenticatedSession(server.baseUrl, {
    name: 'QA Normal Target',
    email: `qa-normal-target-${Date.now()}@example.com`
  });

  const roleDenied = await postJson(
    server.baseUrl,
    `/v1/admin/users/${target.current.body.accountId}/role`,
    { role: 'consultant' },
    { headers: authHeaders(user.token) }
  );
  assert.equal(roleDenied.response.status, 403);
  assert.equal(roleDenied.body.error, 'ROLE_NOT_ALLOWED');

  const consultantDenied = await getJson(server.baseUrl, '/v1/consultants/clients', {
    headers: authHeaders(user.token)
  });
  assert.equal(consultantDenied.response.status, 403);
  assert.equal(consultantDenied.body.error, 'ROLE_NOT_ALLOWED');
});

test('consultant can access client list after admin role assignment', async () => {
  const admin = await createAuthenticatedSession(server.baseUrl, {
    name: 'QA Admin Access',
    email: `qa-admin-access-${Date.now()}@example.com`
  });
  const consultant = await createAuthenticatedSession(server.baseUrl, {
    name: 'QA Consultant Access',
    email: `qa-consultant-access-${Date.now()}@example.com`
  });
  const client = await createAuthenticatedSession(server.baseUrl, {
    name: 'QA Real Client',
    email: `qa-real-client-${Date.now()}@example.com`
  });
  await promoteRole(admin.current.body.accountId, 'admin');

  const assigned = await postJson(
    server.baseUrl,
    `/v1/admin/users/${consultant.current.body.accountId}/role`,
    { role: 'consultant', reason: 'Grant consultant dashboard access' },
    { headers: authHeaders(admin.token) }
  );
  assert.equal(assigned.response.status, 200);

  const clientAssignment = await createProfessionalAssignment({
    actorUserId: admin.current.body.accountId,
    clientUserId: client.current.body.accountId,
    professionalUserId: consultant.current.body.accountId,
    professionalType: 'CONSULTANT',
    relationshipType: 'CLIENT_CARE',
    reason: 'Test consultant client-list access through canonical assignment'
  });
  assert.notEqual(clientAssignment, null);

  const list = await getJson(server.baseUrl, '/v1/consultants/clients', {
    headers: authHeaders(consultant.token)
  });

  assert.equal(list.response.status, 200);
  assert.equal(list.body.clients.length, 1);
  assert.equal(list.body.clients[0].clientId, client.current.body.client.fiteatsyClientId);
  assert.equal(list.body.clients[0].name, 'QA Real Client');
});

test('senior allocation pool uses the active client mapping for a dual-role mobile registrant', async () => {
  const senior = await createAuthenticatedSession(server.baseUrl, {
    name: 'Senior Client Allocator',
    email: `senior-client-allocator-${Date.now()}@example.com`
  });
  const consultant = await createAuthenticatedSession(server.baseUrl, {
    name: 'Dual Role Client Consultant',
    email: `dual-role-client-consultant-${Date.now()}@example.com`
  });
  const otherConsultant = await createAuthenticatedSession(server.baseUrl, {
    name: 'Unassigned Dual Role Consultant',
    email: `unassigned-dual-role-consultant-${Date.now()}@example.com`
  });
  const mobileClient = await createAuthenticatedSession(server.baseUrl, {
    name: 'Dual Role Mobile Client',
    email: `dual-role-mobile-client-${Date.now()}@example.com`
  });
  await promoteRole(senior.current.body.accountId, 'senior_consultant');
  await promoteRole(consultant.current.body.accountId, 'consultant');
  await promoteRole(otherConsultant.current.body.accountId, 'consultant');
  await promoteRole(mobileClient.current.body.accountId, 'admin');

  const poolResponse = await getJson(
    server.baseUrl,
    '/v1/professional-assignments/clients/pool?q=Dual%20Role%20Mobile%20Client&assignment=unassigned',
    { headers: authHeaders(senior.token) }
  );

  assert.equal(poolResponse.response.status, 200);
  assert.equal(poolResponse.body.clients.length, 1);
  assert.equal(poolResponse.body.clients[0].userId, mobileClient.current.body.accountId);
  assert.equal(poolResponse.body.clients[0].clientId, mobileClient.current.body.client.fiteatsyClientId);
  assert.equal(poolResponse.body.clients[0].assignmentStatus, 'UNASSIGNED');

  const duplicateCount = await pool.query(
    'select count(*)::int as count from fiteatsy_clients where account_user_id = $1 and deleted_at is null',
    [mobileClient.current.body.accountId]
  );
  assert.equal(duplicateCount.rows[0].count, 1);

  const assignment = await createProfessionalAssignment({
    actorUserId: senior.current.body.accountId,
    clientUserId: mobileClient.current.body.accountId,
    professionalUserId: consultant.current.body.accountId,
    professionalType: 'CONSULTANT',
    relationshipType: 'CLIENT_CARE',
    reason: 'Verify a mapped dual-role client remains assignable'
  });
  assert.notEqual(assignment, null);

  const assignedResponse = await getJson(
    server.baseUrl,
    '/v1/professional-assignments/clients/pool?q=Dual%20Role%20Mobile%20Client&assignment=assigned',
    { headers: authHeaders(senior.token) }
  );
  assert.equal(assignedResponse.response.status, 200);
  assert.equal(assignedResponse.body.clients.length, 1);
  assert.equal(assignedResponse.body.clients[0].assignmentStatus, 'ASSIGNED');

  const consultantRoster = await getJson(server.baseUrl, '/v1/consultants/clients', {
    headers: authHeaders(consultant.token)
  });
  assert.equal(consultantRoster.response.status, 200);
  assert.equal(
    consultantRoster.body.clients.filter(
      (client: { clientId: string }) => client.clientId === mobileClient.current.body.client.fiteatsyClientId
    ).length,
    1
  );

  const assignedDetail = await getJson(
    server.baseUrl,
    `/v1/consultants/clients/${mobileClient.current.body.client.fiteatsyClientId}`,
    { headers: authHeaders(consultant.token) }
  );
  assert.equal(assignedDetail.response.status, 200);
  assert.equal(assignedDetail.body.client.id, mobileClient.current.body.client.fiteatsyClientId);

  const wrongConsultantDetail = await getJson(
    server.baseUrl,
    `/v1/consultants/clients/${mobileClient.current.body.client.fiteatsyClientId}`,
    { headers: authHeaders(otherConsultant.token) }
  );
  assert.equal(wrongConsultantDetail.response.status, 404);
});

test('all active canonical client cohorts remain allocation-visible and roster-isolated exactly once', async () => {
  const marker = `Lifecycle Cohort ${Date.now()}`;
  const senior = await createAuthenticatedSession(server.baseUrl, {
    name: `${marker} Senior`, email: `lifecycle-cohort-senior-${Date.now()}@example.com`
  });
  const consultant = await createAuthenticatedSession(server.baseUrl, {
    name: `${marker} Consultant`, email: `lifecycle-cohort-consultant-${Date.now()}@example.com`
  });
  const otherConsultant = await createAuthenticatedSession(server.baseUrl, {
    name: `${marker} Other Consultant`, email: `lifecycle-cohort-other-${Date.now()}@example.com`
  });
  await promoteRole(senior.current.body.accountId, 'senior_consultant');
  await promoteRole(consultant.current.body.accountId, 'consultant');
  await promoteRole(otherConsultant.current.body.accountId, 'consultant');

  type CohortDefinition = {
    label: string;
    assigned: boolean;
    subscribed?: boolean;
    role?: 'admin';
    careContext?: boolean;
    legacyTimestamp?: boolean;
    reassign?: boolean;
  };
  const cohortDefinitions: CohortDefinition[] = [
    { label: 'Unsubscribed', assigned: true },
    { label: 'Subscribed', assigned: true, subscribed: true },
    { label: 'Dual Role', assigned: true, role: 'admin' as const },
    { label: 'Care Context', assigned: true, careContext: true },
    { label: 'Legacy Timestamp', assigned: true, legacyTimestamp: true },
    { label: 'Historical Reassignment', assigned: true, reassign: true },
    { label: 'Unassigned', assigned: false }
  ];
  const cohorts = [] as Array<{
    definition: CohortDefinition;
    session: Awaited<ReturnType<typeof createAuthenticatedSession>>;
  }>;

  for (const definition of cohortDefinitions) {
    const session = await createAuthenticatedSession(server.baseUrl, {
      name: `${marker} ${definition.label}`,
      email: `lifecycle-cohort-${definition.label.toLowerCase().replaceAll(' ', '-')}-${Date.now()}@example.com`
    });
    if (definition.role) await promoteRole(session.current.body.accountId, definition.role);
    if (definition.legacyTimestamp) {
      await pool.query("update users set created_at = timestamptz '2020-01-01 00:00:00+00' where id = $1", [
        session.current.body.accountId
      ]);
    }
    if (definition.subscribed) {
      const planId = crypto.randomUUID();
      await pool.query(
        `insert into subscription_plans
          (id, code, name, description, duration_days, duration_months, price_minor)
         values ($1, $2, $3, 'Cohort contract plan', 30, 1, 100)`,
        [planId, `COHORT-${Date.now()}`, `${marker} Plan`]
      );
      await pool.query(
        `insert into user_subscriptions
          (id, user_id, plan_id, status, starts_at, expires_at)
         values ($1, $2, $3, 'ACTIVE', now() - interval '1 day', now() + interval '29 days')`,
        [crypto.randomUUID(), session.current.body.accountId, planId]
      );
    }
    if (definition.careContext) {
      const healthProfileId = crypto.randomUUID();
      const recoveryProgramId = crypto.randomUUID();
      await pool.query(
        `insert into health_profiles (id, user_id, client_id)
         select $1, account_user_id, id from fiteatsy_clients where account_user_id = $2`,
        [healthProfileId, session.current.body.accountId]
      );
      await pool.query(
        `insert into recovery_programs (id, health_profile_id, consultant_id, current_phase)
         values ($1, $2, $3, 'diet_published')`,
        [recoveryProgramId, healthProfileId, consultant.current.body.accountId]
      );
      await pool.query(
        `insert into care_cases
          (id, user_id, client_id, health_profile_id, recovery_program_id, assigned_consultant_id, current_stage)
         select $1, account_user_id, id, $3, $4, $5, 'diet_published'
           from fiteatsy_clients where account_user_id = $2`,
        [crypto.randomUUID(), session.current.body.accountId, healthProfileId, recoveryProgramId, consultant.current.body.accountId]
      );
    }
    if (definition.assigned) {
      if (definition.reassign) {
        const historical = await createProfessionalAssignment({
          actorUserId: senior.current.body.accountId,
          clientUserId: session.current.body.accountId,
          professionalUserId: otherConsultant.current.body.accountId,
          professionalType: 'CONSULTANT', relationshipType: 'CLIENT_CARE', reason: 'Historical cohort assignment'
        });
        assert.notEqual(historical, null);
      }
      const assignment = await createProfessionalAssignment({
        actorUserId: senior.current.body.accountId,
        clientUserId: session.current.body.accountId,
        professionalUserId: consultant.current.body.accountId,
        professionalType: 'CONSULTANT', relationshipType: 'CLIENT_CARE', reason: 'Whole-population lifecycle matrix'
      });
      assert.notEqual(assignment, null);
    }
    cohorts.push({ definition, session });
  }

  const allocationPool = await getJson(
    server.baseUrl,
    `/v1/professional-assignments/clients/pool?q=${encodeURIComponent(marker)}&assignment=all&limit=50`,
    { headers: authHeaders(senior.token) }
  );
  assert.equal(allocationPool.response.status, 200);
  for (const cohort of cohorts) {
    const matches = allocationPool.body.clients.filter(
      (client: { clientId: string }) => client.clientId === cohort.session.current.body.client.fiteatsyClientId
    );
    assert.equal(matches.length, 1, `${cohort.definition.label} must appear exactly once in the Senior pool`);
    assert.equal(matches[0].assignmentStatus, cohort.definition.assigned ? 'ASSIGNED' : 'UNASSIGNED');
    assert.equal(matches[0].subscriptionStatus, cohort.definition.subscribed ? 'ACTIVE' : 'NONE');
  }

  const consultantRoster = await getJson(server.baseUrl, '/v1/consultants/clients', {
    headers: authHeaders(consultant.token)
  });
  const wrongRoster = await getJson(server.baseUrl, '/v1/consultants/clients', {
    headers: authHeaders(otherConsultant.token)
  });
  assert.equal(consultantRoster.response.status, 200);
  assert.equal(wrongRoster.response.status, 200);
  for (const cohort of cohorts) {
    const clientId = cohort.session.current.body.client.fiteatsyClientId;
    assert.equal(
      consultantRoster.body.clients.filter((client: { clientId: string }) => client.clientId === clientId).length,
      cohort.definition.assigned ? 1 : 0,
      `${cohort.definition.label} roster membership must match its active assignment`
    );
    assert.equal(
      wrongRoster.body.clients.filter((client: { clientId: string }) => client.clientId === clientId).length,
      0,
      `${cohort.definition.label} must not leak into the wrong Consultant roster`
    );
    if (cohort.definition.assigned) {
      const detail = await getJson(server.baseUrl, `/v1/consultants/clients/${clientId}`, {
        headers: authHeaders(consultant.token)
      });
      assert.equal(detail.response.status, 200);
      assert.equal(detail.body.client.id, clientId);
    }
    const wrongDetail = await getJson(server.baseUrl, `/v1/consultants/clients/${clientId}`, {
      headers: authHeaders(otherConsultant.token)
    });
    assert.equal(wrongDetail.response.status, 404);
  }

  const activeAssignmentCounts = await pool.query(
    `select client_user_id, count(*)::int as count
       from consultant_client_assignments
      where client_user_id = any($1::text[]) and product = 'FITEATSY' and status = 'active'
      group by client_user_id`,
    [cohorts.map(({ session }) => session.current.body.accountId)]
  );
  assert.ok(activeAssignmentCounts.rows.every((row) => row.count === 1));
  assert.equal(activeAssignmentCounts.rowCount, cohortDefinitions.filter(({ assigned }) => assigned).length);
});

test('senior allocation pool excludes an operational identity without an active client mapping', async () => {
  const senior = await createAuthenticatedSession(server.baseUrl, {
    name: 'Senior Isolation Auditor',
    email: `senior-isolation-auditor-${Date.now()}@example.com`
  });
  const operationalIdentity = await createAuthenticatedSession(server.baseUrl, {
    name: 'Operational Identity Only',
    email: `operational-identity-only-${Date.now()}@example.com`
  });
  await promoteRole(senior.current.body.accountId, 'senior_consultant');
  await promoteRole(operationalIdentity.current.body.accountId, 'admin');
  await pool.query(
    "update fiteatsy_clients set status = 'inactive', deleted_at = now(), updated_at = now() where account_user_id = $1",
    [operationalIdentity.current.body.accountId]
  );

  const poolResponse = await getJson(
    server.baseUrl,
    '/v1/professional-assignments/clients/pool?q=Operational%20Identity%20Only&assignment=all',
    { headers: authHeaders(senior.token) }
  );

  assert.equal(poolResponse.response.status, 200);
  assert.deepEqual(poolResponse.body.clients, []);
});
