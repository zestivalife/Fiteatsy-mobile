import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
import { createOrResolveClientForAccount } from '../client/client.repository.js';
import { createOrUpdateHealthProfile, createCareCaseIfMissing } from '../platform/platform.store.js';
import type { ClientOwnershipContext } from '../platform/platform.types.js';
import { normalizeCanonicalPhoneNumber } from '../../utils/phone.js';

type QaRole = 'user' | 'consultant' | 'senior_consultant' | 'admin';

const mapUser = (row: Record<string, unknown>) => ({
  id: String(row.id),
  name: String(row.name),
  email: row.email_normalized == null ? null : String(row.email_normalized),
  mobileNumber: row.mobile_number_normalized == null ? null : String(row.mobile_number_normalized),
  role: row.role == null ? null : String(row.role),
  status: String(row.status),
  accountPurpose: String(row.account_purpose),
  createdAtISO: new Date(String(row.created_at)).toISOString()
});

const audit = async (input: {
  actorUserId: string | null;
  actorReference?: string;
  targetUserId?: string | null;
  assignmentId?: string | null;
  action: string;
  accountPurpose?: string | null;
  role?: string | null;
  reason: string;
  metadata?: Record<string, unknown>;
}) => {
  await pool.query(
    `insert into qa_provisioning_audit_events
      (id, actor_user_id, target_user_id, assignment_id, action, account_purpose, role, reason, metadata)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [crypto.randomUUID(), input.actorUserId, input.targetUserId ?? null, input.assignmentId ?? null,
      input.action, input.accountPurpose ?? null, input.role ?? null, input.reason,
      JSON.stringify({ ...(input.metadata ?? {}), ...(input.actorReference ? { delegatedActorReference: input.actorReference } : {}) })]
  );
};

export const recordQaIdentityReuse = async (input: {
  actorUserId: string | null;
  actorReference?: string;
  targetUserId: string;
  role: QaRole;
  reason: string;
}) => audit({
  actorUserId: input.actorUserId,
  actorReference: input.actorReference,
  targetUserId: input.targetUserId,
  action: 'QAIdentityReused',
  accountPurpose: 'QA_TEST',
  role: input.role,
  reason: input.reason,
  metadata: { idempotentReplay: true }
});

export const provisionQaIdentity = async (input: {
  actorUserId: string | null;
  actorReference?: string;
  name: string;
  email: string;
  mobileNumber: string;
  role: QaRole;
  reason: string;
}) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const inserted = await client.query(
      `insert into users
        (id, name, email_normalized, mobile_number_normalized, email_verified_at, mobile_verified_at, role, status, account_purpose, version, created_at, updated_at)
       values ($1, $2, lower(trim($3)), $4, now(), now(), $5, 'active', 'QA_TEST', 1, now(), now())
       returning id, name, email_normalized, mobile_number_normalized, role, status, account_purpose, created_at`,
      [crypto.randomUUID(), input.name.trim(), input.email.trim(), normalizeCanonicalPhoneNumber(input.mobileNumber), input.role]
    );
    const user = mapUser(inserted.rows[0]);
    await client.query('commit');
    await audit({ actorUserId: input.actorUserId, actorReference: input.actorReference, targetUserId: user.id, action: 'QAIdentityCreated', accountPurpose: 'QA_TEST', role: input.role, reason: input.reason });

    const clientRecord = input.role === 'user' ? await createOrResolveClientForAccount(user.id) : null;
    if (clientRecord) {
      const owner: ClientOwnershipContext = { accountId: user.id, clientId: clientRecord.id };
      const profile = await createOrUpdateHealthProfile(owner, {});
      await createCareCaseIfMissing(owner, profile.id, 'new_client');
      await audit({ actorUserId: input.actorUserId, actorReference: input.actorReference, targetUserId: user.id, action: 'QAProfileProvisioned', accountPurpose: 'QA_TEST', role: input.role, reason: input.reason, metadata: { clientId: clientRecord.fiteatsyClientId } });
    }
    return { user, client: clientRecord };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
};

export const getQaIdentity = async (userId: string) => {
  const result = await pool.query(
    `select id, name, email_normalized, mobile_number_normalized, role, status, account_purpose, created_at
       from users where id = $1 and deleted_at is null and account_purpose = 'QA_TEST'`,
    [userId]
  );
  return result.rowCount ? mapUser(result.rows[0]) : null;
};

export const listQaAssignments = async () => {
  const result = await pool.query(
    `select a.id, a.consultant_user_id, a.client_user_id, a.status, a.scope, a.starts_at, a.ends_at, a.created_at, a.updated_at,
            c.name as consultant_name, u.name as client_name
       from consultant_client_assignments a
       join users c on c.id = a.consultant_user_id
       join users u on u.id = a.client_user_id
      where c.account_purpose = 'QA_TEST' and u.account_purpose = 'QA_TEST'
      order by a.updated_at desc`
  );
  return result.rows.map((row) => ({
    id: String(row.id), consultantUserId: String(row.consultant_user_id), consultantName: String(row.consultant_name),
    clientUserId: String(row.client_user_id), clientName: String(row.client_name), status: String(row.status),
    scope: String(row.scope), startsAtISO: new Date(String(row.starts_at)).toISOString(),
    endsAtISO: row.ends_at == null ? null : new Date(String(row.ends_at)).toISOString(),
    createdAtISO: new Date(String(row.created_at)).toISOString(), updatedAtISO: new Date(String(row.updated_at)).toISOString()
  }));
};

export const deactivateQaIdentity = async (input: { actorUserId: string; userId: string; reason: string }) => {
  const result = await pool.query(
    `update users set status = 'disabled', updated_at = now(), version = version + 1
       where id = $1 and account_purpose = 'QA_TEST' and deleted_at is null
       returning id`, [input.userId]
  );
  if (!result.rowCount) return null;
  await pool.query(`update auth_sessions set revoked_at = now() where user_id = $1 and revoked_at is null`, [input.userId]);
  await audit({ actorUserId: input.actorUserId, targetUserId: input.userId, action: 'QAIdentityDeactivated', accountPurpose: 'QA_TEST', reason: input.reason });
  return { userId: input.userId, status: 'disabled' as const };
};

export const issueQaSessionAudit = async (actorUserId: string, targetUserId: string, reason: string) => {
  await audit({ actorUserId, targetUserId, action: 'QASessionIssued', accountPurpose: 'QA_TEST', reason });
};

export const resetQaOnboarding = async (input: { actorUserId: string; userId: string; reason: string }) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const target = await client.query(
      `select u.id, hp.id as health_profile_id
         from users u
         join health_profiles hp on hp.user_id = u.id and hp.deleted_at is null and hp.status = 'active'
        where u.id = $1 and u.account_purpose = 'QA_TEST' and lower(u.role) = 'user'
          and u.deleted_at is null and u.status = 'active'
        for update of u, hp`,
      [input.userId]
    );
    if (!target.rowCount) {
      await client.query('rollback');
      return null;
    }

    const healthProfileId = String(target.rows[0].health_profile_id);
    await client.query(
      `update health_profiles
          set date_of_birth_iso = null, calculated_age = null, gender = null,
              height_cm = null, current_weight_kg = null, goal_weight_kg = null,
              waist_cm = null, hip_cm = null, neck_cm = null, body_fat_pct = null,
              occupation = null, working_hours_label = null, shift_type = null,
              activity_level = null, work_mode = null, travel_frequency = null,
              diet_type = null, regional_cuisine = null, preferred_cuisines = '[]'::jsonb,
              foods_liked = '[]'::jsonb, foods_disliked = '[]'::jsonb,
              food_allergies = '[]'::jsonb, food_intolerances = '[]'::jsonb,
              current_supplements = '[]'::jsonb, current_medicines = '[]'::jsonb,
              wake_time = null, breakfast_time = null, lunch_time = null,
              dinner_time = null, sleep_time = null, meals_per_day = null,
              water_intake_liters = null, sleep_hours = null, sleep_goal_hours = null,
              sleep_quality_label = null, outside_food_frequency = null,
              cooking_at_home = null, who_cooks = null, smoking_status = null,
              alcohol_frequency = null, exercise_frequency = null, stress_level_label = null,
              primary_conditions = '[]'::jsonb, previous_conditions = '[]'::jsonb,
              family_history_conditions = '[]'::jsonb, wellness_goals = '[]'::jsonb,
              medical_notes = null, pregnancy_status = null, breastfeeding_status = null,
              pcos_status = null, thyroid_status = null, diabetes_status = null,
              hypertension_status = null, cholesterol_status = null,
              heart_condition_status = null, previous_surgeries = '[]'::jsonb,
              food_preference_profile = '{}'::jsonb,
              food_preference_updated_by = null, food_preference_updated_at = null,
              updated_at = now(), version = version + 1
        where id = $1`,
      [healthProfileId]
    );
    await client.query(
      `update nutrition_profiles
          set completion_percent = 0, readiness_score = 0, ai_ready = false,
              missing_fields = '[]'::jsonb, section_scores = '[]'::jsonb,
              updated_at = now(), version = version + 1
        where health_profile_id = $1 and deleted_at is null and status = 'active'`,
      [healthProfileId]
    );
    await client.query(
      `update recovery_programs
          set current_phase = 'health_profile_pending', updated_at = now(), version = version + 1
        where health_profile_id = $1 and deleted_at is null and status = 'active'`,
      [healthProfileId]
    );
    await client.query(
      `update care_cases
          set previous_stage = current_stage, current_stage = 'health_profile_pending',
              last_transition_at = now(), updated_at = now(), version = version + 1
        where health_profile_id = $1 and deleted_at is null and status = 'active'`,
      [healthProfileId]
    );
    await client.query('commit');
    await audit({
      actorUserId: input.actorUserId,
      targetUserId: input.userId,
      action: 'QAOnboardingReset',
      accountPurpose: 'QA_TEST',
      role: 'user',
      reason: input.reason,
      metadata: { healthProfileId }
    });
    return { userId: input.userId, healthProfileId, onboardingStatus: 'INCOMPLETE' as const };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
};

export const createQaAssignment = async (input: { actorUserId: string; consultantUserId: string; clientUserId: string; reason: string }) => {
  const result = await pool.query(
    `insert into consultant_client_assignments
      (id, consultant_user_id, client_user_id, created_by_user_id)
     select $1, c.id, u.id, $4
       from users c cross join users u
      where c.id = $2 and u.id = $3
        and c.deleted_at is null and u.deleted_at is null
        and c.account_purpose = 'QA_TEST' and u.account_purpose = 'QA_TEST'
        and lower(c.role) in ('consultant', 'provider', 'dietician', 'senior_consultant')
        and lower(u.role) = 'user'
     returning id, consultant_user_id, client_user_id, status, scope, created_at`,
    [crypto.randomUUID(), input.consultantUserId, input.clientUserId, input.actorUserId]
  );
  if (!result.rowCount) return null;
  const assignment = result.rows[0];
  await pool.query(
    `update health_profiles hp set assigned_consultant_id = $1, updated_at = now(), version = hp.version + 1
       from fiteatsy_clients c where c.account_user_id = hp.user_id and hp.user_id = $2 and hp.deleted_at is null`,
    [input.consultantUserId, input.clientUserId]
  );
  await pool.query(
    `update care_cases cc set assigned_consultant_id = $1, updated_at = now(), version = version + 1
       where cc.user_id = $2 and cc.deleted_at is null`,
    [input.consultantUserId, input.clientUserId]
  );
  await audit({ actorUserId: input.actorUserId, targetUserId: input.clientUserId, assignmentId: String(assignment.id), action: 'ConsultantClientAssigned', accountPurpose: 'QA_TEST', role: 'consultant', reason: input.reason, metadata: { consultantUserId: input.consultantUserId } });
  return assignment;
};

export const revokeQaAssignment = async (input: { actorUserId: string; assignmentId: string; reason: string }) => {
  const result = await pool.query(
    `update consultant_client_assignments set status = 'revoked', ends_at = now(), updated_at = now()
       where id = $1 and status = 'active' returning *`, [input.assignmentId]
  );
  if (!result.rowCount) return null;
  const assignment = result.rows[0];
  await pool.query(
    `update health_profiles hp set assigned_consultant_id = null, updated_at = now(), version = version + 1
       where hp.user_id = $1 and hp.assigned_consultant_id = $2 and hp.deleted_at is null`,
    [assignment.client_user_id, assignment.consultant_user_id]
  );
  await pool.query(
    `update care_cases cc set assigned_consultant_id = null, updated_at = now(), version = version + 1
       where cc.user_id = $1 and cc.assigned_consultant_id = $2 and cc.deleted_at is null`,
    [assignment.client_user_id, assignment.consultant_user_id]
  );
  await audit({ actorUserId: input.actorUserId, targetUserId: String(assignment.client_user_id), assignmentId: input.assignmentId, action: 'ConsultantClientAssignmentRevoked', accountPurpose: 'QA_TEST', role: 'consultant', reason: input.reason });
  return assignment;
};
