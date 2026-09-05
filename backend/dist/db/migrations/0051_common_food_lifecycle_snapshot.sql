begin;
alter table diet_plan_versions add column if not exists common_food_options jsonb not null default '[]'::jsonb;
alter table diet_plan_versions add column if not exists common_food_snapshot_hash text;
create table if not exists common_food_admin_audit (
 id uuid primary key, actor_user_id uuid not null, food_id text not null, action text not null,
 before_snapshot jsonb, after_snapshot jsonb, reason text not null, created_at timestamptz not null default now()
);
create index if not exists common_food_admin_audit_food_idx on common_food_admin_audit(food_id,created_at desc);
commit;
