create table if not exists client_medication_exceptions (
  id uuid primary key,
  client_id text not null references fiteatsy_clients(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  exception_type text not null,
  severity text not null,
  status text not null default 'OPEN',
  rule_version text not null,
  title text not null,
  summary text not null,
  evidence jsonb not null default '{}'::jsonb,
  evidence_fingerprint text not null,
  detected_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by_user_id text references users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists client_medication_exceptions_owner_idx
  on client_medication_exceptions (client_id, user_id, status, detected_at desc)
  where deleted_at is null;

create index if not exists client_medication_exceptions_type_idx
  on client_medication_exceptions (exception_type, status, detected_at desc)
  where deleted_at is null;

create unique index if not exists client_medication_exceptions_active_unique
  on client_medication_exceptions (client_id, user_id, exception_type, rule_version)
  where deleted_at is null
    and status in ('OPEN', 'ACKNOWLEDGED');
