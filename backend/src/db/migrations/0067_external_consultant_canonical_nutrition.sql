alter table diet_plans
  add column if not exists external_source_system text,
  add column if not exists external_connection_id text,
  add column if not exists external_plan_id text;

create unique index if not exists diet_plans_external_source_unique
  on diet_plans (external_source_system, external_connection_id, external_plan_id)
  where deleted_at is null and external_source_system is not null;

alter table diet_plan_versions
  add column if not exists external_source_version text;

create unique index if not exists diet_plan_versions_external_source_version_unique
  on diet_plan_versions (diet_plan_id, external_source_version)
  where deleted_at is null and external_source_version is not null;

create table if not exists client_active_diet_plan_selections (
  id uuid primary key,
  care_case_id uuid not null references care_cases(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  diet_plan_id uuid not null references diet_plans(id) on delete cascade,
  diet_plan_version_id uuid not null references diet_plan_versions(id) on delete cascade,
  selected_by text not null,
  source text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (care_case_id, user_id),
  check (source in ('INTERNAL_CONSULTANT', 'EXTERNAL_CONSULTANT', 'CLIENT'))
);

create index if not exists client_active_diet_plan_selections_plan_idx
  on client_active_diet_plan_selections (diet_plan_id, diet_plan_version_id);
