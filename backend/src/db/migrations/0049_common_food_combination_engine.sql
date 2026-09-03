begin;
create table if not exists common_foods (
  id text primary key, canonical_code text not null, canonical_name text not null, display_name text not null,
  food_type text not null check(food_type in ('COMMON_FOOD','VALIDATED_RECIPE','GENERATED_COMPONENT')),
  food_family text not null, food_category text not null, food_subcategory text,
  country_context text not null, is_indian_specific_food boolean not null,
  source_policy_class text not null check(source_policy_class in ('INDIA_AUTHORITATIVE','INDIA_LOCAL_LAB','GLOBAL_GENERIC_APPROVED')),
  source_mapping_id text not null, source_version text not null, physical_state text not null,
  preparation_state text not null, processing_state text not null, vegetarian_classification text not null,
  dietary_tags jsonb not null default '[]', allergen_tags jsonb not null default '[]', intolerance_tags jsonb not null default '[]',
  clinical_tags jsonb not null default '[]', avoid_tags jsonb not null default '[]', nutrition_per_100g jsonb not null,
  active boolean not null default false, client_consumable boolean not null default false, generator_eligible boolean not null default false,
  version integer not null check(version>0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(canonical_code,version),
  check(not is_indian_specific_food or (country_context='INDIA' and source_policy_class in ('INDIA_AUTHORITATIVE','INDIA_LOCAL_LAB')))
);
create table if not exists common_food_aliases (id text primary key, food_id text not null references common_foods(id), alias text not null, normalized_alias text not null, version integer not null check(version>0), unique(food_id,normalized_alias,version));
create table if not exists household_unit_definitions (id text primary key, name text not null, reference_capacity_ml numeric, reference_mass_rule jsonb, version integer not null check(version>0), active boolean not null default true, unique(name,version));
create table if not exists common_food_servings (
  id text primary key, food_id text not null references common_foods(id), serving_version integer not null check(serving_version>0), display_name text not null,
  quantity numeric not null check(quantity>0), unit text not null, grams_equivalent numeric check(grams_equivalent>0), millilitres_equivalent numeric check(millilitres_equivalent>0),
  conversion_basis text not null, conversion_source text not null, preparation_state text not null, is_default boolean not null default false,
  min_multiplier numeric not null check(min_multiplier>0), max_multiplier numeric not null check(max_multiplier>=min_multiplier), allowed_multipliers jsonb not null,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(food_id,serving_version,display_name), check(grams_equivalent is not null or millilitres_equivalent is not null)
);
create table if not exists common_food_meal_eligibility (food_id text not null references common_foods(id), meal_head text not null check(meal_head in ('EARLY_MORNING','BREAKFAST','MID_MORNING','LUNCH','EVENING_SNACK','DINNER','BEDTIME')), eligible boolean not null, priority integer not null default 0, constraints jsonb not null default '{}', version integer not null check(version>0), primary key(food_id,meal_head,version));
create table if not exists common_food_component_roles (food_id text not null references common_foods(id), role text not null check(role in ('STARCH','GRAIN','BREAD','PULSE','PROTEIN','VEGETABLE','FRUIT','DAIRY','FAT','NUT_SEED','BEVERAGE','ACCOMPANIMENT')), version integer not null check(version>0), primary key(food_id,role,version));
create table if not exists common_meal_templates (id text not null, version integer not null check(version>0), meal_head text not null, alternatives jsonb not null, active boolean not null default true, created_at timestamptz not null default now(), primary key(id,version));
create table if not exists common_food_generation_runs (id text primary key, client_id uuid not null, consultant_id uuid not null, generator_version text not null, ranking_version text not null, template_version text not null, catalogue_snapshot_version text not null, input_context_sha256 text not null, candidate_count integer not null, eligible_count integer not null, rejected_count integer not null, top_options jsonb not null, shortages jsonb not null, duration_ms numeric not null, created_at timestamptz not null default now());
create table if not exists diet_plan_combination_options (id text primary key, diet_plan_id uuid not null, diet_plan_version_id uuid not null, meal_head text not null, source_type text not null check(source_type in ('GENERATED_COMBINATION','VALIDATED_RECIPE','MANUAL_COMBINATION')), generator_version text, ranking_version text, template_version text, catalogue_snapshot_version text not null, components_snapshot jsonb not null, nutrition_snapshot jsonb not null, diversity_signature text not null, warnings jsonb not null default '[]', option_sha256 text not null unique, version integer not null check(version>0), created_at timestamptz not null default now());
create index if not exists common_foods_active_generator_idx on common_foods(food_category,food_family) where active and generator_eligible;
create index if not exists common_foods_source_policy_idx on common_foods(source_policy_class,country_context);
create index if not exists common_food_aliases_search_idx on common_food_aliases using gin(to_tsvector('simple',normalized_alias));
create index if not exists common_food_meal_lookup_idx on common_food_meal_eligibility(meal_head,priority desc) where eligible;
create index if not exists common_food_role_lookup_idx on common_food_component_roles(role,food_id);
create index if not exists common_food_serving_lookup_idx on common_food_servings(food_id,is_default) where active;
create index if not exists diet_plan_combination_version_idx on diet_plan_combination_options(diet_plan_id,diet_plan_version_id,meal_head,version);
create index if not exists common_food_generation_client_idx on common_food_generation_runs(client_id,created_at desc);
commit;
