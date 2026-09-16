# GpEC Daily Report — Web App

Replaces the daily "paste into Excel → screenshot → post to group" workflow
for 4 sheets: **BE_(Cons)**, **BE**, **CE_Postpaid**, and **CEO_Sir**.

You upload each of the 5 underlying report files separately as they come in
(`360_Daily`, `360_Cum`, `Converted`, `Prepaid_Bill`, `IRCA_Bill`) — no need
to paste them into one combined workbook first. Supabase then does the same
math the Excel formulas did, and keeps full daily history. Re-uploading a
file for a date replaces that date's data for that report, so corrections
never leave stale rows behind.

## 1. Run the database schema

If you haven't already: open your Supabase project → **SQL Editor** → paste
`schema.sql` (from our earlier step) → **Run**. This creates all tables,
the aggregation functions, and the triggers that auto-regenerate outputs.

## 2. Set up this repo in GitHub Codespaces

1. Create a new empty GitHub repository (no README/gitignore, so it stays empty).
2. Open it, click **Code → Codespaces → Create codespace on main**.
3. Once the codespace loads, extract this zip's contents directly into the
   repo root (drag-and-drop the extracted files into the Codespaces file
   explorer, or unzip via terminal: `unzip gpec-report-webapp.zip -d .`
   then move the files up if they land in a subfolder).
4. In the Codespaces terminal:
   ```bash
   npm install
   cp .env.example .env.local
   ```
5. Edit `.env.local` and fill in:
   - `SUPABASE_URL` — Supabase project → Settings → API → Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — same page → **service_role** key (not `anon`)
6. Test it locally inside the codespace:
   ```bash
   npm run dev
   ```
   Codespaces will prompt to open a forwarded port — open it, try
   **Upload**, and confirm a report renders.
7. Commit and push:
   ```bash
   git add .
   git commit -m "Initial GpEC report app"
   git push
   ```

## 3. Deploy to Vercel

1. Go to vercel.com → **Add New Project** → import the GitHub repo you just pushed.
2. Framework preset: Next.js (auto-detected).
3. Add environment variables (Project Settings → Environment Variables):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy. `vercel.json` already requests more memory/time for the upload
   route — if you're on the free Hobby plan and large uploads time out,
   upgrade the plan or increase `maxDuration` further (Hobby caps at 60s;
   Pro allows more).

## 4. Daily use

1. Once a month: open **Monthly Inputs**, enter energy injection (kWh),
   ghost consumer count, and BE target for each sub-division. These three
   values are hand-typed in the current Excel sheet too, so nothing changes
   there — you just type them here instead.
2. Every day: open **Upload**, pick the date, and upload each of the 5
   report files as they come in — separately, whenever each is ready. There
   is no need to combine them into one workbook first; each has its own
   upload slot (360 Daily, 360 Cumulative, Prepaid Converted, Prepaid
   Billing, IRCA Billing).
3. **Corrections**: if a file was uploaded wrong, just re-upload the correct
   one for the same date and report type. The app deletes the old rows for
   that date+report first, then stores the new ones — nothing stale is left
   behind, and the 4 outputs regenerate automatically using the corrected
   data.
4. Open **the report page** for that date to view/download:
   - Each table as a PNG image (same as your current screenshots)
   - All 4 sheets together as one Excel file
   - The CEO_Sir message as copyable text
5. History is kept — you can revisit any past date's report at any time.

## Notes & things to double check

- The workbook's raw data uses `"Bongaigaon"` as the circle name for what is
  actually Goalpara Electrical Circle — this is a quirk in the source
  export, not a bug. The SQL functions filter on `circle = 'Bongaigaon'` to
  match it. If the source system ever corrects this label, update it in
  `schema.sql`'s functions.
- ESD codes (38–42 mapped to the 5 sub-divisions) were read directly from
  the `BE` sheet's formulas — worth a quick sanity check against a current
  copy of the workbook.
- If the source system ever changes the header row position or column order
  in any of the 5 input sheets, update `lib/sheetConfig.js` accordingly —
  everything else (parsing, storage, calculations) reads from that one file.
- `output_ceo_sir`'s exact wording is a first draft matching the numbers
  the original sheet references (`CE_Postpaid!D10,G10,H10`) — tell me the
  literal current wording/format of your `CEO_Sir` sheet if you'd like it
  matched exactly, and I'll adjust `generate_output_ceo_sir` in the SQL.
