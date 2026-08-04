create table if not exists health_reports (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
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
  constraint health_reports_client_owner_fk
    foreign key (client_id, user_id)
    references fiteatsy_clients (id, account_user_id)
    on delete restrict,
  constraint health_reports_processing_status_check
    check (processing_status in ('UPLOADED', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVIEW_REQUIRED'))
);

create index if not exists health_reports_client_created_idx
  on health_reports (client_id, created_at desc)
  where deleted_at is null;

create table if not exists health_report_upload_sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
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
  constraint health_report_upload_sessions_client_owner_fk
    foreign key (client_id, user_id)
    references fiteatsy_clients (id, account_user_id)
    on delete restrict,
  constraint health_report_upload_sessions_status_check
    check (status in ('initialized', 'completed', 'expired'))
);

create index if not exists health_report_upload_sessions_client_created_idx
  on health_report_upload_sessions (client_id, created_at desc);

create table if not exists health_observations (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
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
  constraint health_observations_client_owner_fk
    foreign key (client_id, user_id)
    references fiteatsy_clients (id, account_user_id)
    on delete restrict,
  constraint health_observations_quality_status_check
    check (quality_status in ('accepted', 'duplicate', 'rejected', 'estimated'))
);

create unique index if not exists health_observations_client_sync_key_unique
  on health_observations (client_id, sync_key);

create index if not exists health_observations_client_metric_time_idx
  on health_observations (client_id, metric_type, measured_at desc);

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
  user_id text not null references users(id) on delete cascade,
  client_id text not null,
  biomarker_id text not null references biomarkers(id) on delete restrict,
  source_report_id text references health_reports(id) on delete set null,
  value numeric not null,
  unit text not null,
  test_date date not null,
  confidence numeric(5,4) not null,
  validation_status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint biomarker_observations_client_owner_fk
    foreign key (client_id, user_id)
    references fiteatsy_clients (id, account_user_id)
    on delete restrict,
  constraint biomarker_observations_validation_status_check
    check (validation_status in ('pending', 'validated', 'rejected', 'review_required')),
  constraint biomarker_observations_confidence_check
    check (confidence >= 0 and confidence <= 1)
);

create index if not exists biomarker_observations_client_test_date_idx
  on biomarker_observations (client_id, test_date desc);

create index if not exists biomarker_observations_biomarker_idx
  on biomarker_observations (biomarker_id, test_date desc);

create table if not exists processing_jobs (
  id text primary key,
  client_id text not null references fiteatsy_clients(id) on delete restrict,
  report_id text references health_reports(id) on delete cascade,
  job_type text not null,
  status text not null default 'queued',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint processing_jobs_status_check
    check (status in ('queued', 'processing', 'completed', 'failed', 'review_required'))
);

create index if not exists processing_jobs_client_created_idx
  on processing_jobs (client_id, created_at desc);

create index if not exists processing_jobs_report_idx
  on processing_jobs (report_id);
