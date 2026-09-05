do $$
declare
  expected_count integer := 6;
  matched_count integer;
begin
  with expected(id, display_name, first_name, last_name, email_normalized) as (
    values
      ('0e65d616-b96e-4fc5-8d36-a2f33cd81c89', 'QA Consultant', 'QA', 'Consultant', 'qa.consultant.workspace.20260814@nuetra.in'),
      ('3bc788d8-795d-4ecb-bded-e120b33ed554', 'Prod List', 'Prod', 'List', 'prod.list.1786624743@zestiva.in'),
      ('3b641ceb-8eab-4e70-bffe-efd746347cee', 'Bite Diet', 'Bite', 'Diet', 'bitendiet.official@gmail.com'),
      ('8fa26de5-21fc-43e1-ba8b-86c898f6c91b', 'Lalit Test P', 'Lalit', 'Test P', 'lalit@gmail.com'),
      ('14848d83-8a39-4674-90f9-13909e0bd728', 'Fiteatsy Fiteatsy', 'Fiteatsy', 'Fiteatsy', 'fiteatsy@gmail.com'),
      ('78fc83c9-2d55-4815-8918-baf00fff7abb', 'QA Consultant', 'QA', 'Consultant', 'qa.consultant.20260814@gmail.com')
  )
  update users as target
     set name = expected.display_name,
         first_name = expected.first_name,
         last_name = expected.last_name,
         email_normalized = expected.email_normalized,
         updated_at = now()
    from expected
   where target.id = expected.id
     and target.deleted_at is null;

  select count(*)
    into matched_count
    from users
   where id in (
     '0e65d616-b96e-4fc5-8d36-a2f33cd81c89',
     '3bc788d8-795d-4ecb-bded-e120b33ed554',
     '3b641ceb-8eab-4e70-bffe-efd746347cee',
     '8fa26de5-21fc-43e1-ba8b-86c898f6c91b',
     '14848d83-8a39-4674-90f9-13909e0bd728',
     '78fc83c9-2d55-4815-8918-baf00fff7abb'
   )
   and deleted_at is null
   and name in ('QA Consultant', 'Prod List', 'Bite Diet', 'Lalit Test P', 'Fiteatsy Fiteatsy');

  if matched_count <> expected_count then
    raise exception 'Professional identity backfill expected %, matched %', expected_count, matched_count;
  end if;
end
$$;
