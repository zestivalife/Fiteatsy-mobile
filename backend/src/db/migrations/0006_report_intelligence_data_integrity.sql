alter table biomarker_observations
  add column if not exists original_parameter_name text;
