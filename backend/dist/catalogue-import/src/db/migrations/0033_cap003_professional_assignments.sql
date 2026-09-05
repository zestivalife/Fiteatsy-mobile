alter table consultant_client_assignments
  add column if not exists product text not null default 'FITEATSY',
  add column if not exists professional_type text not null default 'CONSULTANT',
  add column if not exists relationship_type text not null default 'CLIENT_CARE',
  add column if not exists revoked_by_user_id text references users(id) on delete set null,
  add column if not exists revoked_at timestamptz;

update consultant_client_assignments
set product = 'FITEATSY', professional_type = 'CONSULTANT', relationship_type = 'CLIENT_CARE'
where product is null or professional_type is null or relationship_type is null;

create index if not exists consultant_client_assignments_product_professional_idx
  on consultant_client_assignments (product, consultant_user_id, status);

create table if not exists professional_assignment_audit_events (
  id uuid primary key,
  assignment_id uuid not null references consultant_client_assignments(id) on delete cascade,
  action text not null,
  actor_user_id text references users(id) on delete set null,
  client_user_id text not null references users(id) on delete restrict,
  professional_user_id text not null references users(id) on delete restrict,
  professional_type text not null,
  relationship_type text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists professional_assignment_audit_assignment_idx
  on professional_assignment_audit_events (assignment_id, created_at desc);
