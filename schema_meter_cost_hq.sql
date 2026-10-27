-- Meter Cost: HQ requisition, HQ supply and issue to ESD. Safe to re-run:
-- create-if-not-exists only, never drops or changes existing data.

-- Requisitions the circle submits to HQ (circle level).
create table if not exists meter_cost_hq_req (
  id bigserial primary key,
  req_no text not null,
  req_date date not null,
  kind text not null check (kind in ('new', 'replacement')),
  ph1 integer not null default 0,
  ph3 integer not null default 0,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists meter_cost_hq_req_date_idx on meter_cost_hq_req (req_date);
alter table meter_cost_hq_req enable row level security;

-- Meters received from HQ (circle level). req_no links a receipt to a requisition.
create table if not exists meter_cost_hq_supply (
  id bigserial primary key,
  ref_no text not null,
  supply_date date not null,
  req_no text,
  kind text not null check (kind in ('new', 'replacement')),
  ph1 integer not null default 0,
  ph3 integer not null default 0,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists meter_cost_hq_supply_date_idx on meter_cost_hq_supply (supply_date);
alter table meter_cost_hq_supply enable row level security;

-- Meters issued by the circle to each ESD.
create table if not exists meter_cost_issue (
  id bigserial primary key,
  esd_code text not null,
  issue_no text not null,
  issue_date date not null,
  kind text not null check (kind in ('new', 'replacement')),
  ph1 integer not null default 0,
  ph3 integer not null default 0,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists meter_cost_issue_date_idx on meter_cost_issue (issue_date);
alter table meter_cost_issue enable row level security;

notify pgrst, 'reload schema';
