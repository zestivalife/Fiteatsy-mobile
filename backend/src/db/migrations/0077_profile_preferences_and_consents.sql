create table if not exists notification_preferences (
  user_id text primary key references users(id) on delete cascade,
  master_enabled boolean not null default true,
  hydration boolean not null default true,
  nutrition boolean not null default true,
  medication boolean not null default true,
  consultation boolean not null default true,
  follow_up boolean not null default true,
  subscription boolean not null default true,
  account_updates boolean not null default true,
  general boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists consultant_access_consents (
  user_id text primary key references users(id) on delete cascade,
  client_id text not null,
  status text not null default 'NOT_REQUESTED'
    check (status in ('GRANTED','REVOKED','PENDING','NOT_REQUESTED')),
  policy_version text not null,
  source text not null,
  granted_at timestamptz,
  revoked_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (client_id, user_id) references fiteatsy_clients(id, account_user_id) on delete cascade,
  unique (client_id)
);

create index if not exists consultant_access_consents_client_status_idx
  on consultant_access_consents(client_id, status);
