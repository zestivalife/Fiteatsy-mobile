import assert from 'node:assert/strict';
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

export const grantCanonicalConsultantAccess = async (
  baseUrl: string,
  client: AuthenticatedFixtureSession,
  consultant: AuthenticatedFixtureSession
) => {
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
