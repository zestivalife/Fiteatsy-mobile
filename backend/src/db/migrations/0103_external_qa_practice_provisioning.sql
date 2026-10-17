begin;

create table if not exists external_qa_practice_provisioning (
  id uuid primary key,
  fixture_key text not null unique,
  auth_identity_id text not null unique,
  signup_id uuid not null unique references external_consultant_signups(id) on delete restrict,
  fiteatsy_user_id text not null unique references users(id) on delete restrict,
  tenant_id uuid not null unique references tenants(id) on delete restrict,
  profession_code text not null check (profession_code in (
    'DIABETES_EDUCATOR','PSYCHOLOGIST','WELLNESS_CONSULTANT','HEALTH_COACH',
    'BEHAVIOURAL_THERAPIST','OCCUPATIONAL_THERAPIST','PHYSIOTHERAPIST','MENTAL_WELLNESS_THERAPIST'
  )),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','DEACTIVATED')),
  created_client_ids jsonb not null default '[]'::jsonb,
  provisioning_source text not null default 'PLATFORM_OWNER_GOVERNED_EXTERNAL_QA',
  created_by_reference text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deactivated_at timestamptz,
  deactivated_by_reference text,
  deactivation_reason text
);

create index if not exists external_qa_practice_provisioning_actor_idx
  on external_qa_practice_provisioning(created_by_reference, created_at desc);

create table if not exists external_qa_practice_audit_events (
  id uuid primary key,
  provisioning_id uuid not null references external_qa_practice_provisioning(id) on delete restrict,
  event_type text not null check (event_type in ('QA_EXTERNAL_PRACTICE_PROVISIONED','QA_EXTERNAL_PRACTICE_REUSED','QA_EXTERNAL_PRACTICE_DEACTIVATED')),
  actor_reference text not null,
  profession_code text not null,
  tenant_id uuid not null,
  fiteatsy_user_id text not null,
  created_entities jsonb not null default '{}'::jsonb,
  provisioning_source text not null default 'PLATFORM_OWNER_GOVERNED_EXTERNAL_QA',
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists external_qa_practice_audit_events_scope_idx
  on external_qa_practice_audit_events(tenant_id, created_at desc);

comment on table external_qa_practice_provisioning is
  'Governed QA-only lineage over canonical External tenant, membership, practitioner, and client models.';

commit;
