begin;

alter table external_consultant_signups
  drop constraint if exists external_consultant_signups_signup_state_check;

update external_consultant_signups
set signup_state = case signup_state
  when 'VERIFICATION_PENDING' then 'OTP_PENDING'
  when 'VERIFIED' then 'MOBILE_VERIFIED'
  when 'VERIFICATION_EXPIRED' then 'OTP_EXPIRED'
  else signup_state
end
where signup_state in ('VERIFICATION_PENDING', 'VERIFIED', 'VERIFICATION_EXPIRED');

alter table external_consultant_signups
  add constraint external_consultant_signups_signup_state_check check (signup_state in (
    'STARTED','OTP_PENDING','MOBILE_VERIFIED','ACCOUNT_CREATED','TENANT_CREATED',
    'PROFILE_PENDING','ONBOARDING_IN_PROGRESS','READY','OTP_EXPIRED',
    'BLOCKED','SUSPENDED','CANCELLED'
  ));

comment on column external_consultant_signups.mobile_number_normalized is
  'Canonical verified Consultant identity in +<country code><number> format.';

commit;
