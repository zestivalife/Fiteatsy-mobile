create table if not exists controlled_food_measurement_submissions (
  id text primary key,
  preparation_id text not null,
  evidence_classification text not null check (evidence_classification = 'USER_CONFIRMED_PHYSICAL_MEASUREMENT_EVIDENCE'),
  submission_sha256 text not null unique check (submission_sha256 ~ '^[a-f0-9]{64}$'),
  evidence_manifest jsonb not null,
  supersedes_submission_id text references controlled_food_measurement_submissions(id),
  superseded_at timestamptz,
  received_at timestamptz not null default now(),
  check (superseded_at is null or supersedes_submission_id is not null)
);

create index if not exists controlled_food_measurement_submissions_preparation_idx
  on controlled_food_measurement_submissions (preparation_id, received_at desc);
