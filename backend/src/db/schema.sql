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

create unique index if not exists fiteatsy_clients_internal_owner_unique
  on fiteatsy_clients (id, account_user_id);

create table if not exists daily_checkins (
  id bigserial primary key,
  user_id text not null references users(id),
  client_id text,
  checkin_date date not null,
  mood smallint not null check (mood between 1 and 5),
  energy smallint not null check (energy between 1 and 5),
  sleep_quality smallint not null check (sleep_quality between 1 and 5),
  created_at timestamptz not null default now(),
  foreign key (client_id, user_id) references fiteatsy_clients(id, account_user_id) on delete restrict,
  unique (user_id, checkin_date)
);

create table if not exists ai_decision_logs (
  id bigserial primary key,
  user_id text not null references users(id),
  client_id text,
  input_summary text not null,
  reasoning text not null,
  output_summary text not null,
  created_at timestamptz not null default now(),
  foreign key (client_id, user_id) references fiteatsy_clients(id, account_user_id) on delete restrict
);

create table if not exists nudges (
  id text primary key,
  user_id text not null references users(id),
  client_id text,
  type text not null,
  title text not null,
  body text not null,
  action_label text not null,
  action_minutes smallint not null,
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  status text not null default 'scheduled',
  foreign key (client_id, user_id) references fiteatsy_clients(id, account_user_id) on delete restrict
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
  client_id text,
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
  deleted_at timestamptz,
  foreign key (client_id, user_id) references fiteatsy_clients(id, account_user_id) on delete restrict
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
  client_id text,
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
  deleted_at timestamptz,
  foreign key (client_id, user_id) references fiteatsy_clients(id, account_user_id) on delete restrict
);

create table if not exists nutrition_profiles (
  id uuid primary key,
  user_id text not null references users(id),
  client_id text,
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
  deleted_at timestamptz,
  foreign key (client_id, user_id) references fiteatsy_clients(id, account_user_id) on delete restrict
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

create table if not exists health_reports (
  id text primary key,
  user_id text not null references users(id),
  client_id text not null,
  report_type text not null default 'medical_report',
  storage_object_ref text not null,
  original_filename text not null,
  mime_type text not null,
  file_size integer not null,
  upload_source text,
  processing_status text not null default 'UPLOADED',
  report_date text,
  lab_name text,
  error text,
  analysis_version integer not null default 1,
  analysis jsonb,
  feedback jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (client_id, user_id) references fiteatsy_clients(id, account_user_id) on delete restrict,
  check (processing_status in ('UPLOADED', 'PROCESSING', 'EXTRACTION_COMPLETED', 'VALIDATION_PENDING', 'COMPLETED', 'FAILED', 'REVIEW_REQUIRED'))
);

create table if not exists health_report_upload_sessions (
  id text primary key,
  user_id text not null references users(id),
  client_id text not null,
  file_name text not null,
  mime_type text not null,
  file_size integer not null,
  upload_source text,
  storage_object_ref text not null,
  status text not null default 'initialized',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  foreign key (client_id, user_id) references fiteatsy_clients(id, account_user_id) on delete restrict
);

create table if not exists health_observations (
  id text primary key,
  user_id text not null references users(id),
  client_id text not null,
  metric_type text not null,
  value numeric not null,
  unit text not null,
  measured_at timestamptz not null,
  source_provider text not null,
  source_record_id text,
  sync_key text not null,
  quality_status text not null default 'accepted',
  created_at timestamptz not null default now(),
  foreign key (client_id, user_id) references fiteatsy_clients(id, account_user_id) on delete restrict
);

create table if not exists biomarkers (
  id text primary key,
  canonical_name text not null unique,
  aliases jsonb not null default '[]'::jsonb,
  category text not null,
  standard_unit text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists biomarker_observations (
  id text primary key,
  user_id text not null references users(id),
  client_id text not null,
  biomarker_id text not null references biomarkers(id),
  source_report_id text references health_reports(id) on delete set null,
  value numeric not null,
  unit text not null,
  test_date date not null,
  confidence numeric(5,4) not null,
  validation_status text not null default 'pending',
  original_parameter_name text,
  source_location text,
  reference_range text,
  created_at timestamptz not null default now(),
  foreign key (client_id, user_id) references fiteatsy_clients(id, account_user_id) on delete restrict,
  check (validation_status in ('pending', 'validated', 'rejected', 'review_required')),
  check (confidence >= 0 and confidence <= 1)
);

create table if not exists processing_jobs (
  id text primary key,
  client_id text not null references fiteatsy_clients(id) on delete restrict,
  report_id text references health_reports(id) on delete cascade,
  job_type text not null,
  status text not null default 'queued',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('queued', 'processing', 'extraction_completed', 'validation_pending', 'completed', 'failed', 'review_required'))
);

create table if not exists health_scores (
  id text primary key,
  user_id text not null references users(id),
  client_id text not null,
  score_type text not null,
  score_value integer,
  score_status text not null default 'insufficient_data',
  confidence numeric(5,4) not null default 0,
  input_summary jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(),
  calculation_version text not null,
  foreign key (client_id, user_id) references fiteatsy_clients(id, account_user_id) on delete restrict,
  check (score_type in ('nutrition', 'clinical', 'activity', 'sleep', 'calm', 'recovery', 'overall')),
  check (score_status in ('calculated', 'insufficient_data')),
  check (score_value is null or (score_value >= 0 and score_value <= 100)),
  check (confidence >= 0 and confidence <= 1)
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
  client_id text,
  care_case_id uuid references care_cases(id),
  channel text not null,
  title text not null,
  body text not null,
  sent_at timestamptz,
  status text not null default 'queued',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (client_id, user_id) references fiteatsy_clients(id, account_user_id) on delete restrict
);

create table if not exists attachments (
  id uuid primary key,
  care_case_id uuid references care_cases(id),
  user_id text not null references users(id),
  client_id text,
  parent_kind text not null,
  parent_id text not null,
  file_name text not null,
  mime_type text not null,
  storage_path text,
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (client_id, user_id) references fiteatsy_clients(id, account_user_id) on delete restrict
);

create unique index if not exists daily_checkins_client_date_unique
  on daily_checkins (client_id, checkin_date)
  where client_id is not null;

create index if not exists ai_decision_logs_client_created_idx
  on ai_decision_logs (client_id, created_at desc)
  where client_id is not null;

create index if not exists nudges_client_scheduled_idx
  on nudges (client_id, scheduled_at desc)
  where client_id is not null;

create unique index if not exists health_profiles_active_client_unique
  on health_profiles (client_id)
  where client_id is not null
    and deleted_at is null
    and status = 'active';

create unique index if not exists care_cases_active_client_unique
  on care_cases (client_id)
  where client_id is not null
    and deleted_at is null
    and status = 'active';

create unique index if not exists nutrition_profiles_active_client_unique
  on nutrition_profiles (client_id)
  where client_id is not null
    and deleted_at is null
    and status = 'active';

create index if not exists notifications_client_created_idx
  on notifications (client_id, created_at desc)
  where client_id is not null;

create index if not exists health_reports_client_created_idx
  on health_reports (client_id, created_at desc)
  where deleted_at is null;

create unique index if not exists health_observations_client_sync_key_unique
  on health_observations (client_id, sync_key);

create index if not exists biomarker_observations_client_test_date_idx
  on biomarker_observations (client_id, test_date desc);

create index if not exists processing_jobs_client_created_idx
  on processing_jobs (client_id, created_at desc);

create index if not exists health_scores_client_calculated_idx
  on health_scores (client_id, calculated_at desc);

create index if not exists health_scores_client_type_calculated_idx
  on health_scores (client_id, score_type, calculated_at desc);

create index if not exists attachments_client_created_idx
  on attachments (client_id, created_at desc)
  where client_id is not null;
