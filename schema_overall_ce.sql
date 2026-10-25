-- Overall CE module. Safe to re-run: create-if-not-exists throughout, and it
-- never drops or changes any existing table. Run once in the Supabase SQL editor.

-- Prepaid recharge (collection) report - the one input the daily report did
-- not already store. Same shape as the other input_* tables: rows are keyed
-- by report_date, and a re-upload for the same date replaces that date's rows.
create table if not exists input_prepaid_coll (
  id bigserial primary key,
  report_date date not null,
  sl_no integer,
  region text,
  circle text,
  sub_division_name text,
  consumer_paid numeric,
  total_recharge numeric,
  credit_adjustment numeric,
  outstanding_payment numeric,
  easypay_consumers numeric,
  easypay_amount numeric
);
create index if not exists input_prepaid_coll_date_idx on input_prepaid_coll (report_date);
alter table input_prepaid_coll enable row level security;

-- Typed / uploaded once a month per ESD: the two amounts that are not in ARMS.
-- They count as both demand and collection in Overall CE.
create table if not exists overall_ce_monthly_inputs (
  report_month date not null,          -- always the 1st of the month
  sub_division text not null,
  manual_amount numeric not null default 0,
  assessment_amount numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (report_month, sub_division)
);
alter table overall_ce_monthly_inputs enable row level security;

notify pgrst, 'reload schema';
