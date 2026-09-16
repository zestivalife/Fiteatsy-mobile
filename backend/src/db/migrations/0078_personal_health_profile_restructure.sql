begin;
alter table health_profiles
  add column if not exists location text,
  add column if not exists body_fat_source text,
  add column if not exists body_fat_measured_at timestamptz,
  add column if not exists body_fat_updated_at timestamptz,
  add column if not exists muscle_mass_kg numeric(6,2),
  add column if not exists muscle_mass_category text;
alter table health_profiles
  add constraint health_profiles_body_fat_source_valid check (body_fat_source is null or body_fat_source in ('MANUAL','CALCULATED','APPLE_HEALTH','HEALTH_CONNECT','SMART_SCALE','CONSULTANT','OTHER')),
  add constraint health_profiles_muscle_mass_range check (muscle_mass_kg is null or muscle_mass_kg between 1 and 250);
create table health_profile_measurement_history (
  id uuid primary key,
  health_profile_id uuid not null references health_profiles(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  measurement_type text not null check (measurement_type in ('WEIGHT','BODY_FAT','WAIST','HIP','NECK','MID_UPPER_ARM','THIGH','CALF','MUSCLE_MASS')),
  value numeric(10,3) not null check (value > 0),
  unit text not null,
  source text not null,
  measured_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index health_profile_measurement_history_profile_idx on health_profile_measurement_history (health_profile_id, measurement_type, measured_at desc);
commit;
