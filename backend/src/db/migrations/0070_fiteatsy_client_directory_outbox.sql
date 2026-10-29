create table if not exists fiteatsy_client_directory_outbox (
  id uuid primary key,
  event_type text not null check (event_type in (
    'FITEATSY_USER_REGISTERED',
    'FITEATSY_USER_VERIFIED',
    'FITEATSY_USER_PROFILE_UPDATED',
    'FITEATSY_USER_STATUS_CHANGED',
    'FITEATSY_USER_DEACTIVATED',
    'FITEATSY_USER_DELETED'
  )),
  aggregate_user_id uuid not null references users(id) on delete restrict,
  source_version integer not null check (source_version > 0),
  schema_version integer not null default 1 check (schema_version = 1),
  payload jsonb not null,
  occurred_at timestamptz not null,
  available_at timestamptz not null,
  delivered_at timestamptz,
  delivery_attempts integer not null default 0 check (delivery_attempts >= 0),
  last_error_code text,
  dead_lettered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (aggregate_user_id, source_version, event_type)
);

create index if not exists ix_client_directory_outbox_delivery
  on fiteatsy_client_directory_outbox(available_at, created_at)
  where delivered_at is null and dead_lettered_at is null;

create index if not exists ix_client_directory_outbox_user
  on fiteatsy_client_directory_outbox(aggregate_user_id, source_version desc);

create table if not exists fiteatsy_client_directory_sync_state (
  singleton boolean primary key default true check (singleton),
  reconciliation_started_at timestamptz,
  last_successful_delivery_at timestamptz,
  last_successful_reconciliation_at timestamptz,
  last_reconciliation_user_id uuid,
  last_source_count integer check (last_source_count is null or last_source_count >= 0),
  last_excluded_count integer check (last_excluded_count is null or last_excluded_count >= 0),
  last_duplicate_mobile_count integer check (last_duplicate_mobile_count is null or last_duplicate_mobile_count >= 0),
  updated_at timestamptz not null default now()
);

insert into fiteatsy_client_directory_sync_state(singleton)
values (true)
on conflict (singleton) do nothing;
