begin;

create table if not exists consultant_client_operations (
  id uuid primary key,
  client_id text not null references fiteatsy_clients(id) on delete cascade,
  operation_type text not null check (operation_type in ('CONSULTATION','TASK','FOLLOW_UP','GOAL','NOTE')),
  title text not null,
  detail text,
  status text not null default 'OPEN' check (status in ('OPEN','SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED','ARCHIVED')),
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  due_at timestamptz,
  scheduled_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by text not null references users(id) on delete restrict,
  updated_by text not null references users(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists consultant_client_operations_client_idx
  on consultant_client_operations(client_id, operation_type, status, updated_at desc)
  where deleted_at is null;

create table if not exists consultant_client_operation_idempotency (
  actor_id text not null references users(id) on delete cascade,
  idempotency_key text not null,
  operation_id uuid not null references consultant_client_operations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(actor_id, idempotency_key)
);

create table if not exists consultant_availability (
  consultant_id text primary key references users(id) on delete cascade,
  timezone text not null,
  schedule jsonb not null default '[]'::jsonb,
  unavailable_dates jsonb not null default '[]'::jsonb,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists consultant_client_operation_audit (
  id uuid primary key,
  operation_id uuid references consultant_client_operations(id) on delete set null,
  client_id text not null references fiteatsy_clients(id) on delete cascade,
  actor_id text not null references users(id) on delete restrict,
  action text not null,
  before_state jsonb,
  after_state jsonb,
  event_time timestamptz not null default now()
);

create index if not exists consultant_client_operation_audit_client_idx
  on consultant_client_operation_audit(client_id, event_time desc);

commit;
