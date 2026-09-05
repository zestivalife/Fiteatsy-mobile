create table if not exists nutrition_catalogue_releases (
  catalogue_version text primary key,
  source_name text not null,
  source_license text not null,
  source_releases jsonb not null,
  manifest_sha256 text not null,
  record_counts jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('active', 'superseded', 'archived'))
);

create table if not exists nutrition_recipes (
  id uuid primary key,
  recipe_code text not null,
  catalogue_version text not null references nutrition_catalogue_releases(catalogue_version),
  display_name text not null,
  description text,
  yield_grams numeric not null,
  portions numeric not null,
  cuisine_tags text[] not null default '{}',
  dietary_tags text[] not null default '{}',
  allergen_tags text[] not null default '{}',
  retention_method text,
  nutrition_totals jsonb not null default '{}'::jsonb,
  source_metadata jsonb not null default '{}'::jsonb,
  verification_status text not null default 'verified',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (yield_grams > 0),
  check (portions > 0),
  check (verification_status in ('draft', 'seed', 'verified')),
  check (status in ('active', 'inactive', 'archived'))
);

create unique index if not exists nutrition_recipes_code_active_unique
  on nutrition_recipes (lower(recipe_code))
  where deleted_at is null;

create index if not exists nutrition_recipes_catalogue_idx
  on nutrition_recipes (catalogue_version, status)
  where deleted_at is null;

create table if not exists nutrition_recipe_components (
  id uuid primary key,
  recipe_id uuid not null references nutrition_recipes(id),
  food_id uuid not null references nutrition_foods(id),
  quantity_grams numeric not null,
  retention_factors jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (quantity_grams > 0)
);

create unique index if not exists nutrition_recipe_components_recipe_food_unique
  on nutrition_recipe_components (recipe_id, food_id)
  where deleted_at is null;
