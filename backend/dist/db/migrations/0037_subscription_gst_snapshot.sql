alter table payment_orders
  add column if not exists base_amount_minor integer,
  add column if not exists cgst_rate_percent integer,
  add column if not exists cgst_amount_minor integer,
  add column if not exists sgst_rate_percent integer,
  add column if not exists sgst_amount_minor integer,
  add column if not exists total_tax_minor integer,
  add column if not exists total_amount_minor integer;

alter table payment_transactions
  add column if not exists base_amount_minor integer,
  add column if not exists cgst_rate_percent integer,
  add column if not exists cgst_amount_minor integer,
  add column if not exists sgst_rate_percent integer,
  add column if not exists sgst_amount_minor integer,
  add column if not exists total_tax_minor integer,
  add column if not exists total_amount_minor integer;

alter table user_subscriptions
  add column if not exists base_amount_minor integer,
  add column if not exists cgst_rate_percent integer,
  add column if not exists cgst_amount_minor integer,
  add column if not exists sgst_rate_percent integer,
  add column if not exists sgst_amount_minor integer,
  add column if not exists total_tax_minor integer,
  add column if not exists total_amount_minor integer;
