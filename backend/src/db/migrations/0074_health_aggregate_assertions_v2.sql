create table if not exists health_aggregate_assertions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  client_id text not null,
  health_day date not null,
  metric_type text not null,
  value numeric not null,
  unit text not null,
  aggregation_version text not null,
  lineage_hash text not null,
  aggregate_source text not null,
  raw_lineage_available boolean not null,
  calculated_at timestamptz not null,
  backend_value numeric,
  backend_lineage_hash text,
  parity_status text not null check (parity_status in ('MATCH','MISMATCH','PENDING')),
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(client_id,user_id) references fiteatsy_clients(id,account_user_id) on delete cascade,
  unique(client_id,health_day,metric_type,aggregation_version)
);

create index if not exists health_aggregate_assertions_client_day_idx
  on health_aggregate_assertions(client_id,health_day desc);

alter table daily_health_aggregates
  add column if not exists lineage_hash text,
  add column if not exists aggregate_source text not null default 'CANONICAL_RAW_RECOMPUTATION';

create table if not exists health_intelligence_recalculation_queue (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  client_id text not null,
  health_day date not null,
  status text not null check (status in ('PENDING','RUNNING','SUCCEEDED','FAILED')),
  attempts integer not null default 0,
  last_error_code text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key(client_id,user_id) references fiteatsy_clients(id,account_user_id) on delete cascade,
  unique(client_id,health_day,status)
);
