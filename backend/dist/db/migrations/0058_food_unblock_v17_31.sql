begin;

create table if not exists food_catalogue_v17_31_unblock_decisions (
  decision_id text primary key,
  reference_item_id text not null unique references food_catalogue_reference_items(id),
  artifact_sha256 text not null check(artifact_sha256 ~ '^[a-f0-9]{64}$'),
  processor_version text not null check(processor_version = 'FOOD_UNBLOCK_V17_31'),
  canonical_identity text not null,
  aliases jsonb not null default '[]'::jsonb,
  category text not null,
  subcategory text,
  exact_state text not null,
  preparation_state text,
  source_organisation text,
  dataset text,
  source_record text,
  source_version text,
  source_rights_status text,
  nutrition_vector jsonb,
  serving_profile jsonb,
  roles jsonb not null default '[]'::jsonb,
  meal_head_eligibility jsonb not null default '[]'::jsonb,
  operational_use_state text not null,
  generator_eligible boolean not null default false,
  component_eligible boolean not null default false,
  direct_add_eligible boolean not null default false,
  evidence_status text not null,
  decision_outcome text not null check(decision_outcome in (
    'ACTIVATED_GENERATOR',
    'ACTIVATED_COMPONENT_ONLY',
    'ACTIVATED_DIRECT_ADDABLE',
    'VERIFIED_INGREDIENT_ONLY',
    'VERIFIED_SECONDARY_ONLY',
    'SOURCE_MAPPED_NOT_GENERATOR',
    'SOURCE_FOUND_STATE_MISMATCH',
    'SERVING_PROFILE_INCOMPLETE',
    'ONTOLOGY_ROLE_INCOMPLETE',
    'PREPARED_PROVENANCE_REQUIRED',
    'EXTERNAL_SOURCE_REQUIRED',
    'NOT_SUITABLE_FOR_GENERATOR',
    'BLOCKED_BY_GOVERNANCE'
  )),
  rationale text not null,
  decision_payload jsonb not null,
  created_at timestamptz not null default now(),
  check (not generator_eligible or decision_outcome = 'ACTIVATED_GENERATOR'),
  check (not component_eligible or decision_outcome in ('ACTIVATED_GENERATOR','ACTIVATED_COMPONENT_ONLY','ACTIVATED_DIRECT_ADDABLE')),
  check (not direct_add_eligible or decision_outcome = 'ACTIVATED_DIRECT_ADDABLE')
);

create table if not exists food_catalogue_v17_31_unblock_audit (
  id uuid primary key,
  reference_item_id text not null references food_catalogue_reference_items(id),
  decision_id text not null references food_catalogue_v17_31_unblock_decisions(decision_id),
  event_type text not null check(event_type in (
    'SOURCE_MAPPED',
    'NUTRITION_VERIFIED',
    'SERVING_VERIFIED',
    'OPERATIONAL_USE_ASSIGNED',
    'GENERATOR_ACTIVATED',
    'COMPONENT_ACTIVATED',
    'DIRECT_ADD_ACTIVATED',
    'FOOD_REMAINED_BLOCKED'
  )),
  processor_version text not null check(processor_version = 'FOOD_UNBLOCK_V17_31'),
  event_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique(reference_item_id, event_type, processor_version)
);

create index if not exists food_catalogue_v17_31_unblock_outcome_idx
  on food_catalogue_v17_31_unblock_decisions(decision_outcome, created_at);

commit;
