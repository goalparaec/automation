-- PRs are now a plain total (the PR is also the issue to the ESD), so the
-- New / Replacement tag is no longer required. Existing PRs, counts, dates and
-- notes are untouched; the old tag stays stored but is no longer used.
-- Safe to re-run.
alter table meter_cost_pr alter column kind drop not null;

notify pgrst, 'reload schema';
