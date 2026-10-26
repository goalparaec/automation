-- Meter Cost Record module. Safe to re-run: create-if-not-exists only,
-- never drops or changes existing data.

-- One row per meter-cost payment line read from a Head-wise Collection report.
-- status 'counted'  -> included in the monthly counts
-- status 'ignored'  -> rejected / not a smart-meter deposit (kept so the same
--                      file can be re-uploaded without asking again)
create table if not exists meter_cost_deposits (
  id bigserial primary key,
  esd_code text not null,                 -- 038..042, from the consumer number
  application_no text not null,
  consumer_no text not null,
  consumer_name text,
  kind text not null check (kind in ('new', 'replacement')),
  head text not null,
  amount numeric not null,
  load_kw numeric,
  phase text check (phase in ('1', '3')),
  status text not null check (status in ('counted', 'ignored')),
  reason text,
  receipt_no text not null,
  bill_no text,
  payment_date date not null,
  source_file text,
  created_at timestamptz not null default now(),
  unique (esd_code, receipt_no, head)
);
create index if not exists meter_cost_deposits_date_idx on meter_cost_deposits (payment_date);
create index if not exists meter_cost_deposits_app_idx on meter_cost_deposits (esd_code, application_no);
alter table meter_cost_deposits enable row level security;

-- Purchase requisitions (PR) raised by each ESD.
create table if not exists meter_cost_pr (
  id bigserial primary key,
  esd_code text not null,
  pr_no text not null,
  pr_date date not null,
  kind text not null check (kind in ('new', 'replacement')),
  ph1 integer not null default 0,
  ph3 integer not null default 0,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists meter_cost_pr_no_idx on meter_cost_pr (pr_no);
create index if not exists meter_cost_pr_date_idx on meter_cost_pr (pr_date);
alter table meter_cost_pr enable row level security;
