begin;

create table if not exists food_catalogue_usda_activation_v17_32b2 (
  activation_id text primary key,
  reference_item_id text not null unique references food_catalogue_reference_items(id),
  activation_type text not null check(activation_type in ('NEW_MAPPING','ALIAS_EXISTING')),
  governed_food_id text not null,
  selected_fdc_id integer not null,
  source_mapping_id text not null,
  nutrition_hash text not null check(nutrition_hash ~ '^[a-f0-9]{64}$'),
  serving_hash text not null check(serving_hash ~ '^[a-f0-9]{64}$'),
  operational_use_state text not null check(operational_use_state in ('DIRECT_ADDABLE','COMPONENT_ADDABLE','INGREDIENT_ONLY','SECONDARY_ONLY')),
  roles jsonb not null default '[]'::jsonb,
  meal_heads jsonb not null default '[]'::jsonb,
  generator_eligible boolean not null default false,
  component_eligible boolean not null default false,
  direct_add_eligible boolean not null default false,
  alias_target_food_id text,
  artifact_sha256 text not null check(artifact_sha256 ~ '^[a-f0-9]{64}$'),
  processor_version text not null check(processor_version = 'FOOD_USDA_ACTIVATION_V17_32B2'),
  activation_payload jsonb not null,
  created_at timestamptz not null default now(),
  check ((activation_type = 'ALIAS_EXISTING') = (alias_target_food_id is not null)),
  check (not generator_eligible or activation_type = 'NEW_MAPPING'),
  check (not direct_add_eligible or component_eligible)
);

create table if not exists food_catalogue_usda_activation_audit_v17_32b2 (
  id uuid primary key,
  activation_id text not null references food_catalogue_usda_activation_v17_32b2(activation_id),
  reference_item_id text not null references food_catalogue_reference_items(id),
  event_type text not null check(event_type in (
    'USDA_MAPPING_ACTIVATED',
    'USDA_ALIAS_MERGED',
    'NUTRITION_VERIFIED',
    'SERVING_VERIFIED',
    'GENERATOR_ACTIVATED',
    'COMPONENT_ACTIVATED',
    'DIRECT_ADD_ACTIVATED',
    'ACTIVATION_REJECTED'
  )),
  processor_version text not null check(processor_version = 'FOOD_USDA_ACTIVATION_V17_32B2'),
  event_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique(activation_id, event_type, processor_version)
);

create unique index if not exists food_catalogue_usda_activation_v17_32b2_new_fdc_idx
  on food_catalogue_usda_activation_v17_32b2(selected_fdc_id)
  where activation_type = 'NEW_MAPPING';

create index if not exists food_catalogue_usda_activation_v17_32b2_role_idx
  on food_catalogue_usda_activation_v17_32b2 using gin(roles);

commit;
