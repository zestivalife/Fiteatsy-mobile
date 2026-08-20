alter table users add column if not exists first_name text;
alter table users add column if not exists last_name text;

create index if not exists users_professional_name_idx
  on users (role, first_name, last_name)
  where deleted_at is null;
