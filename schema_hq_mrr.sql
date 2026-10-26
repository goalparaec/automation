-- HQ MRR module. Safe to re-run: create-if-not-exists throughout, and it never
-- drops or changes any existing table. Run once in the Supabase SQL editor.

-- One row per ESD x tariff category x month: the category-wise commercial MRR
-- exactly as uploaded (all 25 numeric columns kept in `data`).
create table if not exists hq_mrr_rows (
  report_month date not null,          -- always the 1st of the MRR month
  esd text not null,
  category_code text not null,
  category_name text,
  data jsonb not null,
  primary key (report_month, esd, category_code)
);
alter table hq_mrr_rows enable row level security;

-- Which file was loaded for which ESD and month (a re-upload replaces it).
create table if not exists hq_mrr_uploads (
  report_month date not null,
  esd text not null,
  file_name text,
  uploaded_at timestamptz not null default now(),
  primary key (report_month, esd)
);
alter table hq_mrr_uploads enable row level security;

-- IRCA ESD-wise MRR rows of this circle's 5 ESDs (HQ adds the IRCA units billed
-- to the ESD's units for Billing Efficiency). Loaded from the IRCA MRR file.
create table if not exists hq_mrr_irca (
  report_month date not null,
  esd text not null,
  units_kwh numeric not null default 0,
  data jsonb,
  file_name text,
  uploaded_at timestamptz not null default now(),
  primary key (report_month, esd)
);
alter table hq_mrr_irca enable row level security;

notify pgrst, 'reload schema';
