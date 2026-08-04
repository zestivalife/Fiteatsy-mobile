alter table health_reports
  drop constraint if exists health_reports_processing_status_check;

alter table health_reports
  add constraint health_reports_processing_status_check
  check (
    processing_status in (
      'UPLOADED',
      'PROCESSING',
      'EXTRACTION_COMPLETED',
      'VALIDATION_PENDING',
      'COMPLETED',
      'FAILED',
      'REVIEW_REQUIRED'
    )
  );

alter table processing_jobs
  drop constraint if exists processing_jobs_status_check;

alter table processing_jobs
  add constraint processing_jobs_status_check
  check (status in ('queued', 'processing', 'extraction_completed', 'validation_pending', 'completed', 'failed', 'review_required'));

alter table biomarker_observations
  add column if not exists source_location text,
  add column if not exists reference_range text;

create table if not exists health_scores (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  client_id text not null,
  score_type text not null,
  score_value integer,
  score_status text not null default 'insufficient_data',
  confidence numeric(5,4) not null default 0,
  input_summary jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(),
  calculation_version text not null,
  constraint health_scores_client_owner_fk
    foreign key (client_id, user_id)
    references fiteatsy_clients (id, account_user_id)
    on delete restrict,
  constraint health_scores_score_type_check
    check (score_type in ('nutrition', 'clinical', 'activity', 'recovery', 'overall')),
  constraint health_scores_status_check
    check (score_status in ('calculated', 'insufficient_data')),
  constraint health_scores_value_check
    check (score_value is null or (score_value >= 0 and score_value <= 100)),
  constraint health_scores_confidence_check
    check (confidence >= 0 and confidence <= 1)
);

create index if not exists health_scores_client_calculated_idx
  on health_scores (client_id, calculated_at desc);

create index if not exists health_scores_client_type_calculated_idx
  on health_scores (client_id, score_type, calculated_at desc);
