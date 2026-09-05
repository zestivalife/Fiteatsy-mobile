create table if not exists controlled_food_stage_a_formula_reviews (
  id text primary key,
  preparation_id text not null,
  formula_version text not null,
  formula_sha256 text check (formula_sha256 is null or formula_sha256 ~ '^[a-f0-9]{64}$'),
  formula_manifest jsonb not null,
  decision text not null check (decision in ('PENDING','APPROVED','CHANGES_REQUIRED','REJECTED')),
  reviewer_id text,
  reviewer_qualification text,
  declaration text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (preparation_id, formula_version),
  check (
    decision <> 'APPROVED' or
    (formula_sha256 is not null and reviewer_id is not null and reviewer_qualification is not null and declaration is not null and reviewed_at is not null)
  )
);

create table if not exists controlled_food_preparation_evidence (
  id text primary key,
  preparation_id text not null,
  formula_review_id text not null references controlled_food_stage_a_formula_reviews(id),
  measurement_run_id text references controlled_food_measurement_runs(id),
  preparation_method text not null,
  ingredient_manifest jsonb not null,
  process_water_manifest jsonb not null default '[]'::jsonb,
  yield_manifest jsonb,
  evidence_sha256 text not null unique check (evidence_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);

create index if not exists controlled_food_stage_a_preparation_idx
  on controlled_food_stage_a_formula_reviews (preparation_id, created_at desc);
create index if not exists controlled_food_preparation_evidence_idx
  on controlled_food_preparation_evidence (preparation_id, created_at desc);
