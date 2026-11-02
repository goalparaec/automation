-- Meter Cost: Issue Register (meters actually issued to each ESD, 1-Ph / 3-Ph only).
-- Safe to re-run. If you already ran schema_meter_cost_hq.sql this table exists and nothing changes.
create table if not exists meter_cost_issue (
  id bigserial primary key,
  esd_code text not null,
  issue_no text not null,
  issue_date date not null,
  ph1 integer not null default 0,
  ph3 integer not null default 0,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists meter_cost_issue_date_idx on meter_cost_issue (issue_date);
alter table meter_cost_issue enable row level security;
alter table meter_cost_issue drop column if exists kind;

notify pgrst, 'reload schema';
