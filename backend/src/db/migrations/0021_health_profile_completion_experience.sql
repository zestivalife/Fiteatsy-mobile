alter table health_profiles
  add column if not exists sleep_quality_label text,
  add column if not exists cholesterol_status text,
  add column if not exists heart_condition_status text,
  add column if not exists previous_surgeries jsonb not null default '[]'::jsonb;
