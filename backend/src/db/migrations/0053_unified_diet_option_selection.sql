begin;

create table if not exists diet_plan_option_selections (
  diet_plan_id uuid not null references diet_plans(id) on delete cascade,
  diet_plan_version_id uuid not null references diet_plan_versions(id) on delete cascade,
  logical_option_id text not null,
  option_snapshot_id text not null references diet_plan_combination_options(id) on delete restrict,
  meal_head text not null check (meal_head in ('EARLY_MORNING','BREAKFAST','MID_MORNING','LUNCH','EVENING_SNACK','DINNER','BEDTIME')),
  display_order integer not null check (display_order between 1 and 5),
  selected_at timestamptz not null default now(),
  primary key (diet_plan_version_id, logical_option_id),
  unique (diet_plan_version_id, option_snapshot_id),
  unique (diet_plan_version_id, meal_head, display_order)
);

create index if not exists diet_plan_option_selections_plan_idx
  on diet_plan_option_selections (diet_plan_id, diet_plan_version_id, meal_head, display_order);

-- Existing draft candidates remain immutable. Only a deterministic maximum of
-- five per meal is projected into the new authoritative selection mapping.
with latest as (
  select distinct on (diet_plan_version_id, logical_option_id)
    diet_plan_id,diet_plan_version_id,logical_option_id,meal_head,created_at,version,id
  from diet_plan_combination_options
  order by diet_plan_version_id,logical_option_id,version desc,created_at desc,id desc
), ranked as (
  select *,row_number() over(
    partition by diet_plan_version_id,meal_head
    order by created_at desc,version desc,id desc
  ) as display_order
  from latest
)
insert into diet_plan_option_selections
  (diet_plan_id,diet_plan_version_id,logical_option_id,option_snapshot_id,meal_head,display_order)
select diet_plan_id,diet_plan_version_id,logical_option_id,id,meal_head,display_order
from ranked where display_order<=5
on conflict do nothing;

commit;
