begin;

alter table external_consultant_signups
  drop constraint if exists external_consultant_signups_signup_state_check;

alter table external_consultant_signups
  add constraint external_consultant_signups_signup_state_check check (signup_state in (
    'STARTED','OTP_PENDING','MOBILE_VERIFIED','REGISTRATION_ACCEPTED',
    'ACCOUNT_CREATED','TENANT_CREATED','PROFILE_PENDING','ONBOARDING_IN_PROGRESS',
    'READY','OTP_EXPIRED','BLOCKED','SUSPENDED','CANCELLED'
  ));

comment on column external_consultant_signups.signup_state is
  'Governed Consultant signup lifecycle, including CAPTCHA-protected direct registration and retained OTP compatibility.';

commit;
