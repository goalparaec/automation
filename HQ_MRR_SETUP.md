# HQ MRR module - setup and use

Builds HQ's BE / CE figures for the 5 ESDs and the circle from the **category-wise commercial MRR**
(the HQ-format file with sheet "Smart Prepaid Converted Data"), one file per ESD.

## One-time setup
1. Supabase -> SQL editor -> run **schema_hq_mrr.sql** (safe to re-run; creates 3 new tables, touches nothing else).
2. Deploy the files (see the file list at the end). No new packages are needed.

## Each month
1. Open **HQ MRR -> Upload MRR files**, pick the MRR month.
2. Choose the commercial MRR file against each ESD (you can do one ESD at a time; a new file replaces the old one).
3. Choose the circle's **IRCA ESD-wise MRR** once (the file with ESD codes 000-042+). Its Unit Billed for ESD codes 038-042 (Dhupdhara, Dudhnoi, Goalpara, Lakhipur, Mankachar) is added to each ESD's units for Billing Efficiency. Nothing is typed by hand.
4. Energy injection is taken from the **Monthly Inputs** page - it must be entered there for the same month.
5. Save. Open **HQ MRR** to see the circle table, each ESD's summary and the category-wise table.
   **Download Excel** gives: Circle Summary, ESD Summary, Category - Circle, one category-wise sheet per ESD (each with a Short twin),
   and "MRR (HQ format)" (all 5 ESDs in HQ's ESD MRR layout, energy in MU and money in Rs lakhs).

## Short versions, printing and images
- Every report has a **short** version beside the full one. On the page use **Show short version**; in the Excel each full sheet has a "(Short)" twin.
- The columns the short versions leave out are two lists in `lib/hqMrrTrim.js`. Short category tables also leave out categories that have nothing in them.
- Wide tables are cut into several narrower tables stacked one below the other, with the ESDs and the Circle total as rows (Circle Summary, category-wise tables). The same layout is used on the page and in the Excel.
- "ESD Summary" lists the fields down the page with one column per ESD and the circle; it prints in portrait. All other summary sheets print landscape. Everything is A4; the zoom is set per sheet so the print stays readable, and heading rows repeat on every page.
- **Download image** (on the page) saves the table or tables above it as a PNG.

## Safety checks on upload
- Nothing is saved unless every chosen file can be read.
- The month inside the file must equal the month you chose.
- The same file in two ESD slots (or a file identical to another saved ESD) is refused.
- The file's own totals are checked (Total Demand, Total Collection, Grand Total Collection) and any mismatch is shown.

## Formulas (same as HQ's circle sheets)
- Billing efficiency = (ESD units + IRCA units) / energy injected
- Collection efficiency = Grand total collection / Current demand (ESD only, IRCA excluded)
- Total current collection = Current collection + Govt adjustment + Non cash + Govt subsidy + Tariff adjustment
- Grand total collection = Total current collection + Arrear collection
- % Realisation: current = total current collection / current demand; arrear = arrear collection / arrear demand; total = grand / total demand
- Arrear at end of month: Freeze & PDC = PDC arrear + Freeze arrear; Regular = Regular+TDC arrear
- Days receivable = arrear / current demand x 30 (Excl. PDC & Freeze uses the Regular arrear only)
- AT&C loss = 1 - BE x CE; Average billing rate = current demand / units billed; ARR = BE x CE x ABR
- Required for 100% CE = Current demand - Grand total collection (negative = already above 100%)

## Files
- schema_hq_mrr.sql
- lib/hqMrrCore.js, hqMrrColumns.js, hqMrrTrim.js, hqMrrDb.js, hqMrrExcelExport.js, hqMrrCore.test.mjs
- app/hq-mrr/page.js, HqTables.jsx, DownloadImageButton.jsx, upload/page.js, upload/HqMrrUpload.jsx
- app/api/hq-mrr/upload/route.js, app/api/hq-mrr/excel/route.js
- app/layout.js (adds the "HQ MRR" menu link)
