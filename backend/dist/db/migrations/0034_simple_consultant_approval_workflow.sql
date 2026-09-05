alter table diet_plans
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_by text references users(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_comment text;

alter table diet_plan_versions
  drop constraint if exists diet_plan_versions_lifecycle_status_check;

alter table diet_plans
  drop constraint if exists diet_plans_plan_status_check;

update diet_plans
set plan_status = 'submitted_for_review'
where plan_status = 'review_ready';

update diet_plans
set submitted_at = coalesce(submitted_at, updated_at)
where plan_status = 'submitted_for_review';

update diet_plan_versions
set lifecycle_status = 'submitted_for_review'
where lifecycle_status = 'review_ready';

alter table diet_plans
  add constraint diet_plans_plan_status_check
  check (plan_status in ('draft', 'submitted_for_review', 'changes_requested', 'approved', 'published', 'archived'));

alter table diet_plan_versions
  add constraint diet_plan_versions_lifecycle_status_check
  check (lifecycle_status in ('draft', 'submitted_for_review', 'changes_requested', 'approved', 'published', 'archived'));

create table if not exists diet_plan_review_events (
  id uuid primary key,
  diet_plan_id uuid not null references diet_plans(id) on delete restrict,
  diet_plan_version_id uuid not null references diet_plan_versions(id) on delete restrict,
  actor_user_id text not null references users(id) on delete restrict,
  event_type text not null check (event_type in ('submitted_for_review', 'changes_requested', 'resubmitted', 'approved', 'published')),
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists diet_plan_review_events_plan_idx
  on diet_plan_review_events (diet_plan_id, created_at desc);
