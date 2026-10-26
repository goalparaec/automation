# Meter Cost Record - setup

1. Supabase -> SQL Editor -> paste `schema_meter_cost.sql` -> Run. (Safe to run twice.)
2. GitHub (web UI) -> add each file below at the same path (Add file -> Create new file, paste the content), and replace `app/layout.js`.
3. Commit; Vercel deploys. No environment variable changes.
4. Open /meter-cost -> "Upload deposit files". Upload April to August head-wise files first (one by one is fine).
   - 0 and 2,400 are ignored automatically.
   - A different amount is shown for your decision: Approve/Add, or Reject/Delete.
   - Rejected rows are stored as "ignored" so a re-upload will not ask again (Records page lets you count or delete them).
5. Add PRs under "Add/view PR". The Deposits-vs-PR status updates immediately.

Counting rule: New = NEW SERVICE CONNECTION METER COST; Replacement = METER COST BILL / CHANGED PROCESS METER COST; 6490 = 1-Ph, 9047 = 3-Ph; month = payment date; ESD = first 3 digits of consumer number.

Not tested here: Next build, Excel download. First real test is the Vercel preview.
