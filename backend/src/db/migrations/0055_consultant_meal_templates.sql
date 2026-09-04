begin;

create table if not exists consultant_teams (
  id text primary key,
  name text not null,
  created_by text not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create table if not exists consultant_team_members (
  team_id text not null references consultant_teams(id) on delete restrict,
  consultant_id text not null references users(id) on delete restrict,
  role text not null default 'MEMBER' check(role in ('OWNER','MEMBER')),
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key(team_id,consultant_id)
);

create table if not exists consultant_meal_templates (
  id uuid primary key,
  stable_template_id text not null unique,
  owner_consultant_id text not null references users(id) on delete restrict,
  team_id text references consultant_teams(id) on delete restrict,
  visibility text not null check (visibility in ('PRIVATE','TEAM')),
  current_revision_id uuid,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists consultant_meal_template_revisions (
  id uuid primary key,
  template_id uuid not null references consultant_meal_templates(id) on delete restrict,
  revision_number integer not null check (revision_number > 0),
  status text not null check (status in ('DRAFT','ACTIVE','ARCHIVED')),
  name text not null,
  description text,
  meal_head text not null check (meal_head in ('EARLY_MORNING','BREAKFAST','MID_MORNING','LUNCH','EVENING_SNACK','DINNER','BEDTIME')),
  meal_structure jsonb not null,
  components jsonb not null,
  structure_sha256 text not null,
  source_provenance_references jsonb not null default '[]'::jsonb,
  created_by text not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  archived_at timestamptz,
  unique(template_id, revision_number)
);

alter table consultant_meal_templates
  add constraint consultant_meal_templates_current_revision_fk
  foreign key (current_revision_id) references consultant_meal_template_revisions(id) on delete restrict;

create unique index if not exists consultant_meal_template_one_draft_idx
  on consultant_meal_template_revisions(template_id) where status = 'DRAFT';
create unique index if not exists consultant_meal_template_one_active_idx
  on consultant_meal_template_revisions(template_id) where status = 'ACTIVE';
create index if not exists consultant_meal_template_search_idx
  on consultant_meal_template_revisions using gin (to_tsvector('simple', name || ' ' || coalesce(description,'')));
create index if not exists consultant_meal_template_owner_idx
  on consultant_meal_templates(owner_consultant_id, visibility, created_at desc);

create table if not exists consultant_meal_template_audit (
  id uuid primary key,
  template_id uuid not null references consultant_meal_templates(id) on delete restrict,
  revision_id uuid references consultant_meal_template_revisions(id) on delete restrict,
  event_type text not null check (event_type in ('TEMPLATE_CREATED','TEMPLATE_ACTIVATED','TEMPLATE_REVISION_CREATED','TEMPLATE_CLONED','TEMPLATE_ARCHIVED','TEMPLATE_APPLIED','TEMPLATE_APPLICATION_REJECTED')),
  actor_id text not null references users(id) on delete restrict,
  client_id text references fiteatsy_clients(id) on delete restrict,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Batch 0 is searchable reference data. Existing stronger records retain their
-- current activation and eligibility semantics through the explicit backfill.
alter table common_foods drop constraint if exists common_foods_source_policy_class_check;
alter table common_foods add constraint common_foods_source_policy_class_check
  check(source_policy_class in ('INDIA_AUTHORITATIVE','INDIA_LOCAL_LAB','GLOBAL_GENERIC_APPROVED','REFERENCE_ONLY'));
alter table common_foods
  add column if not exists subcategory text,
  add column if not exists common_names jsonb not null default '[]'::jsonb,
  add column if not exists reference_state text,
  add column if not exists prepared_component_eligible boolean not null default false,
  add column if not exists production_active boolean not null default false,
  add column if not exists catalogue_status text,
  add column if not exists nutrition_status text,
  add column if not exists verification_status text,
  add column if not exists source_batch_id text,
  add column if not exists source_row_number integer,
  add column if not exists source_record_sha256 text;

update common_foods set
  catalogue_status = case
    when generator_eligible then 'GENERATOR_ELIGIBLE'
    when active then 'NUTRITION_VERIFIED'
    else 'CATALOGUED_REFERENCE'
  end,
  nutrition_status = case when active then 'VERIFIED' else 'PENDING' end,
  verification_status = case when active then 'VERIFIED' else 'PENDING' end
where catalogue_status is null or nutrition_status is null or verification_status is null;

alter table common_foods
  alter column catalogue_status set not null,
  alter column catalogue_status set default 'CATALOGUED_REFERENCE',
  add constraint common_foods_catalogue_status_check check(catalogue_status in ('CATALOGUED_REFERENCE','SOURCE_IDENTIFIED','NUTRITION_PENDING','NUTRITION_VERIFIED','GENERATOR_ELIGIBLE','PREPARED_COMPONENT_ELIGIBLE','PRODUCTION_ACTIVE')),
  alter column nutrition_status set not null,
  alter column nutrition_status set default 'PENDING',
  add constraint common_foods_nutrition_status_check check(nutrition_status in ('PENDING','REFERENCE_ONLY','VERIFIED')),
  alter column verification_status set not null,
  alter column verification_status set default 'PENDING';

create index if not exists common_foods_catalogue_search_idx
  on common_foods using gin(to_tsvector('simple', canonical_name || ' ' || display_name || ' ' || common_names::text));
create index if not exists common_foods_catalogue_filters_idx
  on common_foods(food_category, reference_state, catalogue_status, active);
create unique index if not exists common_foods_source_row_unique_idx
  on common_foods(source_batch_id, source_row_number) where source_batch_id is not null;

create table if not exists food_catalogue_import_runs (
  id uuid primary key,
  batch_id text not null,
  source_filename text not null,
  source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
  dry_run boolean not null,
  source_rows integer not null check(source_rows >= 0),
  inserted_rows integer not null check(inserted_rows >= 0),
  unchanged_rows integer not null check(unchanged_rows >= 0),
  protected_rows integer not null check(protected_rows >= 0),
  conflict_rows integer not null check(conflict_rows >= 0),
  invalid_rows integer not null check(invalid_rows >= 0),
  report jsonb not null,
  actor text not null,
  created_at timestamptz not null default now()
);
create index if not exists food_catalogue_import_runs_batch_idx
  on food_catalogue_import_runs(batch_id, created_at desc);

commit;
