import { supabaseAdmin } from './supabaseAdmin.js';
import { SUB_DIVISIONS } from './sheetConfig.js';

const CHUNK_SIZE = 500;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Replaces one ESD's rows for a date - other ESDs' rows for that same
 * date are left untouched, since each ESD is uploaded independently. */
export async function replaceConsumerIndexingRowsForEsd(reportDate, esdName, rows) {
  const db = supabaseAdmin();

  const { error: deleteError } = await db
    .from('consumer_indexing_rows')
    .delete()
    .eq('report_date', reportDate)
    .eq('esd_name', esdName);
  if (deleteError) throw new Error(`Failed clearing previous ${esdName} rows: ${deleteError.message}`);

  const tagged = rows.map((r) => ({ ...r, report_date: reportDate }));
  let inserted = 0;
  for (const batch of chunk(tagged, CHUNK_SIZE)) {
    const { error } = await db.from('consumer_indexing_rows').insert(batch);
    if (error) throw new Error(`Insert failed: ${error.message}`);
    inserted += batch.length;
  }
  return inserted;
}

export async function generateConsumerIndexingSummary(reportDate) {
  const db = supabaseAdmin();
  const { error } = await db.rpc('generate_consumer_indexing_summary', { p_date: reportDate });
  if (error) throw new Error(`generate_consumer_indexing_summary failed: ${error.message}`);
}

export async function recordConsumerIndexingUpload({ reportDate, esdName, filename, rowCount, excludedCount, status, errorMessage }) {
  const db = supabaseAdmin();
  const { error } = await db.from('consumer_indexing_uploads').insert({
    report_date: reportDate,
    esd_name: esdName,
    filename,
    row_count: rowCount,
    excluded_count: excludedCount,
    status,
    error_message: errorMessage ?? null,
  });
  if (error) throw new Error(`Failed to record upload: ${error.message}`);
}

/** Which of the 5 ESDs have a successful upload for this date - the
 * report only becomes available once every one of them does. Also
 * returns when the most recent of those uploads happened (the report's
 * "last updated" time - re-uploading any ESD later moves it forward). */
export async function getUploadedEsdCoverage(reportDate) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('consumer_indexing_uploads')
    .select('esd_name, uploaded_at')
    .eq('report_date', reportDate)
    .eq('status', 'success');
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const covered = [...new Set(rows.map((r) => r.esd_name))];
  const missing = SUB_DIVISIONS.filter((name) => !covered.includes(name));
  const lastUpdated = rows.reduce(
    (max, r) => (!max || new Date(r.uploaded_at) > new Date(max) ? r.uploaded_at : max),
    null
  );
  return { covered, missing, isComplete: missing.length === 0, lastUpdated };
}

const SUMMARY_ORDER = ['Dhupdhara', 'Dudhnoi', 'Goalpara', 'Lakhipur', 'Mankachar', 'Circle Total'];

export async function getConsumerIndexingSummary(reportDate) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('consumer_indexing_summary')
    .select('*')
    .eq('report_date', reportDate);
  if (error) throw new Error(error.message);

  return (data ?? []).sort((a, b) => SUMMARY_ORDER.indexOf(a.esd_name) - SUMMARY_ORDER.indexOf(b.esd_name));
}

/** Every date that has a successful upload for all 5 ESDs, newest first,
 * with when each was last updated. Completed reports stay in this list -
 * they are never removed, so any past report can be reopened, and the
 * first entry is always the latest one. */
export async function listCompleteReports() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('consumer_indexing_uploads')
    .select('report_date, esd_name, uploaded_at')
    .eq('status', 'success')
    .order('report_date', { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);

  const byDate = {};
  for (const row of data ?? []) {
    const entry = byDate[row.report_date] ?? (byDate[row.report_date] = { esds: new Set(), lastUpdated: null });
    entry.esds.add(row.esd_name);
    if (!entry.lastUpdated || new Date(row.uploaded_at) > new Date(entry.lastUpdated)) {
      entry.lastUpdated = row.uploaded_at;
    }
  }

  return Object.entries(byDate)
    .filter(([, e]) => SUB_DIVISIONS.every((name) => e.esds.has(name)))
    .map(([date, e]) => ({ date, lastUpdated: e.lastUpdated }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Most recent date with all 5 ESDs uploaded, or null. */
export async function getLatestCompleteReportDate() {
  const reports = await listCompleteReports();
  return reports[0]?.date ?? null;
}
