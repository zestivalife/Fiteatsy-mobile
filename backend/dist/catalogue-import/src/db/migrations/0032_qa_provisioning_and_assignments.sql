alter table users
  add column if not exists account_purpose text not null default 'PRODUCTION_USER';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_account_purpose_check'
  ) then
    alter table users add constraint users_account_purpose_check
      check (account_purpose in ('PRODUCTION_USER', 'QA_TEST'));
  end if;
end
$$;

create index if not exists users_account_purpose_idx
  on users (account_purpose, status)
  where deleted_at is null;

create table if not exists consultant_client_assignments (
  id uuid primary key,
  consultant_user_id text not null references users(id) on delete restrict,
  client_user_id text not null references users(id) on delete restrict,
  status text not null default 'active',
  scope text not null default 'client_care',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by_user_id text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consultant_client_assignments_status_check check (status in ('active', 'revoked', 'ended')),
  constraint consultant_client_assignments_scope_check check (scope in ('client_care')),
  constraint consultant_client_assignments_distinct_users check (consultant_user_id <> client_user_id)
);

create unique index if not exists consultant_client_assignments_active_unique
  on consultant_client_assignments (consultant_user_id, client_user_id, scope)
  where status = 'active';

create index if not exists consultant_client_assignments_consultant_idx
  on consultant_client_assignments (consultant_user_id, status, updated_at desc);

create index if not exists consultant_client_assignments_client_idx
  on consultant_client_assignments (client_user_id, status, updated_at desc);

create table if not exists qa_provisioning_audit_events (
  id uuid primary key,
  actor_user_id text references users(id) on delete set null,
  target_user_id text references users(id) on delete set null,
  assignment_id uuid references consultant_client_assignments(id) on delete set null,
  action text not null,
  account_purpose text,
  role text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists qa_provisioning_audit_target_idx
  on qa_provisioning_audit_events (target_user_id, created_at desc);

create index if not exists qa_provisioning_audit_assignment_idx
  on qa_provisioning_audit_events (assignment_id, created_at desc);
