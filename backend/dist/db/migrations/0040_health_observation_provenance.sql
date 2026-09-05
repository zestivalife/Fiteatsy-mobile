alter table health_observations
  add column if not exists source_metadata jsonb;
