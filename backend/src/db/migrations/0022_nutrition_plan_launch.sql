alter table diet_plans
  add column if not exists consultant_id text references users(id),
  add column if not exists latest_published_version_id uuid,
  add column if not exists template_version text not null default '2Zestiva_Premium_Personalised_Diet_Plan_Template_v0.2_Compact',
  add column if not exists approved_by text references users(id),
  add column if not exists approved_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists source_snapshot jsonb not null default '{}'::jsonb;

update diet_plans
set
  plan_status = 'draft',
  source_snapshot = coalesce(source_snapshot, '{}'::jsonb),
  template_version = coalesce(template_version, '2Zestiva_Premium_Personalised_Diet_Plan_Template_v0.2_Compact')
where
  plan_status is null
  or plan_status not in ('draft', 'review_ready', 'approved', 'published', 'archived')
  or source_snapshot is null
  or template_version is null;

alter table diet_plans
  alter column plan_status set default 'draft',
  alter column plan_status set not null,
  alter column template_version set default '2Zestiva_Premium_Personalised_Diet_Plan_Template_v0.2_Compact',
  alter column template_version set not null,
  alter column source_snapshot set default '{}'::jsonb,
  alter column source_snapshot set not null;

alter table diet_plan_versions
  add column if not exists source_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists content_summary jsonb not null default '{}'::jsonb,
  add column if not exists lifecycle_status text not null default 'draft',
  add column if not exists review_notes text;

update diet_plan_versions
set
  lifecycle_status = 'draft',
  source_snapshot = coalesce(source_snapshot, '{}'::jsonb),
  content_summary = coalesce(content_summary, '{}'::jsonb)
where
  lifecycle_status is null
  or lifecycle_status not in ('draft', 'review_ready', 'approved', 'published', 'archived')
  or source_snapshot is null
  or content_summary is null;

alter table diet_plan_versions
  alter column lifecycle_status set default 'draft',
  alter column lifecycle_status set not null,
  alter column source_snapshot set default '{}'::jsonb,
  alter column source_snapshot set not null,
  alter column content_summary set default '{}'::jsonb,
  alter column content_summary set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'diet_plans_plan_status_check'
  ) then
    alter table diet_plans
      add constraint diet_plans_plan_status_check
      check (plan_status in ('draft', 'review_ready', 'approved', 'published', 'archived'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'diet_plan_versions_lifecycle_status_check'
  ) then
    alter table diet_plan_versions
      add constraint diet_plan_versions_lifecycle_status_check
      check (lifecycle_status in ('draft', 'review_ready', 'approved', 'published', 'archived'));
  end if;
end $$;

create unique index if not exists diet_plan_versions_plan_version_unique
  on diet_plan_versions (diet_plan_id, version_number)
  where deleted_at is null;

create index if not exists diet_plans_client_status_idx
  on diet_plans (care_case_id, plan_status, updated_at desc)
  where deleted_at is null;
