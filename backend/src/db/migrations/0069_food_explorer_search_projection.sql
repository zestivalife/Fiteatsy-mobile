begin;

create extension if not exists pg_trgm;

create table if not exists food_explorer_search_projection (
  projection_id text primary key,
  canonical_identity_key text not null unique,
  source_type text not null check (source_type in ('GOVERNED','REFERENCE','APPROVED_PROPOSAL')),
  source_record_id text not null,
  source_trace jsonb not null default '[]'::jsonb,
  canonical_name text not null,
  normalized_name text not null,
  aliases text[] not null default '{}',
  normalized_search_text text not null,
  category text not null,
  family text,
  food_state text,
  nutrition_status text not null,
  generator_eligibility text not null,
  entity_type text not null,
  operational_use_state text not null,
  roles text[] not null default '{}',
  meal_heads text[] not null default '{}',
  vegetarian_class text,
  active boolean not null,
  searchable boolean not null,
  manual_addable boolean not null,
  generator_eligible boolean not null,
  client_consumable boolean not null,
  pending_verification boolean not null,
  kcal_per_100g numeric,
  protein_per_100g numeric,
  stable_sort_key text not null,
  source_priority smallint not null,
  display_payload jsonb not null,
  projection_version text not null,
  projection_hash text not null check (projection_hash ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz not null default now()
);

create index if not exists food_explorer_projection_search_trgm_idx
  on food_explorer_search_projection using gin (normalized_search_text gin_trgm_ops)
  where active and searchable;
create index if not exists food_explorer_projection_page_idx
  on food_explorer_search_projection (stable_sort_key, projection_id)
  where active and searchable;
create index if not exists food_explorer_projection_category_idx
  on food_explorer_search_projection (category, stable_sort_key, projection_id)
  where active and searchable;
create index if not exists food_explorer_projection_status_idx
  on food_explorer_search_projection (nutrition_status, generator_eligibility, entity_type)
  where active and searchable;
create index if not exists food_explorer_projection_roles_idx
  on food_explorer_search_projection using gin (roles);
create index if not exists food_explorer_projection_meals_idx
  on food_explorer_search_projection using gin (meal_heads);

create table if not exists food_explorer_projection_releases (
  projection_version text primary key,
  projection_hash text not null check (projection_hash ~ '^[a-f0-9]{64}$'),
  row_count integer not null check (row_count >= 0),
  source_counts jsonb not null,
  activated_at timestamptz not null default now()
);

commit;
