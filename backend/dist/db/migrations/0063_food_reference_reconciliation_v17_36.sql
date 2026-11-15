begin;

create table if not exists food_reference_reconciliation_v17_36 (
  decision_id text primary key,
  reference_item_id text not null unique references food_catalogue_reference_items(id),
  canonical_name text not null,
  final_status text not null check(final_status in ('EXISTING_GOVERNED_RUNTIME_IDENTITY','ALIAS_EXISTING','DUPLICATE_REFERENCE','GOVERNED_PARENT_MAPPING','NEW_MAPPING','RECIPE_OR_PREPARATION_IDENTITY','SECONDARY_ONLY','INGREDIENT_ONLY','INDIA_LAB_VALIDATION_REQUIRED')),
  governed_food_id text,
  runtime_food_id text,
  alias_target text,
  duplicate_target text,
  parent_target text,
  source_mapping_id text,
  evidence_status text not null,
  operational_use text not null,
  processor_version text not null check(processor_version='FOOD_REFERENCE_RECONCILIATION_V17_36'),
  artifact_hash text not null check(artifact_hash ~ '^[a-f0-9]{64}$'),
  decision_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((final_status='ALIAS_EXISTING')=(alias_target is not null)),
  check ((final_status='DUPLICATE_REFERENCE')=(duplicate_target is not null)),
  check ((final_status='GOVERNED_PARENT_MAPPING')=(parent_target is not null)),
  check (final_status not in ('EXISTING_GOVERNED_RUNTIME_IDENTITY','ALIAS_EXISTING','NEW_MAPPING') or (runtime_food_id is not null and governed_food_id is not null and source_mapping_id is not null))
);
create unique index if not exists food_reference_reconciliation_v17_36_alias_unique on food_reference_reconciliation_v17_36(lower(canonical_name),alias_target) where alias_target is not null;
create unique index if not exists food_reference_reconciliation_v17_36_source_unique on food_reference_reconciliation_v17_36(reference_item_id,source_mapping_id) where source_mapping_id is not null;
create index if not exists food_reference_reconciliation_v17_36_status_idx on food_reference_reconciliation_v17_36(final_status,evidence_status);

commit;
