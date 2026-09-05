alter table health_scores
  drop constraint if exists health_scores_score_type_check;

alter table health_scores
  add constraint health_scores_score_type_check
  check (
    score_type in (
      'energy_balance',
      'body_support',
      'nourishment',
      'recovery',
      'physical_wellness_index',
      'active_performance',
      'stress_resilience',
      'nutrition',
      'clinical',
      'activity',
      'sleep',
      'calm',
      'overall'
    )
  );
