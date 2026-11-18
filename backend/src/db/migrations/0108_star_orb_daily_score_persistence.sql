-- Preserve existing score history while allowing the sixth Star Orb domain.
-- Daily idempotency remains governed by the partial unique index introduced in 0106.
alter table health_scores drop constraint if exists health_scores_score_type_check;
alter table health_scores add constraint health_scores_score_type_check check (
  score_type in (
    'energy_balance','body_support','nourishment','recovery','physical_wellness_index',
    'active_performance','stress_resilience','nutrition','clinical','activity','sleep',
    'calm','mind','overall','stress_recovery','cycle','health_intelligence'
  )
);

-- Star Orb calculations retain their two-decimal result instead of coercing
-- it through the original integer-only column.
alter table health_scores alter column score_value type numeric(6,2) using score_value::numeric(6,2);
