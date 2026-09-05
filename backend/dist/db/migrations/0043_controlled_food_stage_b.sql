create table if not exists controlled_food_measurement_runs (
  id text primary key,
  preparation_id text not null,
  formula_version text not null,
  formula_sha256 text not null check (formula_sha256 ~ '^[a-f0-9]{64}$'),
  measurement_sha256 text not null unique check (measurement_sha256 ~ '^[a-f0-9]{64}$'),
  state text not null check (state in ('INCOMPLETE','COMPLETE','INVALID','FORMULA_DEVIATION','REMEASUREMENT_REQUIRED')),
  evidence jsonb not null,
  operator_id text not null,
  equipment_id text not null,
  measured_on date not null,
  created_at timestamptz not null default now()
);

create table if not exists controlled_food_calculations (
  id text primary key,
  preparation_id text not null,
  measurement_run_id text not null references controlled_food_measurement_runs(id),
  calculation_method_version text not null,
  calculation_sha256 text not null unique check (calculation_sha256 ~ '^[a-f0-9]{64}$'),
  source_registry_sha256 text not null check (source_registry_sha256 ~ '^[a-f0-9]{64}$'),
  input_manifest jsonb not null,
  output_manifest jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists controlled_food_stage_b_reviews (
  id text primary key,
  preparation_id text not null,
  calculation_id text not null references controlled_food_calculations(id),
  calculation_sha256 text not null check (calculation_sha256 ~ '^[a-f0-9]{64}$'),
  reviewer_id text not null,
  reviewer_role text not null check (reviewer_role = 'NUTRITION_REVIEWER'),
  reviewer_qualification text not null,
  decision text not null check (decision in ('APPROVED','CHANGES_REQUIRED','REJECTED')),
  notes text not null default '',
  reviewed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (calculation_id, reviewer_id, decision)
);

create index if not exists controlled_food_measurements_preparation_created_idx
  on controlled_food_measurement_runs (preparation_id, created_at desc);
create index if not exists controlled_food_calculations_preparation_created_idx
  on controlled_food_calculations (preparation_id, created_at desc);
create index if not exists controlled_food_reviews_preparation_reviewed_idx
  on controlled_food_stage_b_reviews (preparation_id, reviewed_at desc);
