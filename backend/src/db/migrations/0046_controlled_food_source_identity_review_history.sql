create table if not exists controlled_food_source_identity_reviews (
  id text primary key,
  task_sha256 text not null check (task_sha256 ~ '^[a-f0-9]{64}$'),
  submission_sha256 text not null unique check (submission_sha256 ~ '^[a-f0-9]{64}$'),
  reviewer_id text not null,
  reviewer_qualification text not null,
  qualification_reference text not null,
  reviewed_on date not null,
  declaration text not null,
  decision_manifest jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists controlled_food_source_identity_reviews_task_idx
  on controlled_food_source_identity_reviews (task_sha256, created_at);

create or replace function reject_controlled_food_source_review_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'controlled Food source identity review history is append-only';
end;
$$;

drop trigger if exists controlled_food_source_reviews_append_only on controlled_food_source_identity_reviews;
create trigger controlled_food_source_reviews_append_only
before update or delete on controlled_food_source_identity_reviews
for each row execute function reject_controlled_food_source_review_mutation();
