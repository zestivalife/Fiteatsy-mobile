begin;

update assessment_definitions
set instrument_version = 'pss10-nuetra-v17.37',
    content = jsonb_set(jsonb_set(jsonb_set(content, '{subtitle}', to_jsonb('Thinking about the last week, select how often each of the following applied to you.'::text)), '{recallPeriod}', to_jsonb('the last week'::text)), '{items}', '[
      {"id":"PSS10_Q01","label":"In the last week, how often have you felt upset because something happened unexpectedly?"},
      {"id":"PSS10_Q02","label":"In the last week, how often have you felt unable to control the important things in your life?"},
      {"id":"PSS10_Q03","label":"In the last week, how often have you felt nervous or stressed?"},
      {"id":"PSS10_Q04","label":"In the last week, how often have you felt confident about your ability to handle personal problems?"},
      {"id":"PSS10_Q05","label":"In the last week, how often have you felt that things were going your way?"},
      {"id":"PSS10_Q06","label":"In the last week, how often have you found that you could not cope with all the things you had to do?"},
      {"id":"PSS10_Q07","label":"In the last week, how often have you been able to control irritations in your life?"},
      {"id":"PSS10_Q08","label":"In the last week, how often have you felt that you were on top of things?"},
      {"id":"PSS10_Q09","label":"In the last week, how often have you been angered because of things that were outside of your control?"},
      {"id":"PSS10_Q10","label":"In the last week, how often have you felt difficulties were piling up so high that you could not overcome them?"}
    ]'::jsonb),
    updated_at = now()
where assessment_type = 'PSS10';

commit;
