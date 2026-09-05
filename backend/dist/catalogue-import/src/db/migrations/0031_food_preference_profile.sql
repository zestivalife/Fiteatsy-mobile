alter table health_profiles
  add column if not exists food_preference_profile jsonb not null default '{}'::jsonb,
  add column if not exists food_preference_updated_by text,
  add column if not exists food_preference_updated_at timestamptz;

create table if not exists food_preference_audit_events (
  id uuid primary key,
  client_id text not null,
  health_profile_id uuid not null references health_profiles(id) on delete cascade,
  actor_user_id text not null references users(id),
  actor_type text not null check (actor_type in ('client', 'consultant')),
  profile jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists food_preference_audit_client_idx
  on food_preference_audit_events (client_id, created_at desc);
