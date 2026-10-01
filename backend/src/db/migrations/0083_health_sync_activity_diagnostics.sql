alter table health_sync_device_heartbeats
  add column if not exists build_number text,
  add column if not exists os_version text,
  add column if not exists healthkit_available boolean,
  add column if not exists activity_summary jsonb,
  add column if not exists workout_summary jsonb;

alter table health_sync_metric_status
  add column if not exists source_origin text;
