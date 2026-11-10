-- HQ MRR: Solar Unit Adjustment per ESD per month, taken from each ESD's
-- consumer-wise MRR. Safe to re-run; creates one new table and changes nothing else.
-- Run once in the Supabase SQL editor (after schema_hq_mrr.sql).
create table if not exists hq_mrr_solar (
  report_month date not null,          -- always the 1st of the MRR month
  esd text not null,
  solar_kwh numeric not null default 0, -- total Solar Unit Adjustment of the ESD, in kWh
  consumers integer,                    -- consumer rows read from the file
  source_column text,                   -- header the figure was read from
  file_name text,
  uploaded_at timestamptz not null default now(),
  primary key (report_month, esd)
);
alter table hq_mrr_solar enable row level security;

notify pgrst, 'reload schema';
