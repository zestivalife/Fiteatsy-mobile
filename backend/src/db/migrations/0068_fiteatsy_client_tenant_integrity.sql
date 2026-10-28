create table if not exists tenants (
  id uuid primary key,
  name text not null,
  slug text not null unique,
  tenant_type text not null,
  status text not null,
  billing_owner_user_id text,
  subscription_id text,
  default_timezone text not null default 'Asia/Kolkata',
  country text not null default 'IN',
  currency text not null default 'INR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into tenants (
  id, name, slug, tenant_type, status, default_timezone, country, currency
) values (
  '00000000-0000-4000-8000-000000000001',
  'Zestiva',
  'zestiva',
  'ZESTIVA_INTERNAL',
  'active',
  'Asia/Kolkata',
  'IN',
  'INR'
) on conflict (slug) do nothing;

create table if not exists tenant_memberships (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete restrict,
  user_id text not null references users(id) on delete restrict,
  tenant_role text not null,
  status text not null,
  joined_at timestamptz not null,
  invited_by text,
  removed_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (tenant_id, user_id)
);

create index if not exists tenant_memberships_user_active_idx
  on tenant_memberships (user_id, status, tenant_id);

alter table fiteatsy_clients add column if not exists tenant_id uuid;

insert into tenant_memberships (
  id, tenant_id, user_id, tenant_role, status, joined_at, created_at, updated_at
)
select gen_random_uuid(),
       '00000000-0000-4000-8000-000000000001'::uuid,
       c.account_user_id,
       'CLIENT',
       'active',
       c.created_at,
       c.created_at,
       c.updated_at
  from fiteatsy_clients c
 where not exists (
   select 1
     from tenant_memberships tm
    where tm.tenant_id = '00000000-0000-4000-8000-000000000001'::uuid
      and tm.user_id = c.account_user_id
 );

update fiteatsy_clients c
   set tenant_id = coalesce(
     (
       select tm.tenant_id
         from tenant_memberships tm
        where tm.user_id = c.account_user_id
          and lower(tm.status) = 'active'
        order by case when tm.tenant_id = '00000000-0000-4000-8000-000000000001'::uuid then 0 else 1 end,
                 tm.joined_at asc
        limit 1
     ),
     '00000000-0000-4000-8000-000000000001'::uuid
   )
 where c.tenant_id is null;

alter table fiteatsy_clients alter column tenant_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fiteatsy_clients_tenant_fk'
  ) then
    alter table fiteatsy_clients
      add constraint fiteatsy_clients_tenant_fk
      foreign key (tenant_id) references tenants(id) on delete restrict;
  end if;
end $$;

create index if not exists fiteatsy_clients_tenant_idx
  on fiteatsy_clients (tenant_id);

create unique index if not exists fiteatsy_clients_id_tenant_unique
  on fiteatsy_clients (id, tenant_id);

create unique index if not exists fiteatsy_clients_user_tenant_unique
  on fiteatsy_clients (account_user_id, tenant_id);
