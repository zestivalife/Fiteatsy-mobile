do $$
begin
  if exists (
    with canonical_users as (
      select
        id,
        case
          when length(regexp_replace(mobile_number_normalized, '[^0-9]', '', 'g')) = 10
            then concat('91', regexp_replace(mobile_number_normalized, '[^0-9]', '', 'g'))
          else regexp_replace(mobile_number_normalized, '[^0-9]', '', 'g')
        end as canonical_phone
      from users
      where deleted_at is null
        and mobile_number_normalized is not null
    )
    select 1
    from canonical_users
    group by canonical_phone
    having count(distinct id) > 1
  ) then
    raise exception 'Canonical phone identity collision detected; migration aborted without changing users.';
  end if;
end $$;

update users
set
  mobile_number_normalized = case
    when length(regexp_replace(mobile_number_normalized, '[^0-9]', '', 'g')) = 10
      then concat('91', regexp_replace(mobile_number_normalized, '[^0-9]', '', 'g'))
    else regexp_replace(mobile_number_normalized, '[^0-9]', '', 'g')
  end,
  updated_at = now(),
  version = version + 1
where mobile_number_normalized is not null
  and mobile_number_normalized is distinct from case
    when length(regexp_replace(mobile_number_normalized, '[^0-9]', '', 'g')) = 10
      then concat('91', regexp_replace(mobile_number_normalized, '[^0-9]', '', 'g'))
    else regexp_replace(mobile_number_normalized, '[^0-9]', '', 'g')
  end;

alter table users
  drop constraint if exists users_mobile_number_normalized_digits_only;

alter table users
  add constraint users_mobile_number_normalized_digits_only
  check (mobile_number_normalized is null or mobile_number_normalized ~ '^[0-9]{10,15}$');
