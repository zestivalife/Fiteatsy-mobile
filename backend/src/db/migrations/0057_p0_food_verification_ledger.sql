begin;
create table if not exists food_catalogue_p0_verification_decisions (
  decision_id text primary key,
  reference_item_id text not null unique references food_catalogue_reference_items(id),
  artifact_sha256 text not null check(artifact_sha256 ~ '^[a-f0-9]{64}$'),
  outcome text not null check(outcome in ('ACTIVATED_GENERATOR','ACTIVATED_COMPONENT_ONLY','SOURCE_MAPPED_NOT_GENERATOR','SOURCE_FOUND_STATE_MISMATCH','SERVING_PROFILE_INCOMPLETE','ONTOLOGY_ROLE_INCOMPLETE','PREPARED_PROVENANCE_REQUIRED','EXTERNAL_SOURCE_REQUIRED','NOT_SUITABLE_FOR_GENERATOR')),
  operational_use_state text not null,
  target_roles jsonb not null default '[]'::jsonb,
  generator_eligible boolean not null default false,
  component_eligible boolean not null default false,
  evidence_status text not null,
  decision_payload jsonb not null,
  created_at timestamptz not null default now(),
  check (not generator_eligible or outcome = 'ACTIVATED_GENERATOR'),
  check (not component_eligible or outcome in ('ACTIVATED_GENERATOR','ACTIVATED_COMPONENT_ONLY'))
);
create index if not exists food_catalogue_p0_verification_outcome_idx on food_catalogue_p0_verification_decisions(outcome,created_at);
commit;
