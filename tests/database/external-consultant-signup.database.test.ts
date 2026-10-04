import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { migrateDatabase } from '../../backend/src/db/migrator.js';
import { pool } from '../../backend/src/db/pool.js';
import { provisionExternalConsultant } from '../../backend/src/modules/external-signup/external-signup.repository.js';

test('external signup provisions two isolated tenants with exactly one active OWNER each', async () => {
  await migrateDatabase();
  const suffix = randomUUID();
  const first = await provisionExternalConsultant({
    authIdentityId: `auth-a-${suffix}`,
    name: 'External Consultant A',
    email: `external-a-${suffix}@example.test`,
    accountType: 'INDEPENDENT_CONSULTANT',
    professionalTitle: 'Consultant',
    speciality: 'Nutrition',
    country: 'IN',
    timezone: 'Asia/Kolkata',
    idempotencyKey: `signup-a-${suffix}`,
    actorReference: `auth-a-${suffix}`,
  });
  const second = await provisionExternalConsultant({
    authIdentityId: `auth-b-${suffix}`,
    name: 'External Consultant B',
    email: `external-b-${suffix}@example.test`,
    accountType: 'PRACTICE_OWNER',
    practiceName: 'External Practice B',
    country: 'IN',
    timezone: 'Asia/Kolkata',
    idempotencyKey: `signup-b-${suffix}`,
    actorReference: `auth-b-${suffix}`,
  });

  assert.notEqual(first.tenantId, second.tenantId);
  assert.equal(first.state, 'ONBOARDING_IN_PROGRESS');
  assert.equal(second.state, 'ONBOARDING_IN_PROGRESS');
  assert.equal(first.workspaceReady, false);
  assert.equal(second.workspaceReady, false);

  const memberships = await pool.query<{ tenant_id: string; user_id: string; count: number }>(
    `select tenant_id::text,user_id,count(*)::int as count
       from tenant_memberships
      where tenant_id=any($1::uuid[]) and tenant_role='OWNER' and status='active' and removed_at is null
      group by tenant_id,user_id order by tenant_id`,
    [[first.tenantId, second.tenantId]],
  );
  assert.equal(memberships.rowCount, 2);
  assert.deepEqual(new Set(memberships.rows.map((row) => row.user_id)), new Set([first.userId, second.userId]));
  assert.equal(memberships.rows.every((row) => row.count === 1), true);

  const replay = await provisionExternalConsultant({
    authIdentityId: `auth-a-${suffix}`,
    name: 'External Consultant A',
    email: `external-a-${suffix}@example.test`,
    accountType: 'INDEPENDENT_CONSULTANT',
    professionalTitle: 'Consultant',
    speciality: 'Nutrition',
    country: 'IN',
    timezone: 'Asia/Kolkata',
    idempotencyKey: `signup-a-${suffix}`,
    actorReference: `auth-a-${suffix}`,
  });
  assert.deepEqual(replay, first);

  const normalizedReplay = await provisionExternalConsultant({
    authIdentityId: `auth-a-${suffix}`,
    name: 'External Consultant A',
    email: `  EXTERNAL-A-${suffix}@EXAMPLE.TEST  `,
    accountType: 'INDEPENDENT_CONSULTANT',
    professionalTitle: 'Consultant',
    speciality: 'Nutrition',
    country: 'IN',
    timezone: 'Asia/Kolkata',
    idempotencyKey: `signup-a-${suffix}`,
    actorReference: `auth-a-${suffix}`,
  });
  assert.deepEqual(normalizedReplay, first);

  const persisted = await pool.query<{ signups: number; users: number; tenants: number; owners: number }>(
    `select
       (select count(*)::int from external_consultant_signups where auth_identity_id=$1) as signups,
       (select count(*)::int from users where id=$2) as users,
       (select count(*)::int from tenants where id=$3) as tenants,
       (select count(*)::int from tenant_memberships where tenant_id=$3 and user_id=$2 and tenant_role='OWNER' and status='active' and removed_at is null) as owners`,
    [`auth-a-${suffix}`, first.userId, first.tenantId],
  );
  assert.deepEqual(persisted.rows[0], { signups: 1, users: 1, tenants: 1, owners: 1 });
});
