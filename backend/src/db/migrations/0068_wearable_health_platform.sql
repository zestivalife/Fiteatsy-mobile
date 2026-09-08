alter table health_observations
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists timezone_offset_minutes integer,
  add column if not exists provider_updated_at timestamptz,
  add column if not exists provider_version text,
  add column if not exists content_hash text,
  add column if not exists superseded_at timestamptz,
  add column if not exists deleted_at timestamptz;

create index if not exists health_observations_provider_identity_idx
  on health_observations (client_id, source_provider, source_record_id, metric_type)
  where source_record_id is not null and deleted_at is null;

create table if not exists wearable_consents (
  id text primary key,
  client_id text not null,
  account_id text not null,
  provider text not null check (provider in ('APPLE_HEALTH', 'HEALTH_CONNECT')),
  consent_version text not null,
  purpose_version text not null,
  status text not null check (status in ('ACTIVE', 'WITHDRAWN')),
  requested_metric_scopes jsonb not null default '[]'::jsonb,
  acknowledged_purposes jsonb not null default '[]'::jsonb,
  accepted_at timestamptz not null,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id) references users(id) on delete cascade,
  foreign key (client_id, account_id) references fiteatsy_clients(id, account_user_id) on delete cascade
);

create unique index if not exists wearable_consents_active_provider_unique
  on wearable_consents (client_id, provider) where status = 'ACTIVE';

create table if not exists wearable_connections (
  id text primary key,
  client_id text not null,
  account_id text not null,
  consent_id text not null references wearable_consents(id) on delete restrict,
  provider text not null check (provider in ('APPLE_HEALTH', 'HEALTH_CONNECT')),
  platform text not null check (platform in ('IOS', 'ANDROID')),
  installation_id text not null,
  status text not null check (status in ('CONNECTED', 'PARTIAL', 'PERMISSION_REQUIRED', 'REVOKED', 'UNAVAILABLE', 'ERROR')),
  granted_scopes jsonb not null default '[]'::jsonb,
  last_permission_check_at timestamptz,
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_sync_attempt_at timestamptz,
  last_successful_sync_at timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  background_sync_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id) references users(id) on delete cascade,
  foreign key (client_id, account_id) references fiteatsy_clients(id, account_user_id) on delete cascade,
  unique (client_id, provider, installation_id)
);

create table if not exists wearable_sync_runs (
  id text primary key,
  connection_id text not null references wearable_connections(id) on delete cascade,
  client_id text not null,
  provider text not null,
  trigger text not null check (trigger in ('INITIAL_CONNECT', 'MANUAL', 'FOREGROUND_RESUME', 'BACKGROUND', 'RETRY')),
  status text not null check (status in ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  records_read integer not null default 0,
  records_uploaded integer not null default 0,
  records_inserted integer not null default 0,
  records_duplicates integer not null default 0,
  records_updated integer not null default 0,
  records_deleted integer not null default 0,
  error_stage text,
  error_code text,
  safe_error_summary text,
  checkpoint_before jsonb,
  checkpoint_after jsonb,
  retry_count integer not null default 0,
  next_retry_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists wearable_sync_runs_connection_started_idx
  on wearable_sync_runs (connection_id, started_at desc);

create table if not exists wearable_sync_checkpoints (
  id text primary key,
  connection_id text not null references wearable_connections(id) on delete cascade,
  client_id text not null,
  provider text not null,
  metric_scope text not null,
  cursor_value text,
  anchor_value text,
  backfill_started_at timestamptz,
  backfill_completed_at timestamptz,
  committed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, metric_scope)
);

create table if not exists wearable_audit_events (
  id text primary key,
  client_id text not null,
  account_id text not null,
  provider text not null,
  event_type text not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (account_id) references users(id) on delete cascade,
  foreign key (client_id, account_id) references fiteatsy_clients(id, account_user_id) on delete cascade
);
