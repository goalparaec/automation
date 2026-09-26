import { supabaseAdmin } from './supabaseAdmin.js';

const CHUNK_SIZE = 500;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Replaces all consumer-indexing rows for a date with freshly parsed ones. */
export async function replaceConsumerIndexingRows(reportDate, rows) {
  const db = supabaseAdmin();

  const { error: deleteError } = await db
    .from('consumer_indexing_rows')
    .delete()
    .eq('report_date', reportDate);
  if (deleteError) throw new Error(`Failed clearing previous rows: ${deleteError.message}`);

  const tagged = rows.map((r) => ({ ...r, report_date: reportDate }));
  let inserted = 0;
  for (const batch of chunk(tagged, CHUNK_SIZE)) {
    const { error } = await db.from('consumer_indexing_rows').insert(batch);
    if (error) throw new Error(`Insert failed: ${error.message}`);
    inserted += batch.length;
  }
  return inserted;
}

/** Appends rows without clearing existing ones for the date - used when
 * uploading multiple files one at a time for the same date (e.g. one file
 * per ESD, uploaded separately), so each new file adds to the set rather
 * than wiping out files already uploaded for that date. */
export async function appendConsumerIndexingRows(reportDate, rows) {
  const db = supabaseAdmin();
  const tagged = rows.map((r) => ({ ...r, report_date: reportDate }));
  let inserted = 0;
  for (const batch of chunk(tagged, CHUNK_SIZE)) {
    const { error } = await db.from('consumer_indexing_rows').insert(batch);
    if (error) throw new Error(`Insert failed: ${error.message}`);
    inserted += batch.length;
  }
  return inserted;
}

export async function clearConsumerIndexingDate(reportDate) {
  const db = supabaseAdmin();
  const { error } = await db.from('consumer_indexing_rows').delete().eq('report_date', reportDate);
  if (error) throw new Error(`Failed clearing rows: ${error.message}`);
}

export async function generateConsumerIndexingSummary(reportDate) {
  const db = supabaseAdmin();
  const { error } = await db.rpc('generate_consumer_indexing_summary', { p_date: reportDate });
  if (error) throw new Error(`generate_consumer_indexing_summary failed: ${error.message}`);
}

export async function recordConsumerIndexingUpload({ reportDate, filename, rowCount, excludedCount, unmappedCount, status, errorMessage }) {
  const db = supabaseAdmin();
  const { error } = await db.from('consumer_indexing_uploads').insert({
    report_date: reportDate,
    filename,
    row_count: rowCount,
    excluded_count: excludedCount,
    unmapped_count: unmappedCount,
    status,
    error_message: errorMessage ?? null,
  });
  if (error) throw new Error(`Failed to record upload: ${error.message}`);
}

const ESD_ORDER = ['Dhupdhara', 'Dudhnoi', 'Goalpara', 'Lakhipur', 'Mankachar', 'Unmapped', 'Circle Total'];

export async function getConsumerIndexingSummary(reportDate) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('consumer_indexing_summary')
    .select('*')
    .eq('report_date', reportDate);
  if (error) throw new Error(error.message);

  return (data ?? []).sort((a, b) => ESD_ORDER.indexOf(a.esd_name) - ESD_ORDER.indexOf(b.esd_name));
}

/** Latest report_date that has any consumer-indexing data, if any. */
export async function getLatestConsumerIndexingDate() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('consumer_indexing_rows')
    .select('report_date')
    .order('report_date', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0]?.report_date ?? null;
}
