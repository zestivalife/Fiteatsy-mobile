create table if not exists subscription_plans (
  id text primary key,
  code text not null unique,
  name text not null,
  description text not null,
  duration_days integer not null check (duration_days > 0),
  duration_months integer not null check (duration_months > 0),
  price_minor integer not null check (price_minor >= 0),
  currency text not null default 'INR',
  is_active boolean not null default true,
  is_featured boolean not null default false,
  badge text,
  display_order integer not null default 100,
  benefits jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists plan_entitlements (
  id text primary key,
  plan_id text not null references subscription_plans(id) on delete cascade,
  entitlement_code text not null,
  created_at timestamptz not null default now(),
  unique (plan_id, entitlement_code)
);

create table if not exists payment_orders (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  subscription_plan_id text not null references subscription_plans(id),
  provider text not null,
  provider_order_id text,
  amount_minor integer not null check (amount_minor >= 0),
  currency text not null,
  status text not null,
  source text,
  required_entitlement text,
  return_destination text,
  idempotency_key text not null,
  provider_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create unique index if not exists payment_orders_provider_order_unique
  on payment_orders (provider, provider_order_id)
  where provider_order_id is not null;

create index if not exists payment_orders_user_status_idx
  on payment_orders (user_id, status, created_at desc);

create table if not exists user_subscriptions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  plan_id text not null references subscription_plans(id),
  status text not null,
  starts_at timestamptz,
  expires_at timestamptz,
  payment_provider text,
  provider_order_id text,
  provider_payment_id text,
  payment_order_id text references payment_orders(id),
  amount_paid_minor integer not null default 0 check (amount_paid_minor >= 0),
  currency text not null default 'INR',
  auto_renew boolean not null default false,
  cancelled_at timestamptz,
  expired_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_subscriptions_provider_payment_unique
  on user_subscriptions (payment_provider, provider_payment_id)
  where provider_payment_id is not null;

create index if not exists user_subscriptions_active_user_idx
  on user_subscriptions (user_id, status, expires_at desc);

create table if not exists payment_transactions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  payment_order_id text not null references payment_orders(id),
  subscription_id text references user_subscriptions(id),
  provider text not null,
  provider_order_id text not null,
  provider_payment_id text,
  amount_minor integer not null check (amount_minor >= 0),
  currency text not null,
  status text not null,
  payment_method text,
  verified_at timestamptz,
  captured_at timestamptz,
  failed_at timestamptz,
  failure_code text,
  failure_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payment_transactions_provider_payment_unique
  on payment_transactions (provider, provider_payment_id)
  where provider_payment_id is not null;

create index if not exists payment_transactions_user_created_idx
  on payment_transactions (user_id, created_at desc);

create table if not exists payment_webhook_events (
  id text primary key,
  provider text not null,
  provider_event_id text,
  event_type text not null,
  payload_hash text not null,
  processing_status text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text,
  unique (provider, provider_event_id),
  unique (provider, payload_hash)
);

create table if not exists subscription_audit_events (
  id text primary key,
  user_id text references users(id) on delete set null,
  subscription_id text references user_subscriptions(id) on delete set null,
  payment_order_id text references payment_orders(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists subscription_audit_events_user_created_idx
  on subscription_audit_events (user_id, created_at desc);

insert into subscription_plans (
  id,
  code,
  name,
  description,
  duration_days,
  duration_months,
  price_minor,
  currency,
  is_active,
  is_featured,
  badge,
  display_order,
  benefits
) values
  (
    'plan_wellness_tracking_6m',
    'WELLNESS_TRACKING_6M',
    '6 Month Wellness Tracking',
    'Self-guided Fiteatsy wellness tracking with report and recovery context.',
    183,
    6,
    299900,
    'INR',
    true,
    false,
    null,
    10,
    '["Health trend tracking","Report history view","Recovery signals","Progress reminders"]'::jsonb
  ),
  (
    'plan_wellness_tracking_12m',
    'WELLNESS_TRACKING_12M',
    '12 Month Wellness Tracking',
    'Year-long self-guided tracking for long-term health pattern visibility.',
    365,
    12,
    499900,
    'INR',
    true,
    true,
    'Best Value',
    20,
    '["Year-long health timeline","Best tracking value","Wearable trend context","Report comparison history"]'::jsonb
  ),
  (
    'plan_lifestyle_modification_consult',
    'LIFESTYLE_MODIFICATION_CONSULT',
    'Lifestyle Modification Consult',
    'One expert review for lifestyle direction without ongoing commitment.',
    30,
    1,
    99900,
    'INR',
    true,
    false,
    null,
    30,
    '["One expert review","Lifestyle direction","Report discussion","No ongoing commitment"]'::jsonb
  ),
  (
    'plan_clinical_care_1m',
    'CLINICAL_CARE_1M',
    '1 Month Clinical Care',
    'Lower-commitment expert-guided starter care plan.',
    30,
    1,
    299900,
    'INR',
    true,
    false,
    null,
    40,
    '["Expert-guided starter plan","Weekly care check-ins","Nutrition direction","Lower-commitment trial"]'::jsonb
  ),
  (
    'plan_clinical_transformation_3m',
    'CLINICAL_TRANSFORMATION_3M',
    '3 Month Clinical Transformation',
    'Ongoing expert support for nutrition, lifestyle, and sustainable habit formation.',
    92,
    3,
    599900,
    'INR',
    true,
    true,
    'Recommended',
    50,
    '["Ongoing expert support","Nutrition and lifestyle coaching","Habit formation","Progress reviews"]'::jsonb
  ),
  (
    'plan_deep_healing_6m',
    'DEEP_HEALING_6M',
    '6 Month Deep Healing Program',
    'Long-term expert support and accountability for deeper lifestyle transformation.',
    183,
    6,
    699900,
    'INR',
    true,
    false,
    null,
    60,
    '["Long-term expert support","Deep lifestyle accountability","Complex support planning","Extended progress tracking"]'::jsonb
  )
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  duration_days = excluded.duration_days,
  duration_months = excluded.duration_months,
  price_minor = excluded.price_minor,
  currency = excluded.currency,
  is_active = excluded.is_active,
  is_featured = excluded.is_featured,
  badge = excluded.badge,
  display_order = excluded.display_order,
  benefits = excluded.benefits,
  updated_at = now();

insert into plan_entitlements (id, plan_id, entitlement_code)
select
  'pe_' || md5(plan_code || ':' || entitlement_code),
  plan_id,
  entitlement_code
from (
  values
    ('WELLNESS_TRACKING_6M', 'AI_ASSIST'),
    ('WELLNESS_TRACKING_6M', 'REPORT_INTELLIGENCE'),
    ('WELLNESS_TRACKING_12M', 'AI_ASSIST'),
    ('WELLNESS_TRACKING_12M', 'REPORT_INTELLIGENCE'),
    ('LIFESTYLE_MODIFICATION_CONSULT', 'EXPERT_ASSISTANCE'),
    ('LIFESTYLE_MODIFICATION_CONSULT', 'EXPERT_CONSULTATION'),
    ('CLINICAL_CARE_1M', 'AI_ASSIST'),
    ('CLINICAL_CARE_1M', 'EXPERT_ASSISTANCE'),
    ('CLINICAL_CARE_1M', 'EXPERT_CONSULTATION'),
    ('CLINICAL_CARE_1M', 'CARE_CHAT'),
    ('CLINICAL_CARE_1M', 'DIET_PLAN_ACCESS'),
    ('CLINICAL_TRANSFORMATION_3M', 'AI_ASSIST'),
    ('CLINICAL_TRANSFORMATION_3M', 'EXPERT_ASSISTANCE'),
    ('CLINICAL_TRANSFORMATION_3M', 'EXPERT_CONSULTATION'),
    ('CLINICAL_TRANSFORMATION_3M', 'CARE_CHAT'),
    ('CLINICAL_TRANSFORMATION_3M', 'DIET_PLAN_ACCESS'),
    ('CLINICAL_TRANSFORMATION_3M', 'REPORT_INTELLIGENCE'),
    ('DEEP_HEALING_6M', 'AI_ASSIST'),
    ('DEEP_HEALING_6M', 'EXPERT_ASSISTANCE'),
    ('DEEP_HEALING_6M', 'EXPERT_CONSULTATION'),
    ('DEEP_HEALING_6M', 'CARE_CHAT'),
    ('DEEP_HEALING_6M', 'DIET_PLAN_ACCESS'),
    ('DEEP_HEALING_6M', 'REPORT_INTELLIGENCE'),
    ('DEEP_HEALING_6M', 'APPOINTMENT_BOOKING')
) as entitlements(plan_code, entitlement_code)
join subscription_plans plans on plans.code = entitlements.plan_code
on conflict (plan_id, entitlement_code) do nothing;
