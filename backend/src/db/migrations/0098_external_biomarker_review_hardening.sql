-- External Consultant-only review hardening. Expand-only; no ZESTIVA_INTERNAL rows or contracts are changed.
alter table external_biomarker_observations
  add column if not exists corrected_canonical_biomarker_id text,
  add column if not exists corrected_canonical_code text,
  add column if not exists corrected_canonical_name text;

create index if not exists external_biomarker_corrected_history_idx
  on external_biomarker_observations(
    tenant_id,
    client_id,
    coalesce(corrected_canonical_biomarker_id, canonical_biomarker_id),
    coalesce(corrected_observation_date, observation_date) desc,
    created_at desc
  );

comment on column external_biomarker_observations.corrected_canonical_biomarker_id is
  'Consultant-reviewed mapping layer; immutable raw extraction remains unchanged.';
