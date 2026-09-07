alter table notifications
  add column if not exists read_at timestamptz,
  add column if not exists dismissed_at timestamptz;

create index if not exists notifications_client_active_created_idx
  on notifications (client_id, created_at desc)
  where deleted_at is null and dismissed_at is null;
