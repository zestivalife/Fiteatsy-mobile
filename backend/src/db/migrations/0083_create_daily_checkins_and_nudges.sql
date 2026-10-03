-- Restore schema-governed creation for two legacy application tables that
-- previously existed only in schema.sql. This remains an additive EXPAND
-- migration: tenant ownership is nullable and legacy Zestiva rows are
-- deterministically backfilled.

create table if not exists daily_checkins (
  id bigserial primary key,
  user_id text not null references users(id),
  client_id text,
  tenant_id uuid references tenants(id) on delete restrict,
  checkin_date date not null,
  mood smallint not null check (mood between 1 and 5),
  energy smallint not null check (energy between 1 and 5),
  sleep_quality smallint not null check (sleep_quality between 1 and 5),
  created_at timestamptz not null default now(),
  foreign key (client_id, user_id) references fiteatsy_clients(id, account_user_id) on delete restrict,
  unique (user_id, checkin_date)
);

create table if not exists nudges (
  id text primary key,
  user_id text not null references users(id),
  client_id text,
  tenant_id uuid references tenants(id) on delete restrict,
  type text not null,
  title text not null,
  body text not null,
  action_label text not null,
  action_minutes smallint not null,
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  status text not null default 'scheduled',
  foreign key (client_id, user_id) references fiteatsy_clients(id, account_user_id) on delete restrict
);

-- Existing installations may have created these tables from schema.sql.
-- Refuse incompatible definitions rather than letting IF NOT EXISTS hide drift.
do $$
declare
  mismatch text;
begin
  select string_agg(expected.table_name || '.' || expected.column_name, ', ' order by expected.table_name, expected.ordinality)
    into mismatch
    from (values
      ('daily_checkins','id','bigint',1),
      ('daily_checkins','user_id','text',2),
      ('daily_checkins','client_id','text',3),
      ('daily_checkins','checkin_date','date',4),
      ('daily_checkins','mood','smallint',5),
      ('daily_checkins','energy','smallint',6),
      ('daily_checkins','sleep_quality','smallint',7),
      ('daily_checkins','created_at','timestamp with time zone',8),
      ('nudges','id','text',1),
      ('nudges','user_id','text',2),
      ('nudges','client_id','text',3),
      ('nudges','type','text',4),
      ('nudges','title','text',5),
      ('nudges','body','text',6),
      ('nudges','action_label','text',7),
      ('nudges','action_minutes','smallint',8),
      ('nudges','scheduled_at','timestamp with time zone',9),
      ('nudges','sent_at','timestamp with time zone',10),
      ('nudges','status','text',11)
    ) as expected(table_name,column_name,data_type,ordinality)
    left join information_schema.columns actual
      on actual.table_schema='public'
     and actual.table_name=expected.table_name
     and actual.column_name=expected.column_name
     and actual.data_type=expected.data_type
   where actual.column_name is null;
  if mismatch is not null then
    raise exception '0083 incompatible existing table definition: %', mismatch;
  end if;
end $$;

do $$
declare
  missing_constraint text;
begin
  select string_agg(requirement.name, ', ' order by requirement.name)
    into missing_constraint
    from (values
      ('daily_checkins primary key', 'daily_checkins', 'p', '^PRIMARY KEY \(id\)$'),
      ('daily_checkins user/date unique', 'daily_checkins', 'u', '^UNIQUE \(user_id, checkin_date\)$'),
      ('daily_checkins user foreign key', 'daily_checkins', 'f', '^FOREIGN KEY \(user_id\) REFERENCES users\(id\)'),
      ('daily_checkins client ownership foreign key', 'daily_checkins', 'f', '^FOREIGN KEY \(client_id, user_id\) REFERENCES fiteatsy_clients\(id, account_user_id\) ON DELETE RESTRICT$'),
      ('nudges primary key', 'nudges', 'p', '^PRIMARY KEY \(id\)$'),
      ('nudges user foreign key', 'nudges', 'f', '^FOREIGN KEY \(user_id\) REFERENCES users\(id\)'),
      ('nudges client ownership foreign key', 'nudges', 'f', '^FOREIGN KEY \(client_id, user_id\) REFERENCES fiteatsy_clients\(id, account_user_id\) ON DELETE RESTRICT$')
    ) as requirement(name,table_name,constraint_type,definition_pattern)
   where not exists (
     select 1
       from pg_constraint constraint_record
      where constraint_record.conrelid=requirement.table_name::regclass
        and constraint_record.contype=requirement.constraint_type::"char"
        and pg_get_constraintdef(constraint_record.oid) ~ requirement.definition_pattern
   );
  if missing_constraint is not null then
    raise exception '0083 incompatible existing table constraints: %', missing_constraint;
  end if;
end $$;

alter table daily_checkins
  add column if not exists tenant_id uuid references tenants(id) on delete restrict;
alter table nudges
  add column if not exists tenant_id uuid references tenants(id) on delete restrict;

update daily_checkins
   set tenant_id='00000000-0000-4000-8000-000000000001'::uuid
 where tenant_id is null;
update nudges
   set tenant_id='00000000-0000-4000-8000-000000000001'::uuid
 where tenant_id is null;

create unique index if not exists daily_checkins_client_date_unique
  on daily_checkins(client_id,checkin_date) where client_id is not null;
create index if not exists daily_checkins_tenant_idx on daily_checkins(tenant_id);
create index if not exists nudges_client_scheduled_idx
  on nudges(client_id,scheduled_at desc) where client_id is not null;
create index if not exists nudges_tenant_idx on nudges(tenant_id);

drop trigger if exists tenant_dual_write on daily_checkins;
create trigger tenant_dual_write before insert on daily_checkins
for each row execute function set_zestiva_tenant_during_transition();
drop trigger if exists tenant_dual_write on nudges;
create trigger tenant_dual_write before insert on nudges
for each row execute function set_zestiva_tenant_during_transition();

create or replace function refresh_tenant_backfill_verification()
returns void language plpgsql as $$
declare table_name text;
begin
  foreach table_name in array array[
    'fiteatsy_clients','consultant_client_assignments','care_cases','consultant_client_operations',
    'consultant_client_operation_audit','daily_checkins','nudges','health_reports','health_report_files',
    'health_report_upload_sessions','document_intelligence_audit','biomarkers','biomarker_observations',
    'health_observations','diet_plans','diet_plan_versions','diet_plan_review_events','notifications',
    'profile_photo_assets','consultant_access_consents','consultant_access_consent_events'
  ] loop
    if to_regclass(table_name) is null then
      raise exception 'authoritative tenant table missing after governed migrations: %', table_name;
    end if;
    execute format(
      'insert into tenant_backfill_verification_snapshot(table_name,total_rows,unresolved_rows,distinct_tenants,zestiva_backfilled_rows,captured_at)
       select %L,count(*),count(*) filter(where tenant_id is null),count(distinct tenant_id),
              count(*) filter(where tenant_id=%L::uuid),now() from %I
       on conflict(table_name) do update set total_rows=excluded.total_rows,
         unresolved_rows=excluded.unresolved_rows,distinct_tenants=excluded.distinct_tenants,
         zestiva_backfilled_rows=excluded.zestiva_backfilled_rows,captured_at=excluded.captured_at',
      table_name,'00000000-0000-4000-8000-000000000001',table_name
    );
  end loop;
end $$;

select refresh_tenant_backfill_verification();

do $$
declare verified_count integer;
begin
  select count(*) into verified_count from tenant_backfill_verification_snapshot;
  if verified_count <> 21 then
    raise exception 'authoritative tenant verification expected 21 tables, found %', verified_count;
  end if;
end $$;
