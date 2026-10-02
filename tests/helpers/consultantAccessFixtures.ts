import assert from 'node:assert/strict';
import { pool } from '../../backend/src/db/pool.js';
import { createProfessionalAssignment } from '../../backend/src/modules/professional-assignments/professional-assignments.repository.js';
import { ZESTIVA_INTERNAL_TENANT_ID } from '../../backend/src/test-support/test-tenants.js';
import { authHeaders } from './auth.js';
import { getJson, patchJson, putJson } from './http.js';

type AuthenticatedFixtureSession = {
  token: string;
  current: {
    body: {
      accountId: string;
    };
  };
};

export const ensureCanonicalAssignmentMemberships = async (
  consultantUserId: string,
  clientUserId: string,
) => {
  await pool.query(
    `insert into tenant_memberships(id,tenant_id,user_id,tenant_role,status)
     values
       (md5('consultant-access-membership:' || $1)::uuid,$3,$1,'CONSULTANT','active'),
       (md5('consultant-access-membership:' || $2)::uuid,$3,$2,'CLIENT','active')
     on conflict (tenant_id,user_id) do update set
       tenant_role=excluded.tenant_role,
       status='active',
       removed_at=null,
       updated_at=now()`,
    [consultantUserId, clientUserId, ZESTIVA_INTERNAL_TENANT_ID],
  );
};

export const createCanonicalProfessionalAssignment = async (
  input: Parameters<typeof createProfessionalAssignment>[0],
) => {
  await ensureCanonicalAssignmentMemberships(input.professionalUserId, input.clientUserId);
  const assignment = await createProfessionalAssignment(input);
  assert.notEqual(assignment, null, 'Canonical consultant assignment must be created');
  assert.equal(assignment!.tenant_id, ZESTIVA_INTERNAL_TENANT_ID, 'Assignment must use the canonical Zestiva tenant');
  return assignment;
};

export const grantCanonicalConsultantAccess = async (
  baseUrl: string,
  client: AuthenticatedFixtureSession,
  consultant: AuthenticatedFixtureSession
) => {
  await ensureCanonicalAssignmentMemberships(
    consultant.current.body.accountId,
    client.current.body.accountId,
  );
  const assignment = await patchJson(
    baseUrl,
    '/v1/platform/health-profile',
    { assignedConsultantId: consultant.current.body.accountId },
    { headers: authHeaders(client.token) }
  );
  assert.equal(assignment.response.status, 200, JSON.stringify(assignment.body));

  const accessRequests = await getJson(baseUrl, '/v1/preferences/consultant-access', { headers: authHeaders(client.token) });
  assert.equal(accessRequests.response.status, 200, JSON.stringify(accessRequests.body));
  const assignmentId = accessRequests.body.requests?.find((request: { consultantUserId: string }) => request.consultantUserId === consultant.current.body.accountId)?.assignmentId;
  assert.ok(assignmentId, JSON.stringify(accessRequests.body));

  const consent = await putJson(
    baseUrl,
    '/v1/preferences/consultant-access',
    { assignmentId, status: 'GRANTED', policyVersion: 'CONSULTANT_ACCESS_V1' },
    { headers: authHeaders(client.token) }
  );
  assert.equal(consent.response.status, 200, JSON.stringify(consent.body));

  return { assignment, consent };
};
