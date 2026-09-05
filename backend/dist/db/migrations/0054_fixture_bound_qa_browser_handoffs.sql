begin;

alter table qa_fixture_sets drop constraint if exists qa_fixture_sets_purpose_check;
alter table qa_fixture_sets add constraint qa_fixture_sets_purpose_check check (
  purpose in ('COMMON_FOOD_ENGINE_E2E', 'DIET_PARTIAL_PLAN_HYDRATION_E2E')
);

alter table auth_sessions
  add column if not exists qa_fixture_set_id uuid references qa_fixture_sets(id) on delete restrict,
  add column if not exists qa_purpose text,
  add column if not exists qa_role text;

create table if not exists qa_browser_handoffs (
  id uuid primary key,
  code_digest text not null unique,
  fixture_set_id uuid not null references qa_fixture_sets(id) on delete restrict,
  qa_identity_id text not null references users(id) on delete restrict,
  role text not null check (role in ('consultant', 'senior_consultant')),
  purpose text not null check (purpose = 'DIET_PARTIAL_PLAN_HYDRATION_E2E'),
  environment text not null check (environment = 'PRODUCTION_QA'),
  created_by_actor_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  status text not null check (status in ('ISSUED','CONSUMED','EXPIRED','REVOKED')),
  audit_reference uuid not null,
  constraint qa_browser_handoff_expiry_check check (expires_at > created_at),
  constraint qa_browser_handoff_state_check check (
    (status = 'ISSUED' and consumed_at is null and revoked_at is null) or
    (status = 'CONSUMED' and consumed_at is not null and revoked_at is null) or
    (status = 'EXPIRED' and consumed_at is null) or
    (status = 'REVOKED' and revoked_at is not null)
  )
);

create index if not exists qa_browser_handoffs_fixture_idx
  on qa_browser_handoffs (fixture_set_id, role, created_at desc);
create index if not exists auth_sessions_qa_fixture_idx
  on auth_sessions (qa_fixture_set_id, expires_at) where qa_fixture_set_id is not null;

commit;
