begin;

alter table common_foods
  add column if not exists authorization_status text;

update common_foods
set authorization_status = case
  when active and client_consumable then 'AUTHORISED'
  else 'PENDING'
end
where authorization_status is null;

alter table common_foods
  alter column authorization_status set default 'PENDING',
  alter column authorization_status set not null,
  add constraint common_foods_authorization_status_check
    check (authorization_status in ('PENDING','AUTHORISED','NOT_AUTHORISED')),
  add constraint common_foods_category_required_check
    check (length(trim(food_category)) > 0);

create index if not exists common_foods_authorisation_list_idx
  on common_foods(authorization_status, food_category, canonical_name, id);

create table if not exists common_food_authorisation_audit (
  id uuid primary key,
  food_id text not null references common_foods(id) on delete restrict,
  previous_status text not null check (previous_status in ('PENDING','AUTHORISED','NOT_AUTHORISED')),
  new_status text not null check (new_status in ('PENDING','AUTHORISED','NOT_AUTHORISED')),
  actor_user_id text not null references users(id) on delete restrict,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists common_food_authorisation_audit_food_idx
  on common_food_authorisation_audit(food_id, created_at desc);

alter table food_explorer_search_projection
  add column if not exists authorization_status text not null default 'PENDING'
    check (authorization_status in ('PENDING','AUTHORISED','NOT_AUTHORISED'));

create index if not exists food_explorer_projection_authorisation_idx
  on food_explorer_search_projection(authorization_status, active, category, stable_sort_key);

commit;
