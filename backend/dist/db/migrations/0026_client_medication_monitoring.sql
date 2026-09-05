create table if not exists client_medications (
  id text not null,
  client_id text not null references fiteatsy_clients(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  name text not null,
  medication_type text not null,
  dosage text not null,
  schedule jsonb not null,
  reminder_sound text not null,
  medication_status text not null,
  notification_enabled boolean not null default false,
  source_updated_at timestamptz not null,
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (client_id, id)
);

create index if not exists client_medications_owner_idx
  on client_medications (client_id, user_id, medication_status, deleted_at);

create table if not exists client_medication_logs (
  id text not null,
  client_id text not null references fiteatsy_clients(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  medication_id text not null,
  scheduled_for timestamptz not null,
  log_status text not null,
  actioned_at timestamptz,
  snoozed_until timestamptz,
  note text,
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (client_id, id),
  foreign key (client_id, medication_id) references client_medications(client_id, id) on delete cascade,
  unique (client_id, medication_id, scheduled_for)
);

create index if not exists client_medication_logs_owner_idx
  on client_medication_logs (client_id, user_id, scheduled_for desc, deleted_at);
