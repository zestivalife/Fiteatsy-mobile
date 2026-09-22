alter table subscription_plans add column if not exists plan_type text not null default 'RECURRING_PROGRAM';
alter table subscription_plans add column if not exists purchase_mode text not null default 'SUBSCRIPTION';
alter table subscription_plans add column if not exists purchase_enabled boolean not null default true;
alter table subscription_plans add column if not exists cta_label text not null default 'Choose Plan';
alter table subscription_plans add column if not exists gst_basis_points integer not null default 1800;
alter table subscription_plans add column if not exists session_count integer;

alter table subscription_plan_versions add column if not exists plan_type text not null default 'RECURRING_PROGRAM';
alter table subscription_plan_versions add column if not exists purchase_mode text not null default 'SUBSCRIPTION';
alter table subscription_plan_versions add column if not exists cta_label text not null default 'Choose Plan';
alter table subscription_plan_versions add column if not exists gst_basis_points integer not null default 1800;
alter table subscription_plan_versions add column if not exists session_count integer;

alter table subscription_plans alter column duration_days drop not null;
alter table subscription_plans alter column duration_months drop not null;
alter table subscription_plan_versions alter column duration_days drop not null;
alter table subscription_plan_versions alter column duration_months drop not null;

alter table subscription_plans drop constraint if exists subscription_plans_gst_basis_points_check;
alter table subscription_plans add constraint subscription_plans_gst_basis_points_check check (gst_basis_points between 0 and 10000);
alter table subscription_plan_versions drop constraint if exists subscription_plan_versions_gst_basis_points_check;
alter table subscription_plan_versions add constraint subscription_plan_versions_gst_basis_points_check check (gst_basis_points between 0 and 10000);

alter table subscription_plans drop constraint if exists subscription_plans_plan_type_check;
alter table subscription_plans add constraint subscription_plans_plan_type_check check (plan_type in ('RECURRING_PROGRAM', 'ONE_TIME_SERVICE'));
alter table subscription_plans drop constraint if exists subscription_plans_purchase_mode_check;
alter table subscription_plans add constraint subscription_plans_purchase_mode_check check (purchase_mode in ('SUBSCRIPTION', 'ONE_TIME'));
alter table subscription_plans drop constraint if exists subscription_plans_duration_contract_check;
alter table subscription_plans add constraint subscription_plans_duration_contract_check check (
  (plan_type = 'ONE_TIME_SERVICE' and duration_days is null and duration_months is null and session_count is not null)
  or (plan_type = 'RECURRING_PROGRAM' and duration_days > 0 and duration_months > 0 and session_count is null)
);

alter table subscription_plan_versions drop constraint if exists subscription_plan_versions_plan_type_check;
alter table subscription_plan_versions add constraint subscription_plan_versions_plan_type_check check (plan_type in ('RECURRING_PROGRAM', 'ONE_TIME_SERVICE'));
alter table subscription_plan_versions drop constraint if exists subscription_plan_versions_purchase_mode_check;
alter table subscription_plan_versions add constraint subscription_plan_versions_purchase_mode_check check (purchase_mode in ('SUBSCRIPTION', 'ONE_TIME'));
alter table subscription_plan_versions drop constraint if exists subscription_plan_versions_duration_contract_check;
alter table subscription_plan_versions add constraint subscription_plan_versions_duration_contract_check check (
  (plan_type = 'ONE_TIME_SERVICE' and duration_days is null and duration_months is null and session_count is not null)
  or (plan_type = 'RECURRING_PROGRAM' and duration_days > 0 and duration_months > 0 and session_count is null)
);

update subscription_plans
set purchase_enabled = false,
    updated_at = now();

update subscription_plans set
  code = 'WELLNESS_6M', name = '6 Month Wellness Tracking',
  description = 'Full dashboard access with wellness, hydration, lifestyle-pattern, symptom, habit, anthropometric and health-insight tracking.',
  duration_days = 183, duration_months = 6, price_minor = 299900, currency = 'INR',
  is_active = true, purchase_enabled = true, is_featured = false, badge = null, display_order = 10,
  plan_type = 'RECURRING_PROGRAM', purchase_mode = 'SUBSCRIPTION', cta_label = 'Choose Plan', gst_basis_points = 1800, session_count = null,
  benefits = '["Full dashboard access","Wellness and hydration tracking","Lifestyle pattern monitoring","Symptom and habit monitoring","Anthropometric tracking","Health insights"]'::jsonb,
  updated_at = now()
where id = 'plan_wellness_tracking_6m';

update subscription_plans set
  code = 'WELLNESS_12M', name = '12 Month Wellness Tracking',
  description = 'Long-term wellness tracking with better health-trend visibility and extended ecosystem access.',
  duration_days = 365, duration_months = 12, price_minor = 499900, currency = 'INR',
  is_active = true, purchase_enabled = true, is_featured = true, badge = 'BEST VALUE', display_order = 20,
  plan_type = 'RECURRING_PROGRAM', purchase_mode = 'SUBSCRIPTION', cta_label = 'Choose Plan', gst_basis_points = 1800, session_count = null,
  benefits = '["All 6-month features","Long-term wellness tracking","Better health trend visibility","Extended ecosystem access"]'::jsonb,
  updated_at = now()
where id = 'plan_wellness_tracking_12m';

update subscription_plans set
  code = 'LIFESTYLE_CONSULT', name = 'Lifestyle Modification Consult',
  description = 'A focused expert consultation for report understanding, lifestyle correction and wellness recommendations.',
  duration_days = null, duration_months = null, price_minor = 199900, currency = 'INR',
  is_active = true, purchase_enabled = true, is_featured = false, badge = null, display_order = 30,
  plan_type = 'ONE_TIME_SERVICE', purchase_mode = 'ONE_TIME', cta_label = 'Book Consultation', gst_basis_points = 1800, session_count = 1,
  benefits = '["Expert consultation","Dashboard insights review","Clinical report understanding","Supplement guidance","Lifestyle correction","Wellness improvement recommendations"]'::jsonb,
  updated_at = now()
where id = 'plan_lifestyle_modification_consult';

update subscription_plans set
  code = 'CLINICAL_1M', name = '1 Month Clinical Care',
  description = 'Personalised nutrition guidance and continuous support for a focused clinical-care start.',
  duration_days = 30, duration_months = 1, price_minor = 599900, currency = 'INR',
  is_active = true, purchase_enabled = true, is_featured = false, badge = 'FOCUSED START', display_order = 40,
  plan_type = 'RECURRING_PROGRAM', purchase_mode = 'SUBSCRIPTION', cta_label = 'Choose Plan', gst_basis_points = 1800, session_count = null,
  benefits = '["Personalised nutrition guidance","Expert consultation","Dashboard wellness review","Regular progress reviews","Continuous support","Personalised tracking and accountability"]'::jsonb,
  updated_at = now()
where id = 'plan_clinical_care_1m';

update subscription_plans set
  code = 'CLINICAL_3M', name = '3 Month Clinical Transformation',
  description = 'Continuous expert guidance for sustainable lifestyle correction, fat loss, hormonal wellness and habit change.',
  duration_days = 90, duration_months = 3, price_minor = 1499900, currency = 'INR',
  is_active = true, purchase_enabled = true, is_featured = true, badge = 'MOST POPULAR', display_order = 50,
  plan_type = 'RECURRING_PROGRAM', purchase_mode = 'SUBSCRIPTION', cta_label = 'Choose Plan', gst_basis_points = 1800, session_count = null,
  benefits = '["All 1-month features","Continuous expert guidance","Wellness and lifestyle monitoring","Sustainable lifestyle correction","Dashboard access","Accountability and progress tracking"]'::jsonb,
  updated_at = now()
where id = 'plan_clinical_transformation_3m';

update subscription_plans set
  code = 'DEEP_HEALING_6M', name = '6 Month Deep Healing Program',
  description = 'Long-term transformation support for chronic concerns and deep nutritional and behavioural healing.',
  duration_days = 183, duration_months = 6, price_minor = 2499900, currency = 'INR',
  is_active = true, purchase_enabled = true, is_featured = false, badge = 'COMPREHENSIVE CARE', display_order = 60,
  plan_type = 'RECURRING_PROGRAM', purchase_mode = 'SUBSCRIPTION', cta_label = 'Choose Plan', gst_basis_points = 1800, session_count = null,
  benefits = '["Long-term transformation support","Deep lifestyle correction","Continuous nutrition guidance","Ongoing wellness monitoring","Dashboard access","Accountability and progress tracking"]'::jsonb,
  updated_at = now()
where id = 'plan_deep_healing_6m';

update subscription_plan_versions
set effective_to = now()
where effective_to is null
  and id not like 'spv_canonical_six_%'
  and plan_id in (
    'plan_wellness_tracking_6m', 'plan_wellness_tracking_12m', 'plan_lifestyle_modification_consult',
    'plan_clinical_care_1m', 'plan_clinical_transformation_3m', 'plan_deep_healing_6m'
  );

insert into subscription_plan_versions (
  id, plan_id, version_number, price_minor, currency, duration_days, duration_months, benefits, terms_text,
  plan_type, purchase_mode, cta_label, gst_basis_points, session_count, effective_from
)
select
  'spv_canonical_six_' || plans.id,
  plans.id,
  coalesce((select max(existing.version_number) from subscription_plan_versions existing where existing.plan_id = plans.id), 0) + 1,
  plans.price_minor, plans.currency, plans.duration_days, plans.duration_months, plans.benefits,
  'Prices exclude GST. CGST, SGST and the final payable amount are shown before payment.',
  plans.plan_type, plans.purchase_mode, plans.cta_label, plans.gst_basis_points, plans.session_count, now()
from subscription_plans plans
where plans.purchase_enabled = true
on conflict (id) do nothing;

insert into subscription_plan_version_entitlements (plan_version_id, entitlement_code, boolean_value)
select versions.id, registry.code, true
from subscription_plan_versions versions
join subscription_plans plans on plans.id = versions.plan_id and plans.purchase_enabled = true
join subscription_entitlement_registry registry on registry.code in (
  'health_tracking','wearable_sync','medication_tracker','medication_reminders','stress_test','stress_recovery','health_reports','progress_tracking'
)
where versions.effective_to is null
on conflict (plan_version_id, entitlement_code) do update set boolean_value = true, limit_value = null, enum_value = null;

insert into subscription_plan_version_entitlements (plan_version_id, entitlement_code, boolean_value)
select versions.id, registry.code, true
from subscription_plan_versions versions
join subscription_plans plans on plans.id = versions.plan_id and plans.code in ('CLINICAL_1M','CLINICAL_3M','DEEP_HEALING_6M')
join subscription_entitlement_registry registry on registry.code in ('diet_plan','consultant_access')
where versions.effective_to is null
on conflict (plan_version_id, entitlement_code) do update set boolean_value = true, limit_value = null, enum_value = null;

insert into subscription_plan_version_entitlements (plan_version_id, entitlement_code, limit_value)
select versions.id, 'consultations_per_month', case plans.code when 'CLINICAL_1M' then 1 when 'CLINICAL_3M' then 2 when 'DEEP_HEALING_6M' then 4 end
from subscription_plan_versions versions
join subscription_plans plans on plans.id = versions.plan_id
where versions.effective_to is null and plans.code in ('CLINICAL_1M','CLINICAL_3M','DEEP_HEALING_6M')
on conflict (plan_version_id, entitlement_code) do update set boolean_value = null, limit_value = excluded.limit_value, enum_value = null;

insert into subscription_plan_version_entitlements (plan_version_id, entitlement_code, limit_value)
select versions.id, 'consultations_per_month', 1
from subscription_plan_versions versions
join subscription_plans plans on plans.id = versions.plan_id
where versions.effective_to is null and plans.code = 'LIFESTYLE_CONSULT'
on conflict (plan_version_id, entitlement_code) do update set boolean_value = null, limit_value = 1, enum_value = null;

create index if not exists subscription_plans_purchase_order_idx on subscription_plans (purchase_enabled, display_order);
