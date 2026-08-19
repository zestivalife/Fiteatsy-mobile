create table if not exists assessment_definitions (
  id text primary key,
  assessment_type text not null unique,
  instrument_version text not null,
  scoring_version text not null,
  title text not null,
  item_count integer not null check (item_count > 0),
  content jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assessment_sessions (
  id uuid primary key,
  user_id text not null references users(id) on delete cascade,
  client_id text not null,
  assessment_type text not null,
  instrument_version text not null,
  scoring_version text not null,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'COMPLETED', 'ABANDONED')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (client_id, user_id) references fiteatsy_clients(id, account_user_id) on delete restrict
);

create index if not exists assessment_sessions_owner_idx
  on assessment_sessions (client_id, user_id, assessment_type, started_at desc)
  where deleted_at is null;

create table if not exists assessment_responses (
  session_id uuid not null references assessment_sessions(id) on delete cascade,
  item_id text not null,
  selected_value smallint not null check (selected_value between 0 and 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, item_id)
);

create table if not exists assessment_results (
  id uuid primary key,
  session_id uuid not null unique references assessment_sessions(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  client_id text not null,
  assessment_type text not null,
  instrument_version text not null,
  scoring_version text not null,
  raw_score integer not null check (raw_score between 0 and 40),
  max_score integer not null default 40,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (client_id, user_id) references fiteatsy_clients(id, account_user_id) on delete restrict
);

create index if not exists assessment_results_owner_idx
  on assessment_results (client_id, user_id, assessment_type, completed_at desc);

insert into assessment_definitions (
  id,
  assessment_type,
  instrument_version,
  scoring_version,
  title,
  item_count,
  content,
  active
) values (
  'pss10',
  'PSS10',
  'pss10-fiteatsy-v2',
  'pss10-scoring-v1',
  'Perceived Stress Assessment',
  10,
  '{
    "licensedItemWordingPresent": true,
    "recallPeriod": "the last 30 days",
    "subtitle": "Thinking about the last 30 days, select how often each of the following applied to you.",
    "items": [
      { "id": "PSS10_Q01", "label": "Upset by unexpected events." },
      { "id": "PSS10_Q02", "label": "Unable to control important things." },
      { "id": "PSS10_Q03", "label": "Nervous and stressed." },
      { "id": "PSS10_Q04", "label": "Confident in handling personal problems." },
      { "id": "PSS10_Q05", "label": "Things were going your way." },
      { "id": "PSS10_Q06", "label": "Unable to cope with tasks." },
      { "id": "PSS10_Q07", "label": "Able to control irritations." },
      { "id": "PSS10_Q08", "label": "On top of things." },
      { "id": "PSS10_Q09", "label": "Angered by uncontrollable events." },
      { "id": "PSS10_Q10", "label": "Difficulties were piling up." }
    ],
    "responseOptions": [
      { "value": 0, "label": "Never" },
      { "value": 1, "label": "Almost never" },
      { "value": 2, "label": "Sometimes" },
      { "value": 3, "label": "Fairly often" },
      { "value": 4, "label": "Very often" }
    ]
  }'::jsonb,
  true
) on conflict (assessment_type) do update set
  instrument_version = excluded.instrument_version,
  scoring_version = excluded.scoring_version,
  title = excluded.title,
  item_count = excluded.item_count,
  content = excluded.content,
  active = excluded.active,
  updated_at = now();
