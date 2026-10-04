-- P0.2 resumable Consultant/practice onboarding only.
-- External clients remain tenant-owned client records and are not app users.

alter table external_consultant_onboarding
  add column if not exists consultant_name text,
  add column if not exists professional_title text,
  add column if not exists speciality text,
  add column if not exists practice_name text,
  add column if not exists country text not null default 'IN',
  add column if not exists timezone text not null default 'Asia/Kolkata',
  add column if not exists contact_information jsonb not null default '{}'::jsonb,
  add column if not exists professional_details jsonb not null default '{}'::jsonb,
  add column if not exists terms_accepted_at timestamptz;

update external_consultant_onboarding o
   set consultant_name = coalesce(o.consultant_name, p.display_name),
       professional_title = coalesce(o.professional_title, p.professional_title),
       speciality = coalesce(o.speciality, p.speciality)
  from external_practitioner_profiles p
 where p.user_id = o.user_id;

comment on column external_consultant_onboarding.contact_information is
  'Consultant/practice contact data only; never external-client health intake.';
