begin;

alter table health_profiles
  add column if not exists arm_circumference_cm numeric(6,2),
  add column if not exists thigh_circumference_cm numeric(6,2),
  add column if not exists calf_circumference_cm numeric(6,2),
  add column if not exists wellness_goal_ids jsonb not null default '[]'::jsonb;

alter table health_profiles
  drop constraint if exists health_profiles_arm_circumference_range,
  add constraint health_profiles_arm_circumference_range check (arm_circumference_cm is null or arm_circumference_cm between 10 and 100),
  drop constraint if exists health_profiles_thigh_circumference_range,
  add constraint health_profiles_thigh_circumference_range check (thigh_circumference_cm is null or thigh_circumference_cm between 20 and 150),
  drop constraint if exists health_profiles_calf_circumference_range,
  add constraint health_profiles_calf_circumference_range check (calf_circumference_cm is null or calf_circumference_cm between 10 and 100);

commit;
