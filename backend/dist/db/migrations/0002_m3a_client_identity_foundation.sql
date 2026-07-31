create table if not exists fiteatsy_clients (
  id text primary key,
  fiteatsy_client_id text not null unique,
  account_user_id text not null unique references users(id) on delete cascade,
  status text not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists fiteatsy_clients_public_id_unique
  on fiteatsy_clients (fiteatsy_client_id);

create unique index if not exists fiteatsy_clients_account_user_id_unique
  on fiteatsy_clients (account_user_id);

insert into fiteatsy_clients (
  id,
  fiteatsy_client_id,
  account_user_id,
  status,
  version,
  created_at,
  updated_at
)
select
  lower(
    substr(seed.internal_hash, 1, 8) || '-' ||
    substr(seed.internal_hash, 9, 4) || '-' ||
    substr(seed.internal_hash, 13, 4) || '-' ||
    substr(seed.internal_hash, 17, 4) || '-' ||
    substr(seed.internal_hash, 21, 12)
  ) as id,
  'fc_' || seed.public_hash as fiteatsy_client_id,
  u.id as account_user_id,
  'active' as status,
  1 as version,
  now() as created_at,
  now() as updated_at
from users u
cross join lateral (
  select
    md5(u.id || ':m3a-client:internal:' || clock_timestamp()::text || ':' || random()::text) as internal_hash,
    md5(u.id || ':m3a-client:public:' || clock_timestamp()::text || ':' || random()::text) as public_hash
) as seed
where u.deleted_at is null
  and not exists (
    select 1
    from fiteatsy_clients c
    where c.account_user_id = u.id
  );
