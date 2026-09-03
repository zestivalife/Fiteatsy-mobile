begin;
create table if not exists canonical_ingredients (
  id text primary key, canonical_name text not null, form text not null, preparation_state text not null,
  species_or_variety text, grade text, nutrient_basis text not null, identity_sha256 text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists canonical_ingredient_source_mappings (
  id text primary key, ingredient_id text not null references canonical_ingredients(id), source_id text not null,
  source_record_id text not null, source_version text not null, decision text not null check (decision in
  ('PENDING','APPROVED_EXACT_SOURCE','APPROVED_EQUIVALENT_SOURCE','APPROVED_MEASURED_LOCAL_REFERENCE','REJECTED_SOURCE','NO_ACCEPTABLE_SOURCE')),
  rationale text, reviewer_id text, reviewer_qualification text, reviewed_at timestamptz,
  source_sha256 text not null, raw_nutrients jsonb not null, identity_snapshot jsonb not null,
  supersedes_mapping_id text references canonical_ingredient_source_mappings(id), created_at timestamptz not null default now(),
  unique(source_id, source_record_id, source_version, ingredient_id)
);
create unique index if not exists one_current_approved_ingredient_source on canonical_ingredient_source_mappings(ingredient_id)
  where decision in ('APPROVED_EXACT_SOURCE','APPROVED_EQUIVALENT_SOURCE','APPROVED_MEASURED_LOCAL_REFERENCE') and supersedes_mapping_id is null;
create table if not exists controlled_food_human_gate_submissions (
  id text primary key, task_sha256 text not null, evidence_sha256 text not null, submission_sha256 text not null unique,
  reviewer_id text not null, reviewer_qualification text not null, authority text not null,
  decisions jsonb not null, ingestion_report jsonb not null, supersedes_submission_id text references controlled_food_human_gate_submissions(id),
  created_at timestamptz not null default now()
);
create table if not exists canonical_recipe_versions (
  id text primary key, preparation_id text not null, version integer not null check(version>0), state text not null,
  formula_sha256 text not null unique, formula_lines jsonb not null, created_at timestamptz not null default now(), unique(preparation_id,version)
);
create table if not exists controlled_food_validation_releases (
  id text primary key, recipe_version_id text not null references canonical_recipe_versions(id),
  calculation_id text not null references controlled_food_calculations(id), stage_b_review_id text not null references controlled_food_stage_b_reviews(id),
  release_sha256 text not null unique, state text not null check(state in ('DRAFT','ACCEPTED','WITHDRAWN')), created_at timestamptz not null default now()
);
create table if not exists controlled_food_serving_variants (
  id text primary key, validation_release_id text not null references controlled_food_validation_releases(id), label text not null,
  grams numeric not null check(grams>0), nutrients jsonb not null, serving_sha256 text not null unique, unique(validation_release_id,label,grams)
);
create table if not exists food_population_batches (
  id text primary key, status text not null check(status in ('DRAFT','VALIDATING','ACCEPTED','REJECTED')), manifest_sha256 text not null unique,
  item_count integer not null check(item_count>=0), created_at timestamptz not null default now()
);
create table if not exists food_coverage_runs (
  id text primary key, population_batch_id text references food_population_batches(id), profile jsonb not null,
  required_options integer not null check(required_options>0), result jsonb not null, result_sha256 text not null unique, created_at timestamptz not null default now()
);
commit;
