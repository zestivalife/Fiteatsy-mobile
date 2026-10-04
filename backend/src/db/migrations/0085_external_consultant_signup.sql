-- P0.2 external Consultant SaaS signup.
-- Additive only: P0.1 tenant and membership semantics remain authoritative.

create table if not exists external_consultant_signups (
  id uuid primary key,
  auth_identity_id text not null unique,
  fiteatsy_user_id text unique references users(id) on delete restrict,
  email_normalized text,
  mobile_number_normalized text,
  account_type text not null check (account_type in ('INDEPENDENT_CONSULTANT','PRACTICE_OWNER')),
  signup_state text not null check (signup_state in (
    'STARTED','VERIFICATION_PENDING','VERIFIED','ACCOUNT_CREATED','TENANT_CREATED',
    'PROFILE_PENDING','ONBOARDING_IN_PROGRESS','READY','VERIFICATION_EXPIRED',
    'BLOCKED','SUSPENDED','CANCELLED'
  )),
  tenant_id uuid unique references tenants(id) on delete restrict,
  owner_membership_id uuid unique references tenant_memberships(id) on delete restrict,
  onboarding_id uuid unique,
  idempotency_key text not null unique,
  created_by_reference text not null,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (email_normalized is not null or mobile_number_normalized is not null)
);

create unique index if not exists external_consultant_signups_email_unique
  on external_consultant_signups(lower(email_normalized)) where email_normalized is not null;

create unique index if not exists external_consultant_signups_mobile_unique
  on external_consultant_signups(mobile_number_normalized) where mobile_number_normalized is not null;

create table if not exists external_practitioner_profiles (
  id uuid primary key,
  user_id text not null unique references users(id) on delete restrict,
  tenant_id uuid not null unique references tenants(id) on delete restrict,
  display_name text not null,
  professional_title text,
  speciality text,
  status text not null default 'active' check (status in ('active','suspended','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists external_consultant_onboarding (
  id uuid primary key,
  signup_id uuid not null unique references external_consultant_signups(id) on delete cascade,
  user_id text not null unique references users(id) on delete restrict,
  tenant_id uuid not null unique references tenants(id) on delete restrict,
  current_step text not null default 'PROFESSIONAL_PROFILE',
  status text not null default 'IN_PROGRESS' check (status in ('IN_PROGRESS','READY','BLOCKED')),
  account_type_complete boolean not null default true,
  profile_complete boolean not null default false,
  professional_details_complete boolean not null default false,
  practice_details_complete boolean not null default false,
  workspace_ready boolean not null default false,
  required_steps jsonb not null default '[]'::jsonb,
  completed_steps jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table external_consultant_signups
  add constraint external_consultant_signups_onboarding_fk
  foreign key (onboarding_id) references external_consultant_onboarding(id) on delete restrict;

create table if not exists external_consultant_signup_events (
  id uuid primary key,
  signup_id uuid not null references external_consultant_signups(id) on delete cascade,
  actor_reference text,
  from_state text,
  to_state text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists external_consultant_signup_events_signup_idx
  on external_consultant_signup_events(signup_id, created_at);

comment on table external_consultant_signups is
  'P0.2 recoverable external SaaS signup state. Authentication credentials remain owned by the Consultant auth service.';

comment on table external_practitioner_profiles is
  'Minimal external practitioner identity linked to the canonical P0.1 tenant.';

comment on table external_consultant_onboarding is
  'Persistent resumable onboarding state for an externally authenticated tenant owner.';
