alter table diet_plans
  add column if not exists consultant_id text references users(id),
  add column if not exists latest_published_version_id uuid,
  add column if not exists template_version text not null default '2Zestiva_Premium_Personalised_Diet_Plan_Template_v0.2_Compact',
  add column if not exists approved_by text references users(id),
  add column if not exists approved_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists source_snapshot jsonb not null default '{}'::jsonb;

alter table diet_plan_versions
  add column if not exists source_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists content_summary jsonb not null default '{}'::jsonb,
  add column if not exists lifecycle_status text not null default 'draft',
  add column if not exists review_notes text;

create unique index if not exists diet_plan_versions_plan_version_unique
  on diet_plan_versions (diet_plan_id, version_number)
  where deleted_at is null;

create index if not exists diet_plans_client_status_idx
  on diet_plans (care_case_id, plan_status, updated_at desc)
  where deleted_at is null;
