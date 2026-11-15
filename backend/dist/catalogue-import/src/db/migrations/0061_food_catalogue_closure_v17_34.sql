begin;

create table if not exists food_catalogue_closure_v17_34 (
  closure_id text primary key,
  reference_item_id text not null unique references food_catalogue_reference_items(id),
  terminal_state text not null check(terminal_state in ('ACTIVATED_GOVERNED','ALIAS_GOVERNED','SOURCE_IDENTITY_LINKED','BLOCKED_EVIDENCE')),
  terminal_reason text not null,
  governed_food_id text,
  source_mapping_id text,
  effective_processor_version text not null,
  artifact_sha256 text not null check(artifact_sha256 ~ '^[a-f0-9]{64}$'),
  processor_version text not null check(processor_version = 'FOOD_CATALOGUE_CLOSURE_V17_34'),
  closure_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((terminal_state = 'BLOCKED_EVIDENCE') = (governed_food_id is null and source_mapping_id is null)),
  check (terminal_state <> 'ACTIVATED_GOVERNED' or (governed_food_id is not null and source_mapping_id is not null)),
  check (terminal_state <> 'ALIAS_GOVERNED' or (governed_food_id is not null and source_mapping_id is not null)),
  check (terminal_state <> 'SOURCE_IDENTITY_LINKED' or source_mapping_id is not null)
);

create index if not exists food_catalogue_closure_v17_34_terminal_state_idx
  on food_catalogue_closure_v17_34(terminal_state, terminal_reason);

commit;
