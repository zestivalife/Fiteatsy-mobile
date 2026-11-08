create table if not exists health_calculations (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  client_id text not null,
  calculation_type text not null,
  status text not null,
  value numeric,
  unit text,
  category text,
  input_snapshot jsonb not null default '{}'::jsonb,
  calculated_values jsonb not null default '{}'::jsonb,
  formula_version text not null,
  reason text,
  calculated_at timestamptz not null default now(),
  foreign key (client_id, user_id) references fiteatsy_clients(id, account_user_id) on delete restrict,
  check (calculation_type in ('bmi', 'bmr', 'tdee', 'target_heart_rate', 'body_fat', 'one_rep_max')),
  check (status in ('AVAILABLE', 'NOT_AVAILABLE'))
);

create index if not exists health_calculations_client_type_calculated_idx
  on health_calculations (client_id, calculation_type, calculated_at desc);
