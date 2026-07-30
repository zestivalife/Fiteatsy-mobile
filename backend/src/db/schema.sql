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

create table if not exists auth_sessions (
  id text primary key,
  user_id text not null references users(id),
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  user_agent text,
  ip_address text
);

create table if not exists fiteatsy_clients (
  id text primary key,
  fiteatsy_client_id text not null unique,
  account_user_id text not null unique references users(id) on delete cascade,
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists fiteatsy_clients_public_id_unique
  on fiteatsy_clients (fiteatsy_client_id);

create unique index if not exists fiteatsy_clients_account_user_id_unique
  on fiteatsy_clients (account_user_id);

create table if not exists daily_checkins (
  id bigserial primary key,
  user_id text not null references users(id),
  checkin_date date not null,
  mood smallint not null check (mood between 1 and 5),
  energy smallint not null check (energy between 1 and 5),
  sleep_quality smallint not null check (sleep_quality between 1 and 5),
  created_at timestamptz not null default now(),
  unique (user_id, checkin_date)
);

create table if not exists ai_decision_logs (
  id bigserial primary key,
  user_id text not null references users(id),
  input_summary text not null,
  reasoning text not null,
  output_summary text not null,
  created_at timestamptz not null default now()
);

create table if not exists nudges (
  id text primary key,
  user_id text not null references users(id),
  type text not null,
  title text not null,
  body text not null,
  action_label text not null,
  action_minutes smallint not null,
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  status text not null default 'scheduled'
);

create table if not exists family_connections (
  id text primary key,
  owner_user_id text not null references users(id),
  connected_user_id text,
  relationship_type text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists family_visibility_settings (
  id text primary key,
  owner_user_id text not null references users(id),
  viewer_user_id text,
  recovery_visibility boolean not null default true,
  medication_visibility boolean not null default true,
  calm_visibility boolean not null default false,
  trend_visibility boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists family_support_events (
  id text primary key,
  owner_user_id text not null references users(id),
  viewer_user_id text,
  event_type text not null,
  event_state text not null,
  created_at timestamptz not null default now()
);

create table if not exists health_profiles (
  id uuid primary key,
  user_id text not null references users(id),
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

create table if not exists recovery_programs (
  id uuid primary key,
  health_profile_id uuid not null references health_profiles(id),
  consultant_id text,
  mentor_id text,
  current_phase text not null default 'health_profile_pending',
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists care_cases (
  id uuid primary key,
  user_id text not null references users(id),
  health_profile_id uuid not null references health_profiles(id),
  recovery_program_id uuid not null references recovery_programs(id),
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

create table if not exists nutrition_profiles (
  id uuid primary key,
  user_id text not null references users(id),
  health_profile_id uuid not null references health_profiles(id),
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

create table if not exists timeline_events (
  id uuid primary key,
  care_case_id uuid not null references care_cases(id),
  user_id text not null references users(id),
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

create table if not exists health_events (
  id uuid primary key,
  care_case_id uuid not null references care_cases(id),
  user_id text not null references users(id),
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

create table if not exists health_tickets (
  id uuid primary key,
  care_case_id uuid not null references care_cases(id),
  user_id text not null references users(id),
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

create table if not exists lab_reports (
  id uuid primary key,
  care_case_id uuid references care_cases(id),
  user_id text not null references users(id),
  lab_name text,
  report_date timestamptz,
  source text,
  storage_path text,
  ocr_status text not null default 'queued',
  processing_progress jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists biomarkers (
  id uuid primary key,
  report_id uuid references lab_reports(id),
  care_case_id uuid references care_cases(id),
  user_id text not null references users(id),
  biomarker_name text not null,
  biomarker_value numeric(10,3),
  biomarker_unit text,
  reference_range text,
  trend_direction text,
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists diet_plans (
  id uuid primary key,
  care_case_id uuid not null references care_cases(id),
  user_id text not null references users(id),
  current_version_id uuid,
  plan_status text not null default 'draft',
  readiness_score integer,
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists diet_plan_versions (
  id uuid primary key,
  diet_plan_id uuid not null references diet_plans(id),
  version_number integer not null,
  generated_by text not null,
  content jsonb not null default '{}'::jsonb,
  exported_doc_path text,
  exported_pdf_path text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists clinical_memory (
  id uuid primary key,
  care_case_id uuid not null references care_cases(id),
  user_id text not null references users(id),
  memory_kind text not null,
  content jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists communications (
  id uuid primary key,
  care_case_id uuid not null references care_cases(id),
  user_id text not null references users(id),
  channel text not null,
  message_type text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists notifications (
  id uuid primary key,
  user_id text not null references users(id),
  care_case_id uuid references care_cases(id),
  channel text not null,
  title text not null,
  body text not null,
  sent_at timestamptz,
  status text not null default 'queued',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists attachments (
  id uuid primary key,
  care_case_id uuid references care_cases(id),
  user_id text not null references users(id),
  parent_kind text not null,
  parent_id text not null,
  file_name text not null,
  mime_type text not null,
  storage_path text,
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
