-- Overall CE: two more monthly amounts not reflected in ARMS (Conventional Prepaid Collection and Temporary).
-- Run once in the Supabase SQL editor. The normal Overall CE report keeps working before and after this.
alter table overall_ce_monthly_inputs add column if not exists conv_prepaid_amount numeric not null default 0;
alter table overall_ce_monthly_inputs add column if not exists temporary_amount numeric not null default 0;

notify pgrst, 'reload schema';
