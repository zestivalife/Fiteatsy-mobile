begin;
alter table canonical_ingredient_source_mappings
  add column if not exists source_jurisdiction text,
  add column if not exists country_context text,
  add column if not exists is_indian_specific_food boolean not null default false,
  add column if not exists source_policy_class text,
  add column if not exists sample_country text,
  add column if not exists lab_country text;
alter table canonical_ingredient_source_mappings drop constraint if exists canonical_source_policy_class_check;
alter table canonical_ingredient_source_mappings add constraint canonical_source_policy_class_check check (source_policy_class is null or source_policy_class in
  ('INDIA_AUTHORITATIVE','INDIA_LOCAL_LAB','GLOBAL_GENERIC_APPROVED','FOREIGN_NATIONAL_DISALLOWED_FOR_INDIAN_FOOD'));
create or replace function guard_india_food_source_policy() returns trigger language plpgsql as $$
begin
  if new.is_indian_specific_food and (new.country_context is distinct from 'INDIA' or new.source_policy_class not in ('INDIA_AUTHORITATIVE','INDIA_LOCAL_LAB')) then
    raise exception 'FOREIGN_NATIONAL_SOURCE_REJECTED_FOR_INDIAN_CANONICAL_FOOD';
  end if;
  if new.source_policy_class='INDIA_LOCAL_LAB' and (new.sample_country is distinct from 'INDIA' or new.lab_country is distinct from 'INDIA') then
    raise exception 'INDIA_LOCAL_LAB_COUNTRY_REQUIREMENT_FAILED';
  end if;
  return new;
end $$;
drop trigger if exists guard_india_food_source_policy on canonical_ingredient_source_mappings;
create trigger guard_india_food_source_policy before insert on canonical_ingredient_source_mappings for each row execute function guard_india_food_source_policy();

create table if not exists controlled_food_lab_samples (
  id text primary key, ingredient_id text not null references canonical_ingredients(id), sample_code text not null unique,
  sample_country text not null check(sample_country='INDIA'), identity_snapshot jsonb not null, identity_sha256 text not null unique,
  evidence jsonb not null, reuse_scope text not null default 'BATCH_1_RECIPE_REFERENCE', created_at timestamptz not null default now()
);
create table if not exists controlled_food_lab_chain_events (
  id text primary key, sample_id text not null references controlled_food_lab_samples(id), event_type text not null,
  occurred_at timestamptz not null, actor_id text not null, actor_role text not null, location text not null,
  evidence jsonb not null, evidence_sha256 text not null unique, created_at timestamptz not null default now()
);
create table if not exists controlled_food_lab_reports (
  id text primary key, sample_id text not null references controlled_food_lab_samples(id), lab_id text not null,
  lab_country text not null check(lab_country='INDIA'), nabl_accreditation_number text not null, accreditation_evidence jsonb not null,
  report_number text not null, report_date date not null, authorised_signatory text not null, methods jsonb not null,
  results jsonb not null, reporting_basis text not null, report_file_sha256 text not null, report_sha256 text not null unique,
  reviewer_decision text not null check(reviewer_decision in ('PENDING','APPROVED','REJECTED')), created_at timestamptz not null default now()
);
drop trigger if exists controlled_lab_sample_append_only on controlled_food_lab_samples;
create trigger controlled_lab_sample_append_only before update or delete on controlled_food_lab_samples for each row execute function reject_canonical_foundation_mutation();
drop trigger if exists controlled_lab_event_append_only on controlled_food_lab_chain_events;
create trigger controlled_lab_event_append_only before update or delete on controlled_food_lab_chain_events for each row execute function reject_canonical_foundation_mutation();
drop trigger if exists controlled_lab_report_append_only on controlled_food_lab_reports;
create trigger controlled_lab_report_append_only before update or delete on controlled_food_lab_reports for each row execute function reject_canonical_foundation_mutation();
commit;
