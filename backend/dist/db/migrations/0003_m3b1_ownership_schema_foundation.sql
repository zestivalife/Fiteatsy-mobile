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

alter table lab_reports
  add column if not exists client_id text;

alter table attachments
  add column if not exists client_id text;

update daily_checkins dc
set client_id = c.id
from fiteatsy_clients c
where dc.user_id = c.account_user_id
  and dc.client_id is distinct from c.id;

update ai_decision_logs adl
set client_id = c.id
from fiteatsy_clients c
where adl.user_id = c.account_user_id
  and adl.client_id is distinct from c.id;

update nudges n
set client_id = c.id
from fiteatsy_clients c
where n.user_id = c.account_user_id
  and n.client_id is distinct from c.id;

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

update lab_reports lr
set client_id = c.id
from fiteatsy_clients c
where lr.user_id = c.account_user_id
  and lr.client_id is distinct from c.id;

update attachments a
set client_id = c.id
from fiteatsy_clients c
where a.user_id = c.account_user_id
  and a.client_id is distinct from c.id;

do $$
begin
  if exists (
    select 1
    from daily_checkins dc
    left join fiteatsy_clients c on c.account_user_id = dc.user_id
    where c.id is null
  ) then
    raise exception 'M3B.1 backfill failed: daily_checkins contains rows without resolvable client ownership';
  end if;

  if exists (
    select 1
    from ai_decision_logs adl
    left join fiteatsy_clients c on c.account_user_id = adl.user_id
    where c.id is null
  ) then
    raise exception 'M3B.1 backfill failed: ai_decision_logs contains rows without resolvable client ownership';
  end if;

  if exists (
    select 1
    from nudges n
    left join fiteatsy_clients c on c.account_user_id = n.user_id
    where c.id is null
  ) then
    raise exception 'M3B.1 backfill failed: nudges contains rows without resolvable client ownership';
  end if;

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

  if exists (
    select 1
    from lab_reports lr
    left join fiteatsy_clients c on c.account_user_id = lr.user_id
    where lr.deleted_at is null
      and c.id is null
  ) then
    raise exception 'M3B.1 backfill failed: lab_reports contains rows without resolvable client ownership';
  end if;

  if exists (
    select 1
    from attachments a
    left join fiteatsy_clients c on c.account_user_id = a.user_id
    where a.deleted_at is null
      and c.id is null
  ) then
    raise exception 'M3B.1 backfill failed: attachments contains rows without resolvable client ownership';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'daily_checkins_client_owner_fk'
  ) then
    alter table daily_checkins
      add constraint daily_checkins_client_owner_fk
      foreign key (client_id, user_id)
      references fiteatsy_clients (id, account_user_id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_decision_logs_client_owner_fk'
  ) then
    alter table ai_decision_logs
      add constraint ai_decision_logs_client_owner_fk
      foreign key (client_id, user_id)
      references fiteatsy_clients (id, account_user_id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'nudges_client_owner_fk'
  ) then
    alter table nudges
      add constraint nudges_client_owner_fk
      foreign key (client_id, user_id)
      references fiteatsy_clients (id, account_user_id)
      on delete restrict;
  end if;

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

  if not exists (
    select 1
    from pg_constraint
    where conname = 'lab_reports_client_owner_fk'
  ) then
    alter table lab_reports
      add constraint lab_reports_client_owner_fk
      foreign key (client_id, user_id)
      references fiteatsy_clients (id, account_user_id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'attachments_client_owner_fk'
  ) then
    alter table attachments
      add constraint attachments_client_owner_fk
      foreign key (client_id, user_id)
      references fiteatsy_clients (id, account_user_id)
      on delete restrict;
  end if;
end
$$;

create unique index if not exists daily_checkins_client_date_unique
  on daily_checkins (client_id, checkin_date)
  where client_id is not null;

create index if not exists ai_decision_logs_client_created_idx
  on ai_decision_logs (client_id, created_at desc)
  where client_id is not null;

create index if not exists nudges_client_scheduled_idx
  on nudges (client_id, scheduled_at desc)
  where client_id is not null;

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

create index if not exists lab_reports_client_report_date_idx
  on lab_reports (client_id, report_date desc nulls last)
  where client_id is not null;

create index if not exists attachments_client_created_idx
  on attachments (client_id, created_at desc)
  where client_id is not null;
