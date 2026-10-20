begin;

alter table external_diet_plans
  drop constraint if exists external_diet_plans_tenant_id_client_id_key;

alter table external_diet_plans
  add column if not exists name varchar(120);

update external_diet_plans
set name = 'Diet Plan'
where name is null or btrim(name) = '';

alter table external_diet_plans
  alter column name set not null;

alter table external_diet_plans
  add column if not exists revision_of_plan_id uuid references external_diet_plans(id) on delete restrict;

create index if not exists external_diet_plan_client_updated
  on external_diet_plans(tenant_id, client_id, updated_at desc);

create index if not exists external_diet_plan_revision_lineage
  on external_diet_plans(revision_of_plan_id)
  where revision_of_plan_id is not null;

commit;
