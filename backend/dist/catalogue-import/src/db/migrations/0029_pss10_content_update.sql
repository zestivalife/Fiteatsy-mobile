alter table assessment_results
  add column if not exists interpretation_version text;

update assessment_results
set interpretation_version = 'pss10-interpretation-v1'
where interpretation_version is null;

alter table assessment_results
  alter column interpretation_version set default 'pss10-interpretation-v1',
  alter column interpretation_version set not null;

update assessment_definitions
set instrument_version = 'pss10-fiteatsy-v2',
    scoring_version = 'pss10-scoring-v1',
    content = jsonb_build_object(
      'licensedItemWordingPresent', true,
      'recallPeriod', 'the last 30 days',
      'subtitle', 'Thinking about the last 30 days, select how often each of the following applied to you.',
      'items', jsonb_build_array(
        jsonb_build_object('id', 'PSS10_Q01', 'label', 'Upset by unexpected events.'),
        jsonb_build_object('id', 'PSS10_Q02', 'label', 'Unable to control important things.'),
        jsonb_build_object('id', 'PSS10_Q03', 'label', 'Nervous and stressed.'),
        jsonb_build_object('id', 'PSS10_Q04', 'label', 'Confident in handling personal problems.'),
        jsonb_build_object('id', 'PSS10_Q05', 'label', 'Things were going your way.'),
        jsonb_build_object('id', 'PSS10_Q06', 'label', 'Unable to cope with tasks.'),
        jsonb_build_object('id', 'PSS10_Q07', 'label', 'Able to control irritations.'),
        jsonb_build_object('id', 'PSS10_Q08', 'label', 'On top of things.'),
        jsonb_build_object('id', 'PSS10_Q09', 'label', 'Angered by uncontrollable events.'),
        jsonb_build_object('id', 'PSS10_Q10', 'label', 'Difficulties were piling up.')
      ),
      'responseOptions', jsonb_build_array(
        jsonb_build_object('value', 0, 'label', 'Never'),
        jsonb_build_object('value', 1, 'label', 'Almost never'),
        jsonb_build_object('value', 2, 'label', 'Sometimes'),
        jsonb_build_object('value', 3, 'label', 'Fairly often'),
        jsonb_build_object('value', 4, 'label', 'Very often')
      )
    ),
    updated_at = now()
where assessment_type = 'PSS10';
