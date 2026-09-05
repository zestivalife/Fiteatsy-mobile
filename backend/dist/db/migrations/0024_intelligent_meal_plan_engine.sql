create table if not exists nutrition_foods (
  id uuid primary key,
  canonical_name text not null,
  display_name text not null,
  aliases jsonb not null default '[]'::jsonb,
  food_category text,
  food_group text,
  dietary_classification text,
  preparation_state text,
  reference_quantity numeric not null default 100,
  reference_unit text not null default 'g',
  calories numeric,
  protein_grams numeric,
  carbohydrate_grams numeric,
  fat_grams numeric,
  fibre_grams numeric,
  micronutrients jsonb not null default '{}'::jsonb,
  cuisine_tags text[] not null default '{}',
  allergen_tags text[] not null default '{}',
  dietary_tags text[] not null default '{}',
  source_metadata jsonb not null default '{}'::jsonb,
  verification_status text not null default 'draft',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (verification_status in ('draft', 'seed', 'verified')),
  check (status in ('active', 'inactive', 'archived'))
);

create unique index if not exists nutrition_foods_canonical_name_active_unique
  on nutrition_foods (lower(canonical_name))
  where deleted_at is null;

create table if not exists nutrition_food_portions (
  id uuid primary key,
  food_id uuid not null references nutrition_foods(id),
  portion_label text not null,
  quantity numeric not null,
  quantity_unit text not null,
  canonical_grams numeric,
  canonical_milliliters numeric,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (status in ('active', 'inactive', 'archived'))
);

create unique index if not exists nutrition_food_portions_food_label_unique
  on nutrition_food_portions (food_id, lower(portion_label))
  where deleted_at is null;

create table if not exists nutrition_exchange_groups (
  id uuid primary key,
  group_code text not null,
  group_name text not null,
  description text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (status in ('active', 'inactive', 'archived'))
);

create unique index if not exists nutrition_exchange_groups_code_unique
  on nutrition_exchange_groups (lower(group_code))
  where deleted_at is null;

create table if not exists nutrition_exchange_group_foods (
  id uuid primary key,
  exchange_group_id uuid not null references nutrition_exchange_groups(id),
  food_id uuid not null references nutrition_foods(id),
  equivalence_factor numeric,
  notes text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (status in ('active', 'inactive', 'archived'))
);

create unique index if not exists nutrition_exchange_group_foods_unique
  on nutrition_exchange_group_foods (exchange_group_id, food_id)
  where deleted_at is null;

create table if not exists nutrition_meal_templates (
  id uuid primary key,
  template_code text not null,
  meal_key text not null,
  template_name text not null,
  description text,
  dietary_tags text[] not null default '{}',
  cuisine_tags text[] not null default '{}',
  source_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_by text references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (status in ('active', 'inactive', 'archived'))
);

create unique index if not exists nutrition_meal_templates_code_unique
  on nutrition_meal_templates (lower(template_code))
  where deleted_at is null;

create table if not exists nutrition_meal_template_components (
  id uuid primary key,
  meal_template_id uuid not null references nutrition_meal_templates(id),
  component_key text not null,
  component_role text not null,
  exchange_group_id uuid references nutrition_exchange_groups(id),
  required boolean not null default true,
  quantity_min numeric,
  quantity_max numeric,
  preferred_unit text,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists nutrition_meal_variants (
  id uuid primary key,
  meal_template_id uuid references nutrition_meal_templates(id),
  consultant_id text references users(id),
  owner_scope text not null default 'system',
  meal_key text not null,
  variant_name text not null,
  description text,
  household_label text,
  cuisine_tags text[] not null default '{}',
  dietary_tags text[] not null default '{}',
  allergen_tags text[] not null default '{}',
  estimated_prep_minutes integer,
  nutrition_totals jsonb not null default '{}'::jsonb,
  source_metadata jsonb not null default '{}'::jsonb,
  verification_status text not null default 'draft',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (owner_scope in ('system', 'organisation', 'consultant')),
  check (verification_status in ('draft', 'seed', 'verified')),
  check (status in ('active', 'inactive', 'archived'))
);

create index if not exists nutrition_meal_variants_meal_scope_idx
  on nutrition_meal_variants (meal_key, owner_scope, updated_at desc)
  where deleted_at is null;

create table if not exists nutrition_meal_variant_components (
  id uuid primary key,
  meal_variant_id uuid not null references nutrition_meal_variants(id),
  food_id uuid references nutrition_foods(id),
  component_name text not null,
  quantity numeric,
  quantity_unit text not null default 'g',
  household_label text,
  canonical_grams numeric,
  locked boolean not null default false,
  nutrition_totals jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists consultant_meal_favourites (
  id uuid primary key,
  consultant_id text not null references users(id),
  meal_variant_id uuid not null references nutrition_meal_variants(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists consultant_meal_favourites_unique
  on consultant_meal_favourites (consultant_id, meal_variant_id)
  where deleted_at is null;
