begin;

alter table food_catalogue_reference_items
  add column if not exists verification_priority text,
  add column if not exists processing_status text not null default 'UNPROCESSED',
  add column if not exists operational_use_state text,
  add column if not exists target_roles jsonb not null default '[]'::jsonb,
  add column if not exists evidence_status text not null default 'AUTHORITATIVE_SOURCE_AND_SERVING_REQUIRED',
  add column if not exists processing_version text;

update food_catalogue_reference_items
set
  verification_priority = case
    when lower(category) ~ '(vegetable|grain|millet|pulse|legume|fruit|dairy|protein|fish|breakfast)' then 'P0'
    when lower(category) ~ '(nut|seed|beverage|prepared|bread|staple|cooked basic|non-veg)' then 'P1'
    else 'P2'
  end,
  processing_status = case
    when lower(category) ~ '(vegetable|grain|millet|pulse|legume|fruit|dairy|protein|fish|breakfast)'
      then 'TRIAGED_PENDING_EVIDENCE'
    else 'UNPROCESSED'
  end,
  operational_use_state = case
    when lower(category) ~ 'fruit' and reference_state in ('RAW','READY_TO_EAT') then 'DIRECT_ADDABLE'
    when lower(category) ~ 'dairy' and reference_state not in ('RAW','UNCOOKED','POWDERED') then 'DIRECT_ADDABLE'
    when reference_state in ('COOKED','BOILED','STEAMED','ROASTED','BAKED','GRILLED','SAUTEED','PRESSURE_COOKED','SPROUTED','FERMENTED','READY_TO_EAT','PREPARED_DISH') then 'COMPONENT_ADDABLE'
    when reference_state in ('RAW','UNCOOKED','DRIED','DEHYDRATED','POWDERED','FLOUR','PASTE') then 'INGREDIENT_ONLY'
    else 'PREPARATION_REQUIRED'
  end,
  target_roles = case
    when lower(category) ~ 'vegetable' then '["VEGETABLE"]'::jsonb
    when lower(category) ~ '(pulse|legume)' then '["PULSE","PROTEIN"]'::jsonb
    when lower(category) ~ '(grain|millet)' then '["GRAIN","STARCH"]'::jsonb
    when lower(category) ~ 'fruit' then '["FRUIT"]'::jsonb
    when lower(category) ~ 'dairy' then '["DAIRY","PROTEIN"]'::jsonb
    when lower(category) ~ '(protein|fish)' then '["PROTEIN"]'::jsonb
    else '[]'::jsonb
  end,
  evidence_status = 'AUTHORITATIVE_SOURCE_AND_SERVING_REQUIRED',
  processing_version = case
    when lower(category) ~ '(vegetable|grain|millet|pulse|legume|fruit|dairy|protein|fish|breakfast)'
      then 'P0_OPERATIONAL_TRIAGE_V17_29R'
    else null
  end
where batch_id = 'BATCH_0_PAN_INDIA_FOOD_SEED';

alter table food_catalogue_reference_items
  add constraint food_catalogue_reference_priority_check
    check (verification_priority is null or verification_priority in ('P0','P1','P2')),
  add constraint food_catalogue_reference_processing_check
    check (processing_status in ('UNPROCESSED','TRIAGED_PENDING_EVIDENCE','VERIFIED','REJECTED')),
  add constraint food_catalogue_reference_operational_use_check
    check (operational_use_state is null or operational_use_state in ('DIRECT_ADDABLE','COMPONENT_ADDABLE','INGREDIENT_ONLY','SECONDARY_ONLY','PREPARATION_REQUIRED','REFERENCE_PENDING','BLOCKED_BY_GOVERNANCE'));

create index if not exists food_catalogue_reference_verification_queue_idx
  on food_catalogue_reference_items(verification_priority, processing_status, category, canonical_name);

commit;
