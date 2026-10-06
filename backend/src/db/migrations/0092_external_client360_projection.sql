begin;
create table if not exists external_client_profile_overrides (
  id uuid primary key, tenant_id uuid not null, client_id uuid not null,
  section text not null, field_key text not null, value jsonb not null,
  provenance text not null default 'CONSULTANT_ENTERED' check (provenance='CONSULTANT_ENTERED'),
  actor_user_id text not null references users(id), created_at timestamptz not null default now(), superseded_at timestamptz,
  constraint external_profile_override_client_scope_fk foreign key (client_id,tenant_id) references external_clients(id,tenant_id)
);
create unique index if not exists external_profile_override_current_unique on external_client_profile_overrides(tenant_id,client_id,section,field_key) where superseded_at is null;
create index if not exists external_profile_override_history_idx on external_client_profile_overrides(tenant_id,client_id,created_at desc);
alter table external_client_audit_events drop constraint if exists external_client_audit_events_event_type_check;
alter table external_client_audit_events add constraint external_client_audit_events_event_type_check check (event_type in (
  'CLIENT_CREATED','CLIENT_UPDATED','CLIENT_STATUS_CHANGED','CLIENT_INVITATION_CREATED','CLIENT_INVITATION_OPENED','CLIENT_INVITATION_REVOKED','CLIENT_INVITATION_REGENERATED',
  'CLIENT_INTAKE_STARTED','CLIENT_INTAKE_SAVED','CLIENT_INTAKE_SUBMITTED','CLIENT_DOCUMENT_UPLOADED','CLIENT_CONSENT_ACCEPTED',
  'CLIENT_PROFILE_UPDATED','CLIENT_HEALTH_DATA_UPDATED','CLIENT_GOAL_UPDATED','CLIENT_MEASUREMENT_ADDED'
));
comment on table external_client_profile_overrides is 'Consultant-entered current values; immutable intake remains the original self-reported history.';
commit;
