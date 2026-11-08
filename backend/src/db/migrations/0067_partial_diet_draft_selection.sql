alter table diet_plan_versions
  add column if not exists common_food_selection_initialized boolean not null default false;

update diet_plan_versions version
set common_food_selection_initialized = true
where exists (
  select 1
  from diet_plan_option_selections selection
  where selection.diet_plan_version_id = version.id
);

comment on column diet_plan_versions.common_food_selection_initialized is
  'True after an explicit consultant save, including an intentionally empty 0-option draft selection.';
