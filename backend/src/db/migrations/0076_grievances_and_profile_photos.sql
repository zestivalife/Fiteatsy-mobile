create table if not exists profile_photo_assets (
  id uuid primary key,
  user_id text not null references users(id) on delete cascade,
  content_type text not null check (content_type in ('image/jpeg','image/png','image/heic','image/heif')),
  byte_length integer not null check (byte_length > 0 and byte_length <= 5242880),
  bytes bytea not null,
  created_at timestamptz not null default now(),
  replaced_at timestamptz
);

create unique index if not exists profile_photo_assets_current_user_idx
  on profile_photo_assets(user_id) where replaced_at is null;

alter table users add column if not exists profile_photo_asset_id uuid references profile_photo_assets(id) on delete set null;

create table if not exists grievances (
  id uuid primary key,
  reference_id text not null unique,
  user_id text not null references users(id) on delete cascade,
  client_id text references fiteatsy_clients(id) on delete set null,
  client_request_id text not null,
  category text not null,
  subject text not null,
  description text not null,
  contact_preference text,
  status text not null default 'OPEN' check (status in ('OPEN','IN_REVIEW','IN_PROGRESS','AWAITING_USER','RESOLVED','CLOSED')),
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  source text not null default 'MOBILE',
  platform text not null,
  app_version text,
  build_number text,
  runtime_version text,
  os_version text,
  device_model text,
  route text,
  network_type text,
  correlation_id uuid not null,
  attachment_content_type text,
  attachment_byte_length integer,
  attachment_bytes bytea,
  assigned_to text references users(id) on delete set null,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, client_request_id),
  check (attachment_byte_length is null or attachment_byte_length <= 5242880)
);

create index if not exists grievances_user_created_idx on grievances(user_id, created_at desc);
create index if not exists grievances_admin_queue_idx on grievances(status, priority, created_at desc);
create index if not exists grievances_reference_search_idx on grievances(reference_id);

create table if not exists grievance_events (
  id uuid primary key,
  grievance_id uuid not null references grievances(id) on delete cascade,
  actor_user_id text references users(id) on delete set null,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists grievance_events_grievance_created_idx on grievance_events(grievance_id, created_at asc);
