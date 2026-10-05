import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import {
  assertExternalSignupTransition,
  type ExternalSignupState
} from './external-signup.state-machine.js';

export type ExternalAccountType = 'INDEPENDENT_CONSULTANT' | 'PRACTICE_OWNER';

export type ExternalSignupProvisionInput = {
  authIdentityId: string;
  name: string;
  email?: string;
  mobileNumber?: string;
  accountType: ExternalAccountType;
  professionalTitle?: string;
  speciality?: string;
  practiceName?: string;
  contactVerification?: 'VERIFIED_MOBILE' | 'UNVERIFIED_SIGNUP';
  professionalDetails?: Record<string, unknown>;
  country: string;
  timezone: string;
  idempotencyKey: string;
  actorReference: string;
};

type SignupRow = {
  id: string;
  auth_identity_id: string;
  fiteatsy_user_id: string | null;
  email_normalized: string | null;
  mobile_number_normalized: string | null;
  account_type: ExternalAccountType;
  signup_state: ExternalSignupState;
  tenant_id: string | null;
  owner_membership_id: string | null;
  onboarding_id: string | null;
  idempotency_key: string;
  last_error_code: string | null;
};

export type ExternalConsultantOnboardingUpdate = {
  consultantName?: string;
  professionalTitle?: string | null;
  speciality?: string | null;
  practiceName?: string | null;
  country?: string;
  timezone?: string;
  contactInformation?: Record<string, unknown>;
  professionalDetails?: Record<string, unknown>;
  acceptTerms?: boolean;
  version: number;
};

const canonicalEmail = (value?: string) => value?.trim().toLowerCase() || null;
export const canonicalExternalMobile = (value?: string) => {
  const digits = value?.replace(/\D/g, '') ?? '';
  if (!digits) return null;
  return digits.length === 10 ? `91${digits}` : digits;
};
const safeSlug = (name: string, signupId: string) => {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 42) || 'consultant';
  return `${base}-${signupId.replace(/-/g, '').slice(0, 10)}`;
};

export class ExternalSignupProvisionError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
    this.name = 'ExternalSignupProvisionError';
  }
}

const selectSignup = async (client: PoolClient, authIdentityId: string, lock = false) => {
  const result = await client.query<SignupRow>(
    `select * from external_consultant_signups where auth_identity_id=$1${lock ? ' for update' : ''}`,
    [authIdentityId]
  );
  return result.rows[0] ?? null;
};

const recordEvent = (client: PoolClient, signupId: string, from: ExternalSignupState | null, to: ExternalSignupState, actor: string, metadata: object = {}) =>
  client.query(
    `insert into external_consultant_signup_events(id,signup_id,from_state,to_state,actor_reference,metadata)
     values($1,$2,$3,$4,$5,$6)`,
    [crypto.randomUUID(), signupId, from, to, actor, JSON.stringify(metadata)]
  );

const transition = async (client: PoolClient, row: SignupRow, next: ExternalSignupState, actor: string, metadata: object = {}) => {
  if (row.signup_state === next) return row;
  assertExternalSignupTransition(row.signup_state, next);
  const result = await client.query<SignupRow>(
    `update external_consultant_signups
       set signup_state=$2,last_error_code=null,updated_at=now(),completed_at=case when $2='READY' then now() else completed_at end
     where id=$1 returning *`,
    [row.id, next]
  );
  await recordEvent(client, row.id, row.signup_state, next, actor, metadata);
  return result.rows[0];
};

const validateIdentityBinding = (row: SignupRow, input: ExternalSignupProvisionInput) => {
  if (row.account_type !== input.accountType || row.email_normalized !== canonicalEmail(input.email) || row.mobile_number_normalized !== canonicalExternalMobile(input.mobileNumber)) {
    throw new ExternalSignupProvisionError('AUTH_IDENTITY_BINDING_CONFLICT', 409, 'The verified auth identity is already bound to different signup attributes.');
  }
};

async function ensureSignupAndUser(client: PoolClient, input: ExternalSignupProvisionInput) {
  const contactVerification = input.contactVerification ?? 'VERIFIED_MOBILE';
  let row = await selectSignup(client, input.authIdentityId, true);
  if (!row) {
    const id = crypto.randomUUID();
    const inserted = await client.query<SignupRow>(
      `insert into external_consultant_signups(
         id,auth_identity_id,email_normalized,mobile_number_normalized,account_type,signup_state,idempotency_key,created_by_reference
       ) values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [id, input.authIdentityId, canonicalEmail(input.email), canonicalExternalMobile(input.mobileNumber), input.accountType,
        contactVerification === 'UNVERIFIED_SIGNUP' ? 'REGISTRATION_ACCEPTED' : 'MOBILE_VERIFIED',
        input.idempotencyKey, input.actorReference]
    );
    row = inserted.rows[0];
    await recordEvent(client, row.id, null, row.signup_state, input.actorReference, { accountType: input.accountType });
  } else {
    validateIdentityBinding(row, input);
  }

  if (!row.fiteatsy_user_id) {
    const userId = `ext_${crypto.randomUUID()}`;
    await client.query(
      `insert into users(id,name,email_normalized,mobile_number_normalized,email_verified_at,mobile_verified_at,role,status)
       values($1,$2,$3,$4,
         case when $5='VERIFIED_MOBILE' and $3::text is not null then now() else null end,
         case when $5='VERIFIED_MOBILE' and $4::text is not null then now() else null end,
         'external_owner','active')`,
      [userId, input.name.trim(), canonicalEmail(input.email), canonicalExternalMobile(input.mobileNumber), contactVerification]
    );
    const updated = await client.query<SignupRow>(
      `update external_consultant_signups set fiteatsy_user_id=$2,updated_at=now() where id=$1 returning *`,
      [row.id, userId]
    );
    row = updated.rows[0];
  }
  if (row.signup_state === 'MOBILE_VERIFIED' || row.signup_state === 'REGISTRATION_ACCEPTED') row = await transition(client, row, 'ACCOUNT_CREATED', input.actorReference);
  return row;
}

async function ensureTenantAndOwner(client: PoolClient, row: SignupRow, input: ExternalSignupProvisionInput) {
  if (!row.fiteatsy_user_id) throw new ExternalSignupProvisionError('ACCOUNT_NOT_CREATED', 409, 'The local account must exist before tenant provisioning.');
  if (!row.tenant_id || !row.owner_membership_id) {
    const tenantId = row.tenant_id ?? crypto.randomUUID();
    const membershipId = row.owner_membership_id ?? crypto.randomUUID();
    const tenantType = input.accountType === 'PRACTICE_OWNER' ? 'PRACTICE' : 'INDEPENDENT_CONSULTANT';
    const tenantName = input.practiceName?.trim() || `${input.name.trim()} Practice`;
    await client.query(
      `insert into tenants(id,name,slug,tenant_type,status,billing_owner_user_id,default_timezone,country,currency)
       values($1,$2,$3,$4,'active',$5,$6,$7,'INR') on conflict(id) do nothing`,
      [tenantId, tenantName, safeSlug(tenantName, row.id), tenantType, row.fiteatsy_user_id, input.timezone, input.country]
    );
    await client.query(
      `insert into tenant_memberships(id,tenant_id,user_id,tenant_role,status)
       values($1,$2,$3,'OWNER','active') on conflict(tenant_id,user_id) do update set tenant_role='OWNER',status='active',removed_at=null,updated_at=now()`,
      [membershipId, tenantId, row.fiteatsy_user_id]
    );
    const canonicalMembership = await client.query<{ id: string }>(
      `select id from tenant_memberships where tenant_id=$1 and user_id=$2 and tenant_role='OWNER' and status='active' and removed_at is null`,
      [tenantId, row.fiteatsy_user_id]
    );
    const persistedMembershipId = canonicalMembership.rows[0]?.id;
    if (!persistedMembershipId) throw new ExternalSignupProvisionError('OWNER_MEMBERSHIP_NOT_CREATED', 500, 'The tenant owner membership could not be established.');
    const updated = await client.query<SignupRow>(
      `update external_consultant_signups set tenant_id=$2,owner_membership_id=$3,updated_at=now() where id=$1 returning *`,
      [row.id, tenantId, persistedMembershipId]
    );
    row = updated.rows[0];
  }
  if (row.signup_state === 'ACCOUNT_CREATED') row = await transition(client, row, 'TENANT_CREATED', input.actorReference, { tenantId: row.tenant_id });
  return row;
}

async function ensureProfileAndOnboarding(client: PoolClient, row: SignupRow, input: ExternalSignupProvisionInput) {
  if (!row.fiteatsy_user_id || !row.tenant_id) throw new ExternalSignupProvisionError('TENANT_NOT_CREATED', 409, 'Tenant provisioning must complete before profile creation.');
  await client.query(
    `insert into external_practitioner_profiles(id,user_id,tenant_id,display_name,professional_title,speciality,status)
     values($1,$2,$3,$4,$5,$6,'active') on conflict(user_id) do update set display_name=excluded.display_name,professional_title=excluded.professional_title,speciality=excluded.speciality,updated_at=now()`,
    [crypto.randomUUID(), row.fiteatsy_user_id, row.tenant_id, input.name.trim(), input.professionalTitle ?? null, input.speciality ?? null]
  );
  if (row.signup_state === 'TENANT_CREATED') row = await transition(client, row, 'PROFILE_PENDING', input.actorReference);

  if (!row.onboarding_id) {
    const onboardingId = crypto.randomUUID();
    await client.query(
      `insert into external_consultant_onboarding(
         id,signup_id,user_id,tenant_id,current_step,status,account_type_complete,profile_complete,
         professional_details_complete,practice_details_complete,consultant_name,professional_title,speciality,
         practice_name,country,timezone,contact_information,professional_details,workspace_ready,required_steps,completed_steps
       ) values($1,$2,$3,$4,'PROFESSIONAL_PROFILE','IN_PROGRESS',true,true,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,false,$15,$16)`,
      [
        onboardingId,
        row.id,
        row.fiteatsy_user_id,
        row.tenant_id,
        Boolean(input.professionalTitle || input.speciality),
        input.accountType === 'INDEPENDENT_CONSULTANT' || Boolean(input.practiceName),
        input.name.trim(),
        input.professionalTitle ?? null,
        input.speciality ?? null,
        input.practiceName ?? null,
        input.country,
        input.timezone,
        JSON.stringify({ email: canonicalEmail(input.email), mobileNumber: canonicalExternalMobile(input.mobileNumber) }),
        JSON.stringify(input.professionalDetails ?? {}),
        JSON.stringify(input.accountType === 'PRACTICE_OWNER'
          ? ['PROFESSIONAL_PROFILE', 'PRACTICE_DETAILS', 'TERMS_ACCEPTANCE']
          : ['PROFESSIONAL_PROFILE', 'TERMS_ACCEPTANCE']),
        JSON.stringify(['ACCOUNT_TYPE', 'BASIC_PROFILE'])
      ]
    );
    const updated = await client.query<SignupRow>(
      `update external_consultant_signups set onboarding_id=$2,updated_at=now() where id=$1 returning *`,
      [row.id, onboardingId]
    );
    row = updated.rows[0];
  }
  if (row.signup_state === 'PROFILE_PENDING') row = await transition(client, row, 'ONBOARDING_IN_PROGRESS', input.actorReference);
  return row;
}

const response = (row: SignupRow) => ({
  signupId: row.id,
  authIdentityId: row.auth_identity_id,
  userId: row.fiteatsy_user_id,
  tenantId: row.tenant_id,
  ownerMembershipId: row.owner_membership_id,
  onboardingId: row.onboarding_id,
  accountType: row.account_type,
  state: row.signup_state,
  workspaceReady: row.signup_state === 'READY'
});

export async function provisionExternalConsultant(input: ExternalSignupProvisionInput) {
  if (!input.email && !input.mobileNumber) throw new ExternalSignupProvisionError('CONTACT_REQUIRED', 422, 'An email address or mobile number is required.');
  const client = await pool.connect();
  try {
    await client.query('begin');
    let row = await ensureSignupAndUser(client, input);
    row = await ensureTenantAndOwner(client, row, input);
    row = await ensureProfileAndOnboarding(client, row, input);
    await client.query('commit');
    return response(row);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function getExternalSignupByAuthIdentity(authIdentityId: string) {
  const result = await pool.query<SignupRow>('select * from external_consultant_signups where auth_identity_id=$1', [authIdentityId]);
  return result.rows[0] ? response(result.rows[0]) : null;
}

const onboardingProjection = (row: Record<string, unknown>) => ({
  id: String(row.id),
  accountType: String(row.account_type),
  status: String(row.status),
  currentStep: String(row.current_step),
  consultantName: row.consultant_name == null ? null : String(row.consultant_name),
  professionalTitle: row.professional_title == null ? null : String(row.professional_title),
  speciality: row.speciality == null ? null : String(row.speciality),
  practiceName: row.practice_name == null ? null : String(row.practice_name),
  country: String(row.country),
  timezone: String(row.timezone),
  contactInformation: row.contact_information ?? {},
  professionalDetails: row.professional_details ?? {},
  requiredSteps: row.required_steps ?? [],
  completedSteps: row.completed_steps ?? [],
  termsAccepted: row.terms_accepted_at != null,
  workspaceReady: Boolean(row.workspace_ready),
  version: Number(row.version)
});

const selectOnboardingForOwner = async (client: Queryable, userId: string, lock = false) => {
  const result = await client.query(
    `select o.*,s.account_type
       from external_consultant_onboarding o
       join external_consultant_signups s on s.id=o.signup_id
      where o.user_id=$1${lock ? ' for update of o' : ''}`,
    [userId]
  );
  return result.rows[0] ?? null;
};

type Queryable = Pick<PoolClient, 'query'>;

export async function getExternalConsultantOnboarding(userId: string) {
  const row = await selectOnboardingForOwner(pool, userId);
  if (!row) throw new ExternalSignupProvisionError('EXTERNAL_ONBOARDING_NOT_FOUND', 404, 'Consultant onboarding was not found.');
  return onboardingProjection(row);
}

export async function updateExternalConsultantOnboarding(userId: string, input: ExternalConsultantOnboardingUpdate) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const current = await selectOnboardingForOwner(client, userId, true);
    if (!current) throw new ExternalSignupProvisionError('EXTERNAL_ONBOARDING_NOT_FOUND', 404, 'Consultant onboarding was not found.');
    if (Number(current.version) !== input.version) throw new ExternalSignupProvisionError('STALE_ONBOARDING_VERSION', 409, 'Consultant onboarding changed. Reload and retry.');
    const result = await client.query(
      `update external_consultant_onboarding
          set consultant_name=coalesce($2,consultant_name),professional_title=$3,speciality=$4,
              practice_name=$5,country=coalesce($6,country),timezone=coalesce($7,timezone),
              contact_information=coalesce($8,contact_information),professional_details=coalesce($9,professional_details),
              terms_accepted_at=case when $10 then coalesce(terms_accepted_at,now()) else terms_accepted_at end,
              professional_details_complete=coalesce($2,consultant_name) is not null
                and (nullif(coalesce($3,professional_title),'') is not null or nullif(coalesce($4,speciality),'') is not null),
              practice_details_complete=case when $11='INDEPENDENT_CONSULTANT' then true else nullif(coalesce($5,practice_name),'') is not null end,
              current_step=case when not $10 then 'TERMS_ACCEPTANCE' else current_step end,
              version=version+1,updated_at=now()
        where id=$1 returning *`,
      [current.id, input.consultantName ?? null, input.professionalTitle ?? current.professional_title,
        input.speciality ?? current.speciality, input.practiceName ?? current.practice_name,
        input.country ?? null, input.timezone ?? null,
        input.contactInformation ? JSON.stringify(input.contactInformation) : null,
        input.professionalDetails ? JSON.stringify(input.professionalDetails) : null,
        Boolean(input.acceptTerms), current.account_type]
    );
    await client.query(
      `update external_practitioner_profiles set display_name=coalesce($2,display_name),professional_title=$3,speciality=$4,updated_at=now() where user_id=$1`,
      [userId, input.consultantName ?? null, input.professionalTitle ?? current.professional_title, input.speciality ?? current.speciality]
    );
    await client.query('commit');
    return onboardingProjection({ ...result.rows[0], account_type: current.account_type });
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally { client.release(); }
}

export async function completeExternalConsultantOnboarding(userId: string, version: number) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const current = await selectOnboardingForOwner(client, userId, true);
    if (!current) throw new ExternalSignupProvisionError('EXTERNAL_ONBOARDING_NOT_FOUND', 404, 'Consultant onboarding was not found.');
    if (Number(current.version) !== version) throw new ExternalSignupProvisionError('STALE_ONBOARDING_VERSION', 409, 'Consultant onboarding changed. Reload and retry.');
    if (!current.professional_details_complete || !current.practice_details_complete || !current.terms_accepted_at) {
      throw new ExternalSignupProvisionError('ONBOARDING_INCOMPLETE', 422, 'Complete professional, practice, and terms steps before entering the workspace.');
    }
    const result = await client.query(
      `update external_consultant_onboarding set status='READY',current_step='COMPLETE',workspace_ready=true,
              completed_steps=required_steps,version=version+1,updated_at=now()
        where id=$1 returning *`, [current.id]
    );
    await client.query(
      `update external_consultant_signups set signup_state='READY',completed_at=coalesce(completed_at,now()),updated_at=now() where id=$1`,
      [current.signup_id]
    );
    await recordEvent(client, String(current.signup_id), 'ONBOARDING_IN_PROGRESS', 'READY', userId, { onboardingId: current.id });
    await client.query('commit');
    return onboardingProjection({ ...result.rows[0], account_type: current.account_type });
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally { client.release(); }
}
