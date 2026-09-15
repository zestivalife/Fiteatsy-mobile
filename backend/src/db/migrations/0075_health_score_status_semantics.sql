alter table health_scores drop constraint if exists health_scores_score_status_check;
alter table health_scores add constraint health_scores_score_status_check check (
  score_status in (
    'available','calculating','calibrating','no_data','calculated',
    'insufficient_data','methodology_pending','not_applicable','stale','offline','error'
  )
);
