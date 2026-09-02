create table if not exists food_knowledge_releases (
  release_version text primary key,
  predecessor_version text references food_knowledge_releases(release_version),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'candidate' check (status in ('candidate', 'validated', 'active', 'superseded', 'archived')),
  record_counts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  imported_at timestamptz
);

create unique index if not exists food_knowledge_releases_hash_unique
  on food_knowledge_releases (manifest_sha256);

create table if not exists food_knowledge_families (
  id uuid primary key,
  family_code text not null unique,
  display_name text not null,
  parent_id uuid references food_knowledge_families(id),
  family_kind text not null check (family_kind in ('food', 'preparation', 'staple', 'protein', 'produce')),
  status text not null default 'active' check (status in ('active', 'inactive', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);

create index if not exists food_knowledge_families_parent_idx on food_knowledge_families(parent_id);

create table if not exists food_knowledge_food_profiles (
  food_id uuid primary key references nutrition_foods(id),
  canonical_code text not null unique,
  family_id uuid references food_knowledge_families(id),
  food_type text not null check (food_type in (
    'INGREDIENT_ONLY', 'PREPARED_FOOD', 'STAPLE', 'INDIAN_BREAD', 'RICE_GRAIN',
    'DAL_PULSE', 'PROTEIN', 'SABJI', 'SALAD', 'DAIRY', 'FRUIT', 'NUT_SEED',
    'BREAKFAST', 'SNACK', 'DRINK', 'ACCOMPANIMENT', 'COMPLETE_MEAL'
  )),
  client_consumable boolean not null,
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active', 'inactive', 'retired', 'superseded')),
  superseded_by_food_id uuid references nutrition_foods(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (superseded_by_food_id is null or superseded_by_food_id <> food_id),
  check (food_type <> 'INGREDIENT_ONLY' or client_consumable = false)
);

create index if not exists food_knowledge_profiles_family_idx on food_knowledge_food_profiles(family_id, lifecycle_status);
create index if not exists food_knowledge_profiles_eligible_idx on food_knowledge_food_profiles(food_type, food_id) where client_consumable and lifecycle_status = 'active';

create table if not exists food_knowledge_versions (
  id uuid primary key,
  food_id uuid not null references food_knowledge_food_profiles(food_id),
  version_number integer not null check (version_number > 0),
  release_version text not null references food_knowledge_releases(release_version),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  verification_status text not null check (verification_status in ('draft', 'reviewed', 'verified', 'rejected')),
  nutrition_status text not null check (nutrition_status in ('COMPLETE', 'PARTIAL', 'UNKNOWN')),
  production_eligible boolean not null default false,
  valid_from timestamptz not null default now(),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  unique (food_id, version_number),
  unique (food_id, content_sha256),
  check (retired_at is null or retired_at >= valid_from)
);

create index if not exists food_knowledge_versions_current_idx on food_knowledge_versions(food_id, version_number desc) where retired_at is null;
create index if not exists food_knowledge_versions_release_idx on food_knowledge_versions(release_version, production_eligible);

create table if not exists food_knowledge_aliases (
  id uuid primary key,
  food_id uuid not null references food_knowledge_food_profiles(food_id),
  alias text not null,
  locale text not null default 'en-IN',
  created_at timestamptz not null default now()
);
create unique index if not exists food_knowledge_alias_unique on food_knowledge_aliases(lower(alias), locale);

create table if not exists food_knowledge_nutrients (
  id uuid primary key,
  nutrient_code text not null unique,
  display_name text not null,
  canonical_unit text not null,
  category text not null check (category in ('energy', 'macro', 'fibre', 'mineral', 'vitamin', 'other')),
  display_order integer not null default 0,
  status text not null default 'active' check (status in ('active', 'inactive'))
);

create table if not exists food_knowledge_sources (
  id uuid primary key,
  source_code text not null unique,
  source_name text not null,
  source_version text not null,
  source_url text,
  licence_code text not null,
  licence_status text not null check (licence_status in ('APPROVED', 'ATTRIBUTION_REQUIRED', 'SHARE_ALIKE_REVIEW', 'REFERENCE_ONLY', 'UNKNOWN_BLOCKED')),
  attribution_text text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  unique (source_name, source_version)
);

create table if not exists food_knowledge_calculation_methods (
  id uuid primary key,
  method_code text not null unique,
  method_version text not null,
  description text not null,
  formula_sha256 text not null check (formula_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'active' check (status in ('active', 'inactive')),
  unique (method_code, method_version)
);

create table if not exists food_knowledge_version_sources (
  id uuid primary key,
  food_version_id uuid not null references food_knowledge_versions(id),
  source_id uuid not null references food_knowledge_sources(id),
  source_record_id text,
  selected_for_canonical boolean not null default false,
  created_at timestamptz not null default now(),
  unique (food_version_id, source_id, source_record_id)
);

create table if not exists food_knowledge_food_nutrients (
  id uuid primary key,
  food_version_id uuid not null references food_knowledge_versions(id),
  nutrient_id uuid not null references food_knowledge_nutrients(id),
  amount numeric not null check (amount >= 0),
  basis text not null check (basis in ('PER_100_G', 'PER_100_ML')),
  source_id uuid references food_knowledge_sources(id),
  calculation_method_id uuid references food_knowledge_calculation_methods(id),
  verification_status text not null check (verification_status in ('reviewed', 'verified')),
  created_at timestamptz not null default now(),
  unique (food_version_id, nutrient_id, basis),
  check ((source_id is not null)::int + (calculation_method_id is not null)::int = 1)
);
create index if not exists food_knowledge_nutrients_version_idx on food_knowledge_food_nutrients(food_version_id, nutrient_id);

create table if not exists food_knowledge_servings (
  id uuid primary key,
  food_version_id uuid not null references food_knowledge_versions(id),
  serving_code text not null,
  serving_name text not null,
  grams numeric not null check (grams > 0),
  is_canonical boolean not null default false,
  is_client_friendly boolean not null default true,
  minimum_quantity numeric check (minimum_quantity is null or minimum_quantity > 0),
  maximum_quantity numeric check (maximum_quantity is null or maximum_quantity > 0),
  increment_quantity numeric check (increment_quantity is null or increment_quantity > 0),
  display_order integer not null default 0,
  unique (food_version_id, serving_code),
  check (maximum_quantity is null or minimum_quantity is null or maximum_quantity >= minimum_quantity)
);
create unique index if not exists food_knowledge_one_canonical_serving on food_knowledge_servings(food_version_id) where is_canonical;

create table if not exists food_knowledge_components (
  id uuid primary key,
  food_version_id uuid not null references food_knowledge_versions(id),
  component_food_id uuid not null references food_knowledge_food_profiles(food_id),
  component_role text not null check (component_role in ('PRIMARY', 'SECONDARY', 'COOKING_COMPONENT', 'SEASONING', 'ACCOMPANIMENT_COMPONENT')),
  quantity_grams numeric check (quantity_grams is null or quantity_grams > 0),
  sort_order integer not null default 0,
  unique (food_version_id, component_food_id, component_role)
);

create or replace function reject_food_knowledge_self_component() returns trigger language plpgsql as $$
begin
  if exists (select 1 from food_knowledge_versions where id = new.food_version_id and food_id = new.component_food_id) then
    raise exception 'FOOD_KNOWLEDGE_SELF_COMPONENT';
  end if;
  return new;
end;
$$;

drop trigger if exists food_knowledge_components_no_self on food_knowledge_components;
create trigger food_knowledge_components_no_self before insert or update on food_knowledge_components
for each row execute function reject_food_knowledge_self_component();

create table if not exists food_knowledge_cuisines (
  id uuid primary key,
  cuisine_code text not null unique,
  display_name text not null,
  parent_id uuid references food_knowledge_cuisines(id),
  status text not null default 'active' check (status in ('active', 'inactive')),
  check (parent_id is null or parent_id <> id)
);
create index if not exists food_knowledge_cuisines_parent_idx on food_knowledge_cuisines(parent_id);

create table if not exists food_knowledge_version_cuisines (
  food_version_id uuid not null references food_knowledge_versions(id),
  cuisine_id uuid not null references food_knowledge_cuisines(id),
  is_primary boolean not null default false,
  primary key (food_version_id, cuisine_id)
);
create index if not exists food_knowledge_version_cuisines_cuisine_idx on food_knowledge_version_cuisines(cuisine_id, food_version_id);

create table if not exists food_knowledge_compatibilities (
  id uuid primary key,
  food_version_id uuid not null references food_knowledge_versions(id),
  dimension text not null check (dimension in ('DIET_PATTERN', 'PREPARATION_PROFILE')),
  compatibility_code text not null,
  compatibility_status text not null check (compatibility_status in ('COMPATIBLE', 'INCOMPATIBLE', 'UNKNOWN')),
  rationale text,
  unique (food_version_id, dimension, compatibility_code)
);
create index if not exists food_knowledge_compatibility_lookup_idx on food_knowledge_compatibilities(dimension, compatibility_code, compatibility_status, food_version_id);

create table if not exists food_knowledge_allergens (
  id uuid primary key,
  allergen_code text not null unique,
  display_name text not null,
  status text not null default 'active' check (status in ('active', 'inactive'))
);

create table if not exists food_knowledge_version_allergens (
  food_version_id uuid not null references food_knowledge_versions(id),
  allergen_id uuid not null references food_knowledge_allergens(id),
  presence_status text not null check (presence_status in ('PRESENT', 'ABSENT_VERIFIED', 'UNKNOWN')),
  source_id uuid references food_knowledge_sources(id),
  primary key (food_version_id, allergen_id)
);
create index if not exists food_knowledge_allergen_lookup_idx on food_knowledge_version_allergens(allergen_id, presence_status, food_version_id);

create table if not exists food_knowledge_meal_suitability (
  food_version_id uuid not null references food_knowledge_versions(id),
  meal_key text not null check (meal_key in ('earlyMorning', 'breakfast', 'midMorningSnack', 'lunch', 'eveningSnack', 'dinner', 'bedtimeNutrition')),
  suitability text not null check (suitability in ('PRIMARY', 'COMPONENT', 'OPTIONAL', 'UNSUITABLE')),
  primary key (food_version_id, meal_key)
);
create index if not exists food_knowledge_meal_suitability_lookup_idx on food_knowledge_meal_suitability(meal_key, suitability, food_version_id);

create table if not exists food_knowledge_context_tags (
  id uuid primary key,
  context_code text not null unique,
  display_name text not null,
  category text not null check (category in ('SENSORY', 'PRACTICALITY', 'EATING_OUT', 'MEAL_CONTEXT', 'COOKING_METHOD')),
  parent_id uuid references food_knowledge_context_tags(id),
  status text not null default 'active' check (status in ('active', 'inactive')),
  check (parent_id is null or parent_id <> id)
);

create table if not exists food_knowledge_version_context_tags (
  food_version_id uuid not null references food_knowledge_versions(id),
  context_tag_id uuid not null references food_knowledge_context_tags(id),
  primary key (food_version_id, context_tag_id)
);
create index if not exists food_knowledge_context_lookup_idx on food_knowledge_version_context_tags(context_tag_id, food_version_id);

create table if not exists food_knowledge_release_memberships (
  release_version text not null references food_knowledge_releases(release_version),
  food_version_id uuid not null references food_knowledge_versions(id),
  primary key (release_version, food_version_id)
);

create or replace function protect_food_knowledge_imported_release() returns trigger language plpgsql as $$
begin
  if old.imported_at is not null then raise exception 'FOOD_KNOWLEDGE_RELEASE_IMMUTABLE'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists food_knowledge_release_immutable on food_knowledge_releases;
create trigger food_knowledge_release_immutable before update or delete on food_knowledge_releases
for each row execute function protect_food_knowledge_imported_release();

create or replace function protect_food_knowledge_imported_version() returns trigger language plpgsql as $$
declare release_imported_at timestamptz;
begin
  select r.imported_at into release_imported_at from food_knowledge_releases r
   join food_knowledge_versions v on v.release_version=r.release_version
   where v.id=case when tg_op='DELETE' then old.food_version_id else new.food_version_id end;
  if release_imported_at is not null then raise exception 'FOOD_KNOWLEDGE_VERSION_FACT_IMMUTABLE'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function protect_food_knowledge_version_row() returns trigger language plpgsql as $$
declare release_imported_at timestamptz;
begin
  select imported_at into release_imported_at from food_knowledge_releases where release_version=old.release_version;
  if release_imported_at is not null then raise exception 'FOOD_KNOWLEDGE_VERSION_IMMUTABLE'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists food_knowledge_version_immutable on food_knowledge_versions;
create trigger food_knowledge_version_immutable before update or delete on food_knowledge_versions
for each row execute function protect_food_knowledge_version_row();

create or replace function protect_food_knowledge_release_membership() returns trigger language plpgsql as $$
declare release_imported_at timestamptz;
begin
  select imported_at into release_imported_at from food_knowledge_releases where release_version=case when tg_op='DELETE' then old.release_version else new.release_version end;
  if release_imported_at is not null then raise exception 'FOOD_KNOWLEDGE_RELEASE_MEMBERSHIP_IMMUTABLE'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
drop trigger if exists food_knowledge_membership_immutable on food_knowledge_release_memberships;
create trigger food_knowledge_membership_immutable before insert or update or delete on food_knowledge_release_memberships
for each row execute function protect_food_knowledge_release_membership();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'food_knowledge_version_sources', 'food_knowledge_food_nutrients', 'food_knowledge_servings',
    'food_knowledge_components', 'food_knowledge_version_cuisines', 'food_knowledge_compatibilities',
    'food_knowledge_version_allergens', 'food_knowledge_meal_suitability', 'food_knowledge_version_context_tags'
  ] loop
    execute format('drop trigger if exists food_knowledge_fact_immutable on %I', table_name);
    execute format('create trigger food_knowledge_fact_immutable before insert or update or delete on %I for each row execute function protect_food_knowledge_imported_version()', table_name);
  end loop;
end;
$$;

create or replace view food_knowledge_generation_projection as
select
  f.id as food_id,
  p.canonical_code,
  f.display_name,
  p.family_id,
  fam.family_code,
  p.food_type,
  p.client_consumable,
  v.id as food_version_id,
  v.version_number,
  v.release_version,
  v.production_eligible,
  v.nutrition_status,
  coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'code', s.serving_code, 'name', s.serving_name, 'grams', s.grams, 'canonical', s.is_canonical) order by s.display_order, s.id) from food_knowledge_servings s where s.food_version_id = v.id), '[]'::jsonb) as servings,
  coalesce((select jsonb_object_agg(n.nutrient_code, fn.amount) from food_knowledge_food_nutrients fn join food_knowledge_nutrients n on n.id = fn.nutrient_id where fn.food_version_id = v.id and fn.basis = 'PER_100_G'), '{}'::jsonb) as nutrients_per_100g,
  coalesce((select jsonb_agg(c.cuisine_code order by c.cuisine_code) from food_knowledge_version_cuisines vc join food_knowledge_cuisines c on c.id = vc.cuisine_id where vc.food_version_id = v.id), '[]'::jsonb) as cuisines,
  coalesce((select jsonb_agg(jsonb_build_object('dimension', c.dimension, 'code', c.compatibility_code, 'status', c.compatibility_status) order by c.dimension, c.compatibility_code) from food_knowledge_compatibilities c where c.food_version_id = v.id), '[]'::jsonb) as compatibilities,
  coalesce((select jsonb_agg(jsonb_build_object('code', a.allergen_code, 'status', va.presence_status) order by a.allergen_code) from food_knowledge_version_allergens va join food_knowledge_allergens a on a.id = va.allergen_id where va.food_version_id = v.id), '[]'::jsonb) as allergens,
  coalesce((select jsonb_agg(jsonb_build_object('foodId', c.component_food_id, 'role', c.component_role, 'grams', c.quantity_grams) order by c.sort_order, c.id) from food_knowledge_components c where c.food_version_id = v.id), '[]'::jsonb) as components,
  coalesce((select jsonb_agg(jsonb_build_object('mealKey', ms.meal_key, 'suitability', ms.suitability) order by ms.meal_key) from food_knowledge_meal_suitability ms where ms.food_version_id = v.id), '[]'::jsonb) as meal_suitability,
  coalesce((select jsonb_agg(jsonb_build_object('code', t.context_code, 'category', t.category) order by t.category, t.context_code) from food_knowledge_version_context_tags vt join food_knowledge_context_tags t on t.id = vt.context_tag_id where vt.food_version_id = v.id), '[]'::jsonb) as context_tags
from nutrition_foods f
join food_knowledge_food_profiles p on p.food_id = f.id
join food_knowledge_versions v on v.food_id = f.id
left join food_knowledge_families fam on fam.id = p.family_id
where f.deleted_at is null and p.lifecycle_status = 'active' and v.retired_at is null;
