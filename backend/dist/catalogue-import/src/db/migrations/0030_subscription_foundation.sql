create table if not exists subscription_entitlement_registry (
  code text primary key,
  value_type text not null check (value_type in ('BOOLEAN', 'LIMIT', 'ENUM')),
  description text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists subscription_plan_versions (
  id text primary key,
  plan_id text not null references subscription_plans(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  price_minor integer not null check (price_minor >= 0),
  currency text not null,
  duration_days integer not null check (duration_days > 0),
  duration_months integer not null check (duration_months > 0),
  benefits jsonb not null default '[]'::jsonb,
  terms_text text not null default 'Taxes, if applicable, will be shown at checkout.',
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  unique (plan_id, version_number)
);

create unique index if not exists subscription_plan_versions_current_idx
  on subscription_plan_versions (plan_id)
  where effective_to is null;

create table if not exists subscription_plan_version_entitlements (
  plan_version_id text not null references subscription_plan_versions(id) on delete cascade,
  entitlement_code text not null references subscription_entitlement_registry(code),
  boolean_value boolean,
  limit_value integer,
  enum_value text,
  primary key (plan_version_id, entitlement_code),
  check (num_nonnulls(boolean_value, limit_value, enum_value) = 1)
);

create table if not exists subscription_events (
  id text primary key,
  user_subscription_id text references user_subscriptions(id) on delete set null,
  user_id text references users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table user_subscriptions add column if not exists plan_version_id text references subscription_plan_versions(id);
alter table user_subscriptions add column if not exists plan_code_snapshot text;
alter table user_subscriptions add column if not exists plan_name_snapshot text;
alter table user_subscriptions add column if not exists duration_days_snapshot integer;
alter table user_subscriptions add column if not exists entitlements_snapshot jsonb;

insert into subscription_entitlement_registry (code, value_type, description)
values
  ('health_tracking', 'BOOLEAN', 'Health and wellness tracking'),
  ('wearable_sync', 'BOOLEAN', 'Connected wearable synchronization'),
  ('medication_tracker', 'BOOLEAN', 'Medication tracking'),
  ('medication_reminders', 'BOOLEAN', 'Medication reminders'),
  ('stress_test', 'BOOLEAN', 'Stress Test access'),
  ('stress_recovery', 'BOOLEAN', 'Stress Recovery context'),
  ('health_reports', 'BOOLEAN', 'Health report history'),
  ('progress_tracking', 'BOOLEAN', 'Longitudinal progress tracking'),
  ('diet_plan', 'BOOLEAN', 'Published diet plan access'),
  ('consultant_access', 'BOOLEAN', 'Consultant support access'),
  ('consultations_per_month', 'LIMIT', 'Consultations available per month'),
  ('AI_ASSIST', 'BOOLEAN', 'Fiteatsy assistance'),
  ('EXPERT_ASSISTANCE', 'BOOLEAN', 'Expert assistance'),
  ('EXPERT_CONSULTATION', 'BOOLEAN', 'Expert consultation'),
  ('CARE_CHAT', 'BOOLEAN', 'Care chat'),
  ('DIET_PLAN_ACCESS', 'BOOLEAN', 'Diet plan access'),
  ('REPORT_INTELLIGENCE', 'BOOLEAN', 'Report intelligence'),
  ('APPOINTMENT_BOOKING', 'BOOLEAN', 'Appointment booking')
on conflict (code) do update set value_type = excluded.value_type, description = excluded.description, active = true;

update subscription_plans
set is_active = true,
    is_featured = (code = 'WELLNESS_TRACKING_6M'),
    badge = case when code = 'WELLNESS_TRACKING_6M' then 'Recommended' else null end,
    display_order = case when code = 'WELLNESS_TRACKING_6M' then 1 else 1000 end,
    name = case when code = 'WELLNESS_TRACKING_6M' then '6 Month Wellness Tracking' else name end,
    description = case when code = 'WELLNESS_TRACKING_6M' then 'A complete Fiteatsy foundation for tracking your health patterns and progress.' else description end,
    price_minor = case when code = 'WELLNESS_TRACKING_6M' then 299900 else price_minor end,
    duration_days = case when code = 'WELLNESS_TRACKING_6M' then 183 else duration_days end,
    duration_months = case when code = 'WELLNESS_TRACKING_6M' then 6 else duration_months end,
    benefits = case when code = 'WELLNESS_TRACKING_6M' then '["Health tracking", "Wearable sync", "Stress Test", "Medication tracking", "Progress history"]'::jsonb else benefits end,
    updated_at = now();

insert into subscription_plan_versions (
  id, plan_id, version_number, price_minor, currency, duration_days, duration_months, benefits, terms_text
)
select
  'spv_' || plans.code || '_v1', plans.id, 1, plans.price_minor, plans.currency,
  plans.duration_days, plans.duration_months, plans.benefits,
  'Taxes, if applicable, will be shown at checkout.'
from subscription_plans plans
on conflict (plan_id, version_number) do update set
  price_minor = excluded.price_minor,
  currency = excluded.currency,
  duration_days = excluded.duration_days,
  duration_months = excluded.duration_months,
  benefits = excluded.benefits;

insert into subscription_plan_version_entitlements (plan_version_id, entitlement_code, boolean_value)
select 'spv_WELLNESS_TRACKING_6M_v1', code, true
from subscription_entitlement_registry
where code in ('health_tracking', 'wearable_sync', 'medication_tracker', 'medication_reminders', 'stress_test', 'stress_recovery', 'health_reports', 'progress_tracking')
on conflict (plan_version_id, entitlement_code) do update set boolean_value = true, limit_value = null, enum_value = null;

insert into subscription_plan_version_entitlements (plan_version_id, entitlement_code, boolean_value)
select versions.id, legacy.entitlement_code, true
from plan_entitlements legacy
join subscription_plans plans on plans.id = legacy.plan_id
join subscription_plan_versions versions on versions.plan_id = plans.id and versions.effective_to is null
join subscription_entitlement_registry registry on registry.code = legacy.entitlement_code
on conflict (plan_version_id, entitlement_code) do nothing;

update user_subscriptions subscriptions
set plan_version_id = versions.id,
    plan_code_snapshot = plans.code,
    plan_name_snapshot = plans.name,
    duration_days_snapshot = versions.duration_days,
    entitlements_snapshot = coalesce(subscriptions.entitlements_snapshot, '{}'::jsonb)
from subscription_plans plans
join subscription_plan_versions versions on versions.plan_id = plans.id and versions.effective_to is null
where subscriptions.plan_id = plans.id and subscriptions.plan_version_id is null;

create index if not exists subscription_events_user_created_idx on subscription_events (user_id, created_at desc);
