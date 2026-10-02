import assert from 'node:assert/strict';
import { pool } from '../../backend/src/db/pool.js';
import { ZESTIVA_INTERNAL_TENANT_ID } from '../../backend/src/test-support/test-tenants.js';
import { authHeaders } from './auth.js';
import { patchJson, postJson, putJson } from './http.js';

type QaRole = 'user' | 'consultant' | 'senior_consultant';

export const provisionQaIdentity = async (baseUrl: string, adminToken: string, role: QaRole, marker: string) => {
  const created = await postJson(baseUrl, '/v1/admin/qa-identities', {
    name: `Fiteatsy Synthetic ${marker}`,
    email: `fiteatsy-e2e-${marker}-${Date.now()}@example.com`,
    mobileNumber: `+9197${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`,
    role,
    reason: 'Authenticated common-food source acceptance',
  }, { headers: authHeaders(adminToken) });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  const session = await postJson(baseUrl, `/v1/admin/qa-identities/${created.body.user.id}/session`, {
    reason: 'Authenticated common-food source acceptance',
  }, { headers: authHeaders(adminToken) });
  assert.equal(session.response.status, 201, JSON.stringify(session.body));
  return { ...created.body, token: session.body.token as string };
};

export const createCommonFoodAuthenticatedFixture = async (input: {
  baseUrl: string;
  adminToken: string;
  consultant: Awaited<ReturnType<typeof provisionQaIdentity>>;
  marker: string;
  dietType: string;
}) => {
  const client = await provisionQaIdentity(input.baseUrl, input.adminToken, 'user', input.marker);
  await pool.query(
    `insert into tenant_memberships(id,tenant_id,user_id,tenant_role,status)
     values
       (md5('common-food-membership:' || $1)::uuid,$3,$1,'CONSULTANT','active'),
       (md5('common-food-membership:' || $2)::uuid,$3,$2,'CLIENT','active')
     on conflict (tenant_id,user_id) do update set
       tenant_role=excluded.tenant_role,
       status='active',
       removed_at=null,
       updated_at=now()`,
    [input.consultant.user.id, client.user.id, ZESTIVA_INTERNAL_TENANT_ID],
  );
  const assignment = await postJson(input.baseUrl, '/v1/admin/client-assignments', {
    consultantUserId: input.consultant.user.id,
    clientUserId: client.user.id,
    reason: 'Authenticated common-food source acceptance',
  }, { headers: authHeaders(input.adminToken) });
  assert.equal(assignment.response.status, 201, JSON.stringify(assignment.body));
  const canonical = await pool.query(
    `update consultant_client_assignments
        set product='FITEATSY',professional_type='CONSULTANT',relationship_type='CLIENT_CARE'
      where id=$1 and status='active'
      returning id,tenant_id,consultant_user_id,client_user_id,status`,
    [assignment.body.assignment.id],
  );
  assert.equal(canonical.rowCount, 1, `${input.marker}: active assignment was not created`);
  const row = canonical.rows[0];
  assert.equal(row.consultant_user_id, input.consultant.user.id, `${input.marker}: consultant mismatch`);
  assert.equal(row.client_user_id, client.user.id, `${input.marker}: client mismatch`);
  assert.equal(row.status, 'active', `${input.marker}: assignment must be active`);
  assert.equal(row.tenant_id, ZESTIVA_INTERNAL_TENANT_ID, `${input.marker}: assignment tenant mismatch`);
  const tenant = await pool.query(
    `select client.tenant_id as client_tenant_id,assignment.tenant_id as assignment_tenant_id,
            count(membership.user_id)::int as active_memberships
       from fiteatsy_clients client
       join consultant_client_assignments assignment on assignment.client_user_id=client.account_user_id
       join tenant_memberships membership
         on membership.tenant_id=assignment.tenant_id
        and membership.user_id in (assignment.consultant_user_id,assignment.client_user_id)
        and membership.status='active'
      where client.account_user_id=$1 and assignment.id=$2
      group by client.tenant_id,assignment.tenant_id`,
    [client.user.id, assignment.body.assignment.id],
  );
  assert.equal(tenant.rowCount, 1, `${input.marker}: client tenant projection missing`);
  assert.equal(tenant.rows[0].assignment_tenant_id, tenant.rows[0].client_tenant_id, `${input.marker}: assignment/client tenant mismatch`);
  assert.equal(tenant.rows[0].active_memberships, 2, `${input.marker}: tenant-aware access requires active consultant and client memberships`);
  const healthProfile = await patchJson(input.baseUrl, '/v1/platform/health-profile', {
    dateOfBirthISO: '1990-01-01T00:00:00.000Z', gender: 'Female', heightCm: 165,
    currentWeightKg: 65, activityLevel: 'Moderate', wellnessGoals: ['Maintain health'],
    dietType: input.dietType, mealsPerDay: 7, waterIntakeLiters: 2.5,
  }, { headers: authHeaders(client.token) });
  assert.equal(healthProfile.response.status, 200, JSON.stringify(healthProfile.body));
  const foodPreferences = await putJson(input.baseUrl, '/v1/platform/food-preferences', {
    dietType: input.dietType, proteins: [], cuisines: ['Indian'], foodsLiked: [], foodsDisliked: [],
    foodsAvoided: [], likedFoodIds: [], dislikedFoodIds: [], avoidedFoodIds: [], restrictions: [],
    staplePreference: null, dairyPreference: null, practicality: [],
  }, { headers: authHeaders(client.token) });
  assert.equal(foodPreferences.response.status, 200, JSON.stringify(foodPreferences.body));
  return {
    tenant: tenant.rows[0].client_tenant_id,
    consultant: input.consultant,
    client,
    assignment: assignment.body.assignment,
    healthProfile: healthProfile.body,
    foodPreferences: foodPreferences.body,
    authSession: client.token,
  };
};
