create unique index if not exists fiteatsy_clients_internal_owner_unique
  on fiteatsy_clients (id, account_user_id);

alter table daily_checkins
  add column if not exists client_id text;

alter table ai_decision_logs
  add column if not exists client_id text;

alter table nudges
  add column if not exists client_id text;

alter table health_profiles
  add column if not exists client_id text;

alter table care_cases
  add column if not exists client_id text;

alter table nutrition_profiles
  add column if not exists client_id text;

alter table notifications
  add column if not exists client_id text;

update health_profiles hp
set client_id = c.id
from fiteatsy_clients c
where hp.user_id = c.account_user_id
  and hp.client_id is distinct from c.id;

update care_cases cc
set client_id = c.id
from fiteatsy_clients c
where cc.user_id = c.account_user_id
  and cc.client_id is distinct from c.id;

update nutrition_profiles np
set client_id = c.id
from fiteatsy_clients c
where np.user_id = c.account_user_id
  and np.client_id is distinct from c.id;

update notifications n
set client_id = c.id
from fiteatsy_clients c
where n.user_id = c.account_user_id
  and n.client_id is distinct from c.id;

do $$
begin
  if exists (
    select 1
    from health_profiles hp
    left join fiteatsy_clients c on c.account_user_id = hp.user_id
    where hp.deleted_at is null
      and c.id is null
  ) then
    raise exception 'M3B.1 backfill failed: health_profiles contains rows without resolvable client ownership';
  end if;

  if exists (
    select 1
    from care_cases cc
    left join fiteatsy_clients c on c.account_user_id = cc.user_id
    where cc.deleted_at is null
      and c.id is null
  ) then
    raise exception 'M3B.1 backfill failed: care_cases contains rows without resolvable client ownership';
  end if;

  if exists (
    select 1
    from nutrition_profiles np
    left join fiteatsy_clients c on c.account_user_id = np.user_id
    where np.deleted_at is null
      and c.id is null
  ) then
    raise exception 'M3B.1 backfill failed: nutrition_profiles contains rows without resolvable client ownership';
  end if;

  if exists (
    select 1
    from notifications n
    left join fiteatsy_clients c on c.account_user_id = n.user_id
    where n.deleted_at is null
      and c.id is null
  ) then
    raise exception 'M3B.1 backfill failed: notifications contains rows without resolvable client ownership';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'health_profiles_client_owner_fk'
  ) then
    alter table health_profiles
      add constraint health_profiles_client_owner_fk
      foreign key (client_id, user_id)
      references fiteatsy_clients (id, account_user_id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'care_cases_client_owner_fk'
  ) then
    alter table care_cases
      add constraint care_cases_client_owner_fk
      foreign key (client_id, user_id)
      references fiteatsy_clients (id, account_user_id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'nutrition_profiles_client_owner_fk'
  ) then
    alter table nutrition_profiles
      add constraint nutrition_profiles_client_owner_fk
      foreign key (client_id, user_id)
      references fiteatsy_clients (id, account_user_id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'notifications_client_owner_fk'
  ) then
    alter table notifications
      add constraint notifications_client_owner_fk
      foreign key (client_id, user_id)
      references fiteatsy_clients (id, account_user_id)
      on delete restrict;
  end if;
end
$$;

create unique index if not exists health_profiles_active_client_unique
  on health_profiles (client_id)
  where client_id is not null
    and deleted_at is null
    and status = 'active';

create unique index if not exists care_cases_active_client_unique
  on care_cases (client_id)
  where client_id is not null
    and deleted_at is null
    and status = 'active';

create unique index if not exists nutrition_profiles_active_client_unique
  on nutrition_profiles (client_id)
  where client_id is not null
    and deleted_at is null
    and status = 'active';

create index if not exists notifications_client_created_idx
  on notifications (client_id, created_at desc)
  where client_id is not null;
