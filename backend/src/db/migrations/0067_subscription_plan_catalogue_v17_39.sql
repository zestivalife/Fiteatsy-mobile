-- Align the customer-facing subscription catalogue with the approved Fiteatsy plan sheet.
-- Existing subscriptions retain their immutable price/name snapshots.

with catalogue(code, name, description, price_minor, duration_days, duration_months, display_order, badge, featured, benefits) as (
  values
    ('WELLNESS_TRACKING_6M', '6 Month Wellness Tracking', 'Health awareness and self-guided tracking.', 299900, 183, 6, 10, null, false,
      '["Full dashboard access","Wellness and hydration tracking","Lifestyle pattern monitoring","Health insights"]'::jsonb),
    ('WELLNESS_TRACKING_12M', '12 Month Wellness Tracking', 'Long-term wellness tracking and health trend visibility.', 499900, 365, 12, 20, 'Best value', true,
      '["All 6-month features","Long-term wellness tracking","Better health trend visibility","Extended ecosystem access"]'::jsonb),
    ('LIFESTYLE_MODIFICATION_CONSULT', 'Lifestyle Modification Consult', 'One focused expert consultation for deficiency and lifestyle guidance.', 199900, 1, 0, 30, null, false,
      '["Expert consultation","Dashboard insights review","Clinical report understanding","Lifestyle correction recommendations"]'::jsonb),
    ('CLINICAL_CARE_1M', '1 Month Clinical Care', 'Short-term personalised nutrition support with expert guidance.', 599900, 30, 1, 40, null, false,
      '["Personalised nutrition guidance","Expert consultation","Regular progress reviews","Continuous support"]'::jsonb),
    ('CLINICAL_TRANSFORMATION_3M', '3 Month Clinical Transformation', 'Lifestyle and wellness transformation with sustained expert support.', 1499900, 92, 3, 50, 'Recommended', true,
      '["All 1-month features","Continuous expert guidance","Wellness and lifestyle monitoring","Accountability and progress tracking"]'::jsonb),
    ('DEEP_HEALING_6M', '6 Month Deep Healing Program', 'Long-term healing and transformation support.', 2499900, 183, 6, 60, null, false,
      '["Long-term transformation support","Deep lifestyle correction","Continuous nutrition guidance","Ongoing wellness monitoring"]'::jsonb)
)
update subscription_plans plans
set name = catalogue.name,
    description = catalogue.description,
    price_minor = catalogue.price_minor,
    duration_days = catalogue.duration_days,
    duration_months = catalogue.duration_months,
    display_order = catalogue.display_order,
    badge = catalogue.badge,
    is_featured = catalogue.featured,
    is_active = true,
    benefits = catalogue.benefits,
    updated_at = now()
from catalogue
where plans.code = catalogue.code;

update subscription_plan_versions versions
set effective_to = now()
from subscription_plans plans
where versions.plan_id = plans.id
  and versions.effective_to is null
  and plans.code in ('WELLNESS_TRACKING_6M', 'WELLNESS_TRACKING_12M', 'LIFESTYLE_MODIFICATION_CONSULT', 'CLINICAL_CARE_1M', 'CLINICAL_TRANSFORMATION_3M', 'DEEP_HEALING_6M');

insert into subscription_plan_versions (id, plan_id, version_number, price_minor, currency, duration_days, duration_months, benefits, terms_text)
select 'spv_' || plans.code || '_v2', plans.id, 2, plans.price_minor, plans.currency, plans.duration_days, plans.duration_months, plans.benefits,
       'Applicable taxes are displayed before payment. Subscription activates only after verified payment.'
from subscription_plans plans
where plans.code in ('WELLNESS_TRACKING_6M', 'WELLNESS_TRACKING_12M', 'LIFESTYLE_MODIFICATION_CONSULT', 'CLINICAL_CARE_1M', 'CLINICAL_TRANSFORMATION_3M', 'DEEP_HEALING_6M')
on conflict (plan_id, version_number) do update set
  price_minor = excluded.price_minor,
  currency = excluded.currency,
  duration_days = excluded.duration_days,
  duration_months = excluded.duration_months,
  benefits = excluded.benefits,
  terms_text = excluded.terms_text,
  effective_to = null;

insert into subscription_plan_version_entitlements (plan_version_id, entitlement_code, boolean_value, limit_value, enum_value)
select current_versions.id, previous_entitlements.entitlement_code, previous_entitlements.boolean_value, previous_entitlements.limit_value, previous_entitlements.enum_value
from subscription_plans plans
join subscription_plan_versions current_versions on current_versions.plan_id = plans.id and current_versions.version_number = 2
join subscription_plan_versions previous_versions on previous_versions.plan_id = plans.id and previous_versions.version_number = 1
join subscription_plan_version_entitlements previous_entitlements on previous_entitlements.plan_version_id = previous_versions.id
where plans.code in ('WELLNESS_TRACKING_6M', 'WELLNESS_TRACKING_12M', 'LIFESTYLE_MODIFICATION_CONSULT', 'CLINICAL_CARE_1M', 'CLINICAL_TRANSFORMATION_3M', 'DEEP_HEALING_6M')
on conflict (plan_version_id, entitlement_code) do update set
  boolean_value = excluded.boolean_value,
  limit_value = excluded.limit_value,
  enum_value = excluded.enum_value;
