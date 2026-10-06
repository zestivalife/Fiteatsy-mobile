begin;

alter table external_client_invitations add constraint external_invitation_id_tenant_client_unique unique (id,tenant_id,client_id);

create table if not exists external_client_intakes (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  client_id uuid not null,
  invitation_id uuid not null,
  status text not null default 'NOT_STARTED' check (status in ('NOT_STARTED','IN_PROGRESS','COMPLETED')),
  current_section text not null default 'aboutYou',
  completion_percent integer not null default 0 check (completion_percent between 0 and 100),
  sections jsonb not null default '{}'::jsonb,
  provenance text not null default 'CLIENT_SELF_REPORTED' check (provenance='CLIENT_SELF_REPORTED'),
  started_at timestamptz,
  last_saved_at timestamptz,
  submitted_at timestamptz,
  consent_version text,
  consented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_client_intake_client_tenant_fk foreign key (client_id,tenant_id) references external_clients(id,tenant_id),
  constraint external_client_intake_invitation_scope_fk foreign key (invitation_id,tenant_id,client_id) references external_client_invitations(id,tenant_id,client_id),
  constraint external_client_intake_client_unique unique (id,client_id,tenant_id)
);

create unique index if not exists external_client_one_open_intake_idx
  on external_client_intakes(tenant_id,client_id) where status <> 'COMPLETED';
create index if not exists external_client_intakes_tenant_client_idx
  on external_client_intakes(tenant_id,client_id,updated_at desc);

create table if not exists external_client_intake_documents (
  id uuid primary key,
  tenant_id uuid not null,
  client_id uuid not null,
  intake_id uuid not null,
  invitation_id uuid not null,
  category text not null check (category in ('LAB_REPORT','PRESCRIPTION','MEDICAL_REPORT','OTHER_HEALTH_DOCUMENT')),
  original_file_name text not null,
  mime_type text not null,
  file_size integer not null check (file_size > 0 and file_size <= 12582912),
  document_hash text not null,
  original_file bytea not null,
  provenance text not null default 'CLIENT_SELF_REPORTED' check (provenance='CLIENT_SELF_REPORTED'),
  created_at timestamptz not null default now(),
  constraint external_intake_document_intake_client_tenant_fk
    foreign key (intake_id,client_id,tenant_id) references external_client_intakes(id,client_id,tenant_id),
  constraint external_intake_document_invitation_scope_fk
    foreign key (invitation_id,tenant_id,client_id) references external_client_invitations(id,tenant_id,client_id)
);

create unique index if not exists external_intake_document_hash_unique
  on external_client_intake_documents(intake_id,document_hash);
create index if not exists external_intake_documents_tenant_client_idx
  on external_client_intake_documents(tenant_id,client_id,created_at desc);

alter table external_client_audit_events drop constraint if exists external_client_audit_events_event_type_check;
alter table external_client_audit_events add constraint external_client_audit_events_event_type_check check (event_type in (
  'CLIENT_CREATED','CLIENT_UPDATED','CLIENT_STATUS_CHANGED',
  'CLIENT_INVITATION_CREATED','CLIENT_INVITATION_OPENED','CLIENT_INVITATION_REVOKED','CLIENT_INVITATION_REGENERATED',
  'CLIENT_INTAKE_STARTED','CLIENT_INTAKE_SAVED','CLIENT_INTAKE_SUBMITTED',
  'CLIENT_DOCUMENT_UPLOADED','CLIENT_CONSENT_ACCEPTED'
));

comment on table external_client_intakes is 'Invitation-authorised, tenant-owned browser intake; creates no auth identity or membership.';
comment on column external_client_intakes.sections is 'Structured client self-reported sections; never written to application logs.';
commit;
