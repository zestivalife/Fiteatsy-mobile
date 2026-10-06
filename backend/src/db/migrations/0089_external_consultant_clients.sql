begin;
create table if not exists external_clients (
  id uuid primary key, tenant_id uuid not null references tenants(id),
  first_name text not null, last_name text not null, display_name text not null,
  mobile text, mobile_normalized text, email text, email_normalized text,
  date_of_birth date, gender text, status text not null default 'ACTIVE',
  intake_state text not null default 'NOT_STARTED', source text not null default 'CONSULTANT_ENTERED',
  created_by_user_id text not null references users(id), profile_photo_url text, notes_summary text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  constraint external_clients_contact_required check (mobile_normalized is not null or email_normalized is not null),
  constraint external_clients_status_check check (status in ('INVITED','INTAKE_STARTED','INTAKE_COMPLETED','ACTIVE','INACTIVE')),
  constraint external_clients_intake_state_check check (intake_state in ('NOT_STARTED','IN_PROGRESS','COMPLETED')),
  constraint external_clients_source_check check (source in ('CONSULTANT_ENTERED','CLIENT_SELF_REGISTERED','IMPORT')),
  constraint external_clients_gender_check check (gender is null or gender in ('FEMALE','MALE','NON_BINARY','PREFER_NOT_TO_SAY','OTHER')),
  constraint external_clients_id_tenant_unique unique (id, tenant_id)
);
create unique index if not exists external_clients_tenant_mobile_unique on external_clients(tenant_id,mobile_normalized) where mobile_normalized is not null and deleted_at is null;
create unique index if not exists external_clients_tenant_email_unique on external_clients(tenant_id,email_normalized) where email_normalized is not null and deleted_at is null;
create index if not exists external_clients_tenant_status_updated_idx on external_clients(tenant_id,status,updated_at desc) where deleted_at is null;
create table if not exists external_client_audit_events (
  id uuid primary key, tenant_id uuid not null references tenants(id), client_id uuid not null,
  actor_user_id text not null references users(id),
  event_type text not null check (event_type in ('CLIENT_CREATED','CLIENT_UPDATED','CLIENT_STATUS_CHANGED')),
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  constraint external_client_audit_client_tenant_fk foreign key (client_id,tenant_id) references external_clients(id,tenant_id)
);
create index if not exists external_client_audit_tenant_client_created_idx on external_client_audit_events(tenant_id,client_id,created_at desc);
comment on table external_clients is 'Tenant-owned external Consultant client records; not auth users, tenant members, or in-house assignments.';
commit;
