create table if not exists users (
  id text primary key,
  name text not null,
  role text not null,
  work_hours text not null,
  biggest_challenge text not null,
  calendar_provider text not null,
  created_at timestamptz not null default now()
);

create table if not exists daily_checkins (
  id bigserial primary key,
  user_id text not null references users(id),
  checkin_date date not null,
  mood smallint not null check (mood between 1 and 5),
  energy smallint not null check (energy between 1 and 5),
  sleep_quality smallint not null check (sleep_quality between 1 and 5),
  created_at timestamptz not null default now(),
  unique (user_id, checkin_date)
);

create table if not exists ai_decision_logs (
  id bigserial primary key,
  user_id text not null references users(id),
  input_summary text not null,
  reasoning text not null,
  output_summary text not null,
  created_at timestamptz not null default now()
);

create table if not exists nudges (
  id text primary key,
  user_id text not null references users(id),
  type text not null,
  title text not null,
  body text not null,
  action_label text not null,
  action_minutes smallint not null,
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  status text not null default 'scheduled'
);
