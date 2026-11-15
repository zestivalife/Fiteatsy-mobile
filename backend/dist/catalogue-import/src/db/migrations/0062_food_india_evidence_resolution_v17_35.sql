begin;

create table if not exists food_india_source_assessments_v17_35 (
  assessment_id text primary key,
  source_name text not null,
  source_url text not null,
  rights_status text not null,
  electronic_product_reuse text not null check(electronic_product_reuse in ('CLEARED','NOT_CLEARED')),
  nutrition_use_decision text not null check(nutrition_use_decision in ('PROHIBITED','NOT_ACTIVATION_ELIGIBLE','ACTIVATION_ELIGIBLE')),
  numeric_values_ingested boolean not null default false,
  artifact_sha256 text not null check(artifact_sha256 ~ '^[a-f0-9]{64}$'),
  assessment_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (electronic_product_reuse <> 'NOT_CLEARED' or nutrition_use_decision = 'PROHIBITED'),
  check (nutrition_use_decision = 'ACTIVATION_ELIGIBLE' or not numeric_values_ingested)
);

create table if not exists food_india_resolution_v17_35 (
  decision_id text primary key,
  reference_item_id text not null unique references food_catalogue_reference_items(id),
  final_decision text not null check(final_decision = 'INDIA_LAB_VALIDATION_REQUIRED'),
  evidence_class text not null,
  ifct_rights_status text not null check(ifct_rights_status = 'PRIOR_WRITTEN_PERMISSION_REQUIRED'),
  ifct_numeric_values_ingested boolean not null default false check(not ifct_numeric_values_ingested),
  activation_eligible boolean not null default false check(not activation_eligible),
  artifact_sha256 text not null check(artifact_sha256 ~ '^[a-f0-9]{64}$'),
  processor_version text not null check(processor_version = 'FOOD_INDIA_EVIDENCE_RESOLUTION_V17_35'),
  decision_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists food_india_lab_queue_v17_35 (
  lab_request_id text primary key,
  reference_item_id text not null unique references food_catalogue_reference_items(id),
  status text not null check(status in ('PENDING_SAMPLE_AND_LAB_EVIDENCE','EVIDENCE_SUBMITTED','VALIDATED','REJECTED')),
  evidence_class text not null,
  sample_country text not null check(sample_country = 'INDIA'),
  preferred_accreditation text not null check(preferred_accreditation = 'NABL_ISO_IEC_17025'),
  required_scope text not null check(required_scope = 'FOOD_PROXIMATE_ANALYSIS'),
  required_analytes jsonb not null,
  required_basis text not null,
  artifact_sha256 text not null check(artifact_sha256 ~ '^[a-f0-9]{64}$'),
  request_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists food_india_resolution_v17_35_class_idx on food_india_resolution_v17_35(evidence_class, final_decision);
create index if not exists food_india_lab_queue_v17_35_status_idx on food_india_lab_queue_v17_35(status, evidence_class);

commit;
