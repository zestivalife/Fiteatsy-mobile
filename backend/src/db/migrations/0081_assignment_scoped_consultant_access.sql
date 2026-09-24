alter table consultant_access_consents
  drop constraint if exists consultant_access_consents_pkey,
  drop constraint if exists consultant_access_consents_client_id_key;

alter table consultant_access_consents
  add column if not exists assignment_id uuid references consultant_client_assignments(id) on delete cascade,
  add column if not exists consultant_user_id text references users(id) on delete cascade,
  add column if not exists product text not null default 'FITEATSY';

alter table consultant_access_consents
  drop constraint if exists consultant_access_consents_product_check;
alter table consultant_access_consents
  add constraint consultant_access_consents_product_check check (product = 'FITEATSY');

create unique index if not exists consultant_access_consents_assignment_policy_uidx
  on consultant_access_consents(assignment_id, policy_version)
  where assignment_id is not null;

create index if not exists consultant_access_consents_relationship_idx
  on consultant_access_consents(consultant_user_id, user_id, product, status, policy_version);

create table if not exists consultant_access_consent_events (
  id uuid primary key,
  assignment_id uuid not null references consultant_client_assignments(id) on delete cascade,
  client_user_id text not null references users(id) on delete cascade,
  consultant_user_id text not null references users(id) on delete cascade,
  product text not null check (product = 'FITEATSY'),
  policy_version text not null,
  status text not null check (status in ('GRANTED','REVOKED','PENDING','NOT_REQUESTED')),
  source text not null,
  actor_user_id text not null references users(id),
  created_at timestamptz not null default now()
);

create index if not exists consultant_access_consent_events_relationship_idx
  on consultant_access_consent_events(assignment_id, created_at desc);

comment on column consultant_access_consents.assignment_id is
  'Null identifies a legacy client-wide record. Legacy records never authorize consultant access.';
