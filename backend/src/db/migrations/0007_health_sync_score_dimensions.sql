alter table health_scores
  drop constraint if exists health_scores_score_type_check;

alter table health_scores
  add constraint health_scores_score_type_check
  check (score_type in ('nutrition', 'clinical', 'activity', 'sleep', 'calm', 'recovery', 'overall'));
