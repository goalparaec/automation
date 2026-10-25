# Overall CE module - setup

1. Run `schema_overall_ce.sql` once in the Supabase SQL editor (adds 2 new tables; changes nothing existing).
2. No new packages and no new environment variables.
3. `node lib/overallCeCore.test.mjs` runs the calculation test (6 checks against the CE_All sheet).
4. Open /overall-ce (nav link "Overall CE").

New files: app/overall-ce/**, app/api/overall-ce/**, lib/overallCe*.js, lib/overallCeCore.test.mjs, schema_overall_ce.sql
Changed file: app/layout.js (one nav link added)
