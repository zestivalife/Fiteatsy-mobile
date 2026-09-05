alter table users
  add column if not exists pin_hash text,
  add column if not exists pin_created_at timestamptz,
  add column if not exists pin_last_changed_at timestamptz,
  add column if not exists force_pin_change boolean not null default false,
  add column if not exists pin_failed_attempts integer not null default 0,
  add column if not exists pin_locked_until timestamptz;

create table if not exists auth_events (
  id text primary key,
  user_id text references users(id) on delete set null,
  event text not null,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists auth_events_user_created_idx
  on auth_events (user_id, created_at desc);

create index if not exists users_pin_locked_until_idx
  on users (pin_locked_until)
  where pin_locked_until is not null;
