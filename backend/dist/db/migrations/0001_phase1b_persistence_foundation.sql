create table if not exists users (
  id text primary key,
  name text not null,
  email_normalized text,
  mobile_number_normalized text,
  email_verified_at timestamptz,
  mobile_verified_at timestamptz,
  role text,
  work_hours text,
  biggest_challenge text,
  calendar_provider text,
  status text not null default 'active',
  version integer not null default 1,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table users alter column role drop not null;
alter table users alter column work_hours drop not null;
alter table users alter column biggest_challenge drop not null;
alter table users alter column calendar_provider drop not null;

alter table users add column if not exists email_normalized text;
alter table users add column if not exists mobile_number_normalized text;
alter table users add column if not exists email_verified_at timestamptz;
alter table users add column if not exists mobile_verified_at timestamptz;
alter table users add column if not exists status text not null default 'active';
alter table users add column if not exists version integer not null default 1;
alter table users add column if not exists last_login_at timestamptz;
alter table users add column if not exists updated_at timestamptz not null default now();
alter table users add column if not exists deleted_at timestamptz;

create unique index if not exists users_email_normalized_unique
  on users (email_normalized)
  where email_normalized is not null and deleted_at is null;

create unique index if not exists users_mobile_number_normalized_unique
  on users (mobile_number_normalized)
  where mobile_number_normalized is not null and deleted_at is null;

create table if not exists auth_sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  user_agent text,
  ip_address text
);

create unique index if not exists auth_sessions_token_hash_unique on auth_sessions (token_hash);
create index if not exists auth_sessions_user_id_idx on auth_sessions (user_id);
create index if not exists auth_sessions_active_lookup_idx on auth_sessions (token_hash, expires_at) where revoked_at is null;

create table if not exists health_profiles (
  id uuid primary key,
  user_id text not null references users(id) on delete cascade,
  date_of_birth_iso timestamptz,
  calculated_age integer,
  gender text,
  height_cm numeric(6,2),
  current_weight_kg numeric(6,2),
  goal_weight_kg numeric(6,2),
  waist_cm numeric(6,2),
  hip_cm numeric(6,2),
  neck_cm numeric(6,2),
  body_fat_pct numeric(5,2),
  occupation text,
  working_hours_label text,
  shift_type text,
  activity_level text,
  work_mode text,
  travel_frequency text,
  diet_type text,
  regional_cuisine text,
  foods_liked jsonb not null default '[]'::jsonb,
  foods_disliked jsonb not null default '[]'::jsonb,
  food_allergies jsonb not null default '[]'::jsonb,
  food_intolerances jsonb not null default '[]'::jsonb,
  current_supplements jsonb not null default '[]'::jsonb,
  current_medicines jsonb not null default '[]'::jsonb,
  wake_time text,
  breakfast_time text,
  lunch_time text,
  dinner_time text,
  sleep_time text,
  meals_per_day integer,
  water_intake_liters numeric(6,2),
  outside_food_frequency text,
  cooking_at_home text,
  who_cooks text,
  primary_conditions jsonb not null default '[]'::jsonb,
  wellness_goals jsonb not null default '[]'::jsonb,
  assigned_consultant_id text,
  assigned_mentor_id text,
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists health_profiles_active_user_unique
  on health_profiles (user_id)
  where deleted_at is null and status = 'active';

create table if not exists recovery_programs (
  id uuid primary key,
  health_profile_id uuid not null references health_profiles(id) on delete cascade,
  consultant_id text,
  mentor_id text,
  current_phase text not null default 'health_profile_pending',
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists recovery_programs_active_profile_unique
  on recovery_programs (health_profile_id)
  where deleted_at is null and status = 'active';

create table if not exists care_cases (
  id uuid primary key,
  user_id text not null references users(id) on delete cascade,
  health_profile_id uuid not null references health_profiles(id) on delete cascade,
  recovery_program_id uuid not null references recovery_programs(id) on delete cascade,
  assigned_consultant_id text,
  assigned_mentor_id text,
  current_stage text not null,
  previous_stage text,
  last_transition_at timestamptz not null default now(),
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists care_cases_active_user_unique
  on care_cases (user_id)
  where deleted_at is null and status = 'active';

create table if not exists nutrition_profiles (
  id uuid primary key,
  user_id text not null references users(id) on delete cascade,
  health_profile_id uuid not null references health_profiles(id) on delete cascade,
  completion_percent integer not null default 0,
  readiness_score integer not null default 0,
  ai_ready boolean not null default false,
  missing_fields jsonb not null default '[]'::jsonb,
  section_scores jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists nutrition_profiles_active_profile_unique
  on nutrition_profiles (health_profile_id)
  where deleted_at is null and status = 'active';

create table if not exists timeline_events (
  id uuid primary key,
  care_case_id uuid not null references care_cases(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  kind text not null,
  title text not null,
  detail text not null,
  event_time timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists timeline_events_case_idx on timeline_events (care_case_id, event_time desc);

create table if not exists health_events (
  id uuid primary key,
  care_case_id uuid not null references care_cases(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  event_type text not null,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  replay_key text not null,
  event_time timestamptz not null,
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists health_events_replay_key_unique on health_events (replay_key);
create index if not exists health_events_case_idx on health_events (care_case_id, event_time desc);

create table if not exists health_tickets (
  id uuid primary key,
  care_case_id uuid not null references care_cases(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  ticket_type text not null,
  priority text not null,
  owner_id text,
  due_at timestamptz,
  ticket_status text not null default 'open',
  resolution text,
  timeline_event_ids jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists health_tickets_case_idx on health_tickets (care_case_id, created_at desc);

create table if not exists notifications (
  id uuid primary key,
  user_id text not null references users(id) on delete cascade,
  care_case_id uuid references care_cases(id) on delete cascade,
  channel text not null,
  title text not null,
  body text not null,
  sent_at timestamptz,
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists notifications_user_idx on notifications (user_id, created_at desc);
