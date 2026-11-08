-- Complete the existing external Consultant onboarding persistence contract.
-- Additive only: existing signup, tenant, membership, and profile rows are preserved.

alter table external_consultant_onboarding
  add column if not exists consultant_name text,
  add column if not exists professional_title text,
  add column if not exists speciality text,
  add column if not exists practice_name text,
  add column if not exists country text,
  add column if not exists timezone text,
  add column if not exists contact_information jsonb not null default '{}'::jsonb,
  add column if not exists professional_details jsonb not null default '{}'::jsonb,
  add column if not exists terms_accepted_at timestamptz;

update external_consultant_onboarding onboarding
   set consultant_name = coalesce(onboarding.consultant_name, profile.display_name),
       professional_title = coalesce(onboarding.professional_title, profile.professional_title),
       speciality = coalesce(onboarding.speciality, profile.speciality),
       country = coalesce(onboarding.country, tenant.country),
       timezone = coalesce(onboarding.timezone, tenant.default_timezone)
  from external_practitioner_profiles profile,
       tenants tenant
 where profile.user_id = onboarding.user_id
   and tenant.id = onboarding.tenant_id;

