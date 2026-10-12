-- Prepaid Recovery module. Safe to re-run: uses create-if-not-exists /
-- create-or-replace throughout, and never drops existing data.

-- If prepaid_recovery_summary already exists from an earlier version of
-- this schema, add the new column in place rather than recreating it.
alter table if exists prepaid_recovery_summary
  add column if not exists good_standing_count integer not null default 0;

-- Serial number within an ESD's call list (1 = largest negative balance).
-- Used to hand out telecalling work by ESD + serial range.
alter table if exists prepaid_recovery_calllist
  add column if not exists serial_no integer;

create table if not exists prepaid_recovery_esd_map (
  esd_code text primary key,
  esd_label text not null,
  updated_at timestamptz not null default now()
);

insert into prepaid_recovery_esd_map (esd_code, esd_label) values
  ('038', 'Dhupdhara'),
  ('039', 'Dudhnoi'),
  ('040', 'Goalpara'),
  ('041', 'Lakhipur'),
  ('042', 'Mankachar')
on conflict (esd_code) do update set esd_label = excluded.esd_label, updated_at = now();

-- Daily snapshot of the summary tab, one row per (report_date, esd_code).
create table if not exists prepaid_recovery_summary (
  report_date date not null,
  esd_code text not null,
  esd_label text not null,
  band_3_6 integer not null default 0,
  band_6_12 integer not null default 0,
  band_above_1y integer not null default 0,
  band_no_payment integer not null default 0,
  call_list_total integer not null default 0,
  neg_band_3_6 numeric not null default 0,
  neg_band_6_12 numeric not null default 0,
  neg_band_above_1y numeric not null default 0,
  neg_band_no_payment numeric not null default 0,
  neg_total numeric not null default 0,
  no_phone_excluded integer not null default 0,
  good_standing_count integer not null default 0,
  paid_yesterday_count integer not null default 0,
  paid_yesterday_amount numeric not null default 0,
  paid_today_count integer not null default 0,
  paid_today_amount numeric not null default 0,
  rows_in_report integer not null default 0,
  latest_last_payment_date date,
  stale_warning text,
  uploaded_at timestamptz not null default now(),
  uploaded_by text,
  primary key (report_date, esd_code)
);

-- Today's call list, replaced wholesale per (report_date, esd_code) on every
-- upload so re-uploading an ESD's file for the same date simply overwrites it.
create table if not exists prepaid_recovery_calllist (
  id bigint generated always as identity primary key,
  report_date date not null,
  esd_code text not null,
  serial_no integer,
  consumer_no text not null,
  consumer_name text,
  consumer_address text,
  category_name text,
  connection_status text,
  phone_no text,
  last_payment_date date,
  balance numeric,
  band text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_calllist_date_esd on prepaid_recovery_calllist (report_date, esd_code);
create index if not exists idx_calllist_consumer on prepaid_recovery_calllist (consumer_no);
create index if not exists idx_calllist_serial on prepaid_recovery_calllist (report_date, esd_code, serial_no);

-- The payments list (paid yesterday / today), replaced per (report_date, esd_code).
create table if not exists prepaid_recovery_payments (
  id bigint generated always as identity primary key,
  report_date date not null,
  esd_code text not null,
  consumer_no text not null,
  consumer_name text,
  category_name text,
  paid_amount numeric not null default 0,
  balance_now numeric,
  paid_when text not null, -- 'today' | 'yesterday'
  created_at timestamptz not null default now()
);

create index if not exists idx_payments_date_esd on prepaid_recovery_payments (report_date, esd_code);

-- Consumers dropped by the scope filters (govt / PDC / tower / category /
-- GHDT / name-keyword). Kept OUT of the normal summary/call-list/payments,
-- but tracked here so they can be reviewed separately on request. Replaced
-- wholesale per (report_date, esd_code) on every upload, same as the call list.
create table if not exists prepaid_recovery_excluded (
  id bigint generated always as identity primary key,
  report_date date not null,
  esd_code text not null,
  consumer_no text not null,
  consumer_name text,
  category_name text,
  connection_status text,
  phone_no text,
  balance numeric,
  reason_category text not null,
  reason_detail text,
  created_at timestamptz not null default now()
);

create index if not exists idx_excluded_date_esd on prepaid_recovery_excluded (report_date, esd_code);
create index if not exists idx_excluded_reason on prepaid_recovery_excluded (reason_category);

-- Every consumer who is eligible but simply isn't a defaulter right now
-- (balance above the threshold, or recharged within the grace period).
-- Together with the call list, payments and excluded tables, this makes
-- every single consumer in the uploaded files locatable somewhere. Given
-- the volume (can be 200k+ rows/day), only the two most recent report
-- dates are ever kept — see prune_prepaid_recovery_old_dates() below.
create table if not exists prepaid_recovery_good_standing (
  id bigint generated always as identity primary key,
  report_date date not null,
  esd_code text not null,
  consumer_no text not null,
  consumer_name text,
  category_name text,
  balance numeric,
  last_payment_date date,
  skip_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_good_standing_date_esd on prepaid_recovery_good_standing (report_date, esd_code);
create index if not exists idx_good_standing_consumer on prepaid_recovery_good_standing (consumer_no);

-- Telecalling remarks, keyed by consumer so they survive the next day's
-- upload and are shown beside the same consumer in tomorrow's call list.
create table if not exists prepaid_recovery_remarks (
  consumer_no text not null,
  esd_code text not null,
  remark text not null default '',
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (consumer_no, esd_code)
);

-- Telecalling allotments: "ESD X, serial 1-500 goes to caller Y". The
-- consumers are snapshotted when the allotment is made, so the next day's
-- check ("how many of these have paid?") still works after serial numbers
-- are re-generated by a newer upload. NOT pruned with the 2-day retention.
create table if not exists prepaid_recovery_allotments (
  id bigint generated always as identity primary key,
  label text not null,
  esd_code text not null,
  from_serial integer not null,
  to_serial integer not null,
  allotted_on date not null,
  consumer_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists prepaid_recovery_allotment_items (
  id bigint generated always as identity primary key,
  allotment_id bigint not null references prepaid_recovery_allotments(id) on delete cascade,
  esd_code text not null,
  serial_no integer,
  consumer_no text not null,
  consumer_name text,
  phone_no text,
  band text,
  balance numeric
);

create index if not exists idx_allot_items_allotment on prepaid_recovery_allotment_items (allotment_id);

alter table prepaid_recovery_allotments enable row level security;
alter table prepaid_recovery_allotment_items enable row level security;
alter table prepaid_recovery_esd_map enable row level security;
alter table prepaid_recovery_summary enable row level security;
alter table prepaid_recovery_calllist enable row level security;
alter table prepaid_recovery_payments enable row level security;
alter table prepaid_recovery_excluded enable row level security;
alter table prepaid_recovery_good_standing enable row level security;
alter table prepaid_recovery_remarks enable row level security;
-- No public policies: all access goes through API routes using the
-- service_role key on the server, same as the rest of this app. Note:
-- the spec's "telecallers can edit remarks only, admins upload" role split
-- is NOT enforced at the database level here, because this app has no
-- login/role system yet in any other module — see the "could not verify"
-- note in the delivery message.
