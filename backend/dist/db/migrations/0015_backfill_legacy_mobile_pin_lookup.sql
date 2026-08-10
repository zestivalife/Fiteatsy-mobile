update users u
set
  mobile_number_normalized = concat('91', regexp_replace(u.mobile_number_normalized, '[^0-9]', '', 'g')),
  updated_at = now(),
  version = version + 1
where u.mobile_number_normalized is not null
  and regexp_replace(u.mobile_number_normalized, '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
  and not exists (
    select 1
    from users existing
    where existing.id <> u.id
      and existing.deleted_at is null
      and existing.mobile_number_normalized = concat('91', regexp_replace(u.mobile_number_normalized, '[^0-9]', '', 'g'))
  );
