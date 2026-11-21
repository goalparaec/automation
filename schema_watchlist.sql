-- Consumer Watchlist module (daily payment check for a supplied list of
-- consumers). Safe to re-run: create-if-not-exists throughout, nothing is
-- ever dropped. Run this once in the Supabase SQL editor.

-- A named list of consumers (e.g. "Negative balance more than 10K").
create table if not exists watchlists (
  id bigint generated always as identity primary key,
  name text not null unique,
  source_file text,
  consumer_count integer not null default 0,
  as_on_date date,          -- the date the uploaded list's balances are "as on"
  criteria_text text,       -- e.g. "with negative balance less than -10K" (used in the report title)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If the table already exists from the first version of this file, add the new columns.
alter table watchlists add column if not exists as_on_date date;
alter table watchlists add column if not exists criteria_text text;

-- The consumers on a list. listed_on / listed_balance / base_pay_* are the
-- "before" picture (what the list file said on the day the consumer was
-- first added) and are kept when the list is re-uploaded, so earlier
-- realization is never lost when the list is updated.
create table if not exists watchlist_consumers (
  id bigint generated always as identity primary key,
  list_id bigint not null references watchlists(id) on delete cascade,
  esd_code text not null,
  consumer_no text not null,
  consumer_name text,
  category_name text,
  phone_no text,
  remarks text,
  listed_on date not null,
  listed_balance numeric,
  base_pay_date date,
  base_pay_amount numeric,
  sync_id text,
  unique (list_id, consumer_no)
);
create index if not exists idx_wl_consumers_list on watchlist_consumers (list_id, esd_code);

-- One row per (list, report date): the header of a daily check.
create table if not exists watchlist_checks (
  list_id bigint not null references watchlists(id) on delete cascade,
  report_date date not null,
  listed integer not null default 0,
  in_file integer not null default 0,
  not_in_file integer not null default 0,
  paid_count integer not null default 0,
  paid_amount numeric not null default 0,
  cum_count integer not null default 0,
  cum_amount numeric not null default 0,
  file_names text,
  rows_in_files integer,
  stale_warning text,
  uploaded_at timestamptz not null default now(),
  uploaded_by text,
  primary key (list_id, report_date)
);

-- One row per listed consumer per daily check (also the baseline for the next check).
create table if not exists watchlist_check_rows (
  id bigint generated always as identity primary key,
  list_id bigint not null references watchlists(id) on delete cascade,
  report_date date not null,
  esd_code text not null,
  consumer_no text not null,
  consumer_name text,
  category_name text,
  connection_status text,
  in_file boolean not null default true,
  balance_now numeric,
  last_payment_date date,
  last_payment_amount numeric,
  new_payment boolean not null default false,
  paid_amount numeric not null default 0,
  cum_paid_amount numeric not null default 0,
  cum_paid_count integer not null default 0,
  first_paid_date date,
  listed_balance numeric
);
create index if not exists idx_wl_rows_list_date on watchlist_check_rows (list_id, report_date);
create index if not exists idx_wl_rows_consumer on watchlist_check_rows (list_id, consumer_no);

alter table watchlists enable row level security;
alter table watchlist_consumers enable row level security;
alter table watchlist_checks enable row level security;
alter table watchlist_check_rows enable row level security;
-- No public policies: all access goes through API routes using the
-- service_role key on the server, same as the rest of this app.

notify pgrst, 'reload schema';
