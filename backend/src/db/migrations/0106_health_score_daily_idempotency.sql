alter table health_scores
  add column if not exists health_day date;

alter table health_scores
  add column if not exists idempotency_key text;

-- Existing history is intentionally preserved. Only newly calculated daily
-- snapshots receive the forward-only key used for retry-safe updates.
create unique index if not exists health_scores_idempotency_key_unique
  on health_scores (idempotency_key)
  where idempotency_key is not null;
