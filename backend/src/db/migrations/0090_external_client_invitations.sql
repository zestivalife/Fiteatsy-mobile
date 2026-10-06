begin;
create table if not exists external_client_invitations (
  id uuid primary key, tenant_id uuid not null references tenants(id), client_id uuid not null,
  token_hash text not null unique,
  status text not null default 'PENDING' check (status in ('PENDING','OPENED','COMPLETED','EXPIRED','REVOKED')),
  created_by_user_id text not null references users(id), created_at timestamptz not null default now(),
  expires_at timestamptz not null, revoked_at timestamptz, revoked_by_user_id text references users(id),
  first_opened_at timestamptz, last_opened_at timestamptz, completed_at timestamptz,
  constraint external_client_invitation_client_tenant_fk foreign key (client_id,tenant_id) references external_clients(id,tenant_id),
  constraint external_client_invitation_expiry_check check (expires_at > created_at)
);
create unique index if not exists external_client_one_active_invitation_idx on external_client_invitations(tenant_id,client_id) where status in ('PENDING','OPENED');
create index if not exists external_client_invitation_tenant_client_idx on external_client_invitations(tenant_id,client_id,created_at desc);
alter table external_client_audit_events alter column actor_user_id drop not null;
alter table external_client_audit_events drop constraint if exists external_client_audit_events_event_type_check;
alter table external_client_audit_events add constraint external_client_audit_events_event_type_check check (event_type in ('CLIENT_CREATED','CLIENT_UPDATED','CLIENT_STATUS_CHANGED','CLIENT_INVITATION_CREATED','CLIENT_INVITATION_OPENED','CLIENT_INVITATION_REVOKED','CLIENT_INVITATION_REGENERATED'));
comment on column external_client_invitations.token_hash is 'SHA-256 lookup digest only; raw invitation tokens must never be persisted.';
commit;
