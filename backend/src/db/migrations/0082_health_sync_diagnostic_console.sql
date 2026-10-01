create table if not exists health_sync_device_heartbeats (
  connection_id text primary key references wearable_connections(id) on delete cascade,
  client_id text not null,
  account_id text not null references users(id) on delete cascade,
  app_version text,
  mobile_commit_sha text,
  device_label text,
  last_app_heartbeat_at timestamptz,
  last_native_heartbeat_at timestamptz,
  last_local_persist_at timestamptz,
  last_upload_at timestamptz,
  pending_count integer not null default 0 check (pending_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  quarantined_count integer not null default 0 check (quarantined_count >= 0),
  persisted_document_bytes bigint not null default 0 check (persisted_document_bytes >= 0),
  updated_at timestamptz not null default now(),
  foreign key (client_id, account_id) references fiteatsy_clients(id, account_user_id) on delete cascade
);

create table if not exists health_sync_metric_status (
  connection_id text not null references wearable_connections(id) on delete cascade,
  client_id text not null,
  account_id text not null references users(id) on delete cascade,
  metric_type text not null,
  supported boolean not null,
  permission_state text not null check (permission_state in ('GRANTED','DENIED','NOT_DETERMINED','UNSUPPORTED')),
  native_record_count bigint not null default 0 check (native_record_count >= 0),
  local_record_count bigint not null default 0 check (local_record_count >= 0),
  latest_native_at timestamptz,
  latest_local_at timestamptz,
  terminal_state text not null check (terminal_state in ('IDLE','RUNNING','SUCCESS','NO_DATA','PERMISSION_DENIED','UNSUPPORTED','FAILED','TIMED_OUT')),
  upload_state text not null check (upload_state in ('NOT_REQUIRED','PENDING','RUNNING','SUCCESS','PARTIAL','FAILED')),
  native_read_at timestamptz,
  local_persist_at timestamptz,
  backend_persist_at timestamptz,
  display_ready_at timestamptz,
  safe_error_code text,
  updated_at timestamptz not null default now(),
  primary key (connection_id, metric_type),
  foreign key (client_id, account_id) references fiteatsy_clients(id, account_user_id) on delete cascade
);

create table if not exists health_sync_requests (
  id text primary key,
  connection_id text not null references wearable_connections(id) on delete cascade,
  client_id text not null,
  account_id text not null references users(id) on delete cascade,
  requested_by_user_id text not null references users(id) on delete restrict,
  provider text not null check (provider in ('APPLE_HEALTH','HEALTH_CONNECT')),
  requested_metrics jsonb not null,
  status text not null check (status in ('PENDING','ACKNOWLEDGED','RUNNING','SUCCESS','PARTIAL','FAILED','TIMED_OUT','CANCELLED')),
  safe_error_code text,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  foreign key (client_id, account_id) references fiteatsy_clients(id, account_user_id) on delete cascade
);

create index if not exists health_sync_requests_device_status_idx
  on health_sync_requests(connection_id, status, created_at desc);

create table if not exists health_sync_request_events (
  id text primary key,
  request_id text not null references health_sync_requests(id) on delete cascade,
  actor_user_id text references users(id) on delete set null,
  event_type text not null,
  metric_type text,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists health_sync_request_events_request_idx
  on health_sync_request_events(request_id, created_at asc);

create table if not exists health_sync_diagnostic_audit_events (
  id text primary key,
  actor_user_id text not null references users(id) on delete restrict,
  target_account_id text not null references users(id) on delete restrict,
  connection_id text references wearable_connections(id) on delete set null,
  event_type text not null check(event_type in ('VIEW_DIAGNOSTICS','INSPECT_RECORDS','REQUEST_DEVICE_SYNC','ADMIN_QUEUE_ACTION')),
  metric_type text,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists health_sync_diagnostic_audit_target_idx
  on health_sync_diagnostic_audit_events(target_account_id, created_at desc);
