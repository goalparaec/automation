import { supabaseAdmin } from './supabaseAdmin.js';
import { SUB_DIVISIONS } from './sheetConfig.js';

const CHUNK_SIZE = 500;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Replaces all rows for one (table, report_date) with the freshly parsed
 * rows from the latest upload. Old rows for that date are deleted first, so
 * a corrected re-upload fully overwrites the previous attempt - no stale
 * rows left behind even if the corrected file has fewer rows than before.
 */
export async function replaceInputRows(table, reportDate, rows) {
  const db = supabaseAdmin();

  const { error: deleteError } = await db.from(table).delete().eq('report_date', reportDate);
  if (deleteError) {
    throw new Error(`Failed clearing previous ${table} rows for ${reportDate}: ${deleteError.message}`);
  }

  const tagged = rows.map((r) => ({ ...r, report_date: reportDate }));
  let inserted = 0;
  for (const batch of chunk(tagged, CHUNK_SIZE)) {
    const { error } = await db.from(table).insert(batch);
    if (error) throw new Error(`Insert into ${table} failed: ${error.message}`);
    inserted += batch.length;
  }
  return inserted;
}

/** Records one upload attempt in the audit table. */
export async function recordUpload({ reportDate, filename, fileSizeBytes, sheetsParsed, rowCounts, status, errorMessage }) {
  const db = supabaseAdmin();
  const { error } = await db.from('uploads').insert({
    report_date: reportDate,
    filename,
    file_size_bytes: fileSizeBytes,
    sheets_parsed: sheetsParsed,
    row_counts: rowCounts,
    status,
    error_message: errorMessage ?? null,
  });
  if (error) throw new Error(`Failed to record upload: ${error.message}`);
}

/** Runs the SQL function that (re)builds all 4 output tables for one date. */
export async function generateAllOutputs(reportDate) {
  const db = supabaseAdmin();
  const { error } = await db.rpc('generate_all_outputs', { p_date: reportDate });
  if (error) throw new Error(`generate_all_outputs failed: ${error.message}`);
}

function sortBySubDivision(rows) {
  const order = [...SUB_DIVISIONS, 'Goalpara ED', 'Circle Total'];
  return [...rows].sort((a, b) => order.indexOf(a.sub_division) - order.indexOf(b.sub_division));
}

/** Fetches the 4 generated outputs for one date, ready for the dashboard. */
export async function getReportForDate(reportDate) {
  const db = supabaseAdmin();

  const [beCons, be, cePostpaid, ceoSir] = await Promise.all([
    db.from('output_be_cons').select('*').eq('report_date', reportDate),
    db.from('output_be').select('*').eq('report_date', reportDate),
    db.from('output_ce_postpaid').select('*').eq('report_date', reportDate),
    db.from('output_ceo_sir').select('*').eq('report_date', reportDate).maybeSingle(),
  ]);

  for (const res of [beCons, be, cePostpaid, ceoSir]) {
    if (res.error) throw new Error(res.error.message);
  }

  return {
    reportDate,
    beCons: sortBySubDivision(beCons.data ?? []),
    be: sortBySubDivision(be.data ?? []),
    cePostpaid: sortBySubDivision(cePostpaid.data ?? []),
    ceoSir: ceoSir.data ?? null,
  };
}

/** Fetches manual monthly inputs (energy injection, ghost consumers, BE target). */
export async function getManualInputs(reportMonth) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('manual_monthly_inputs')
    .select('sub_division_id, energy_injection_kwh, ghost_consumers, be_target, sub_divisions(name, sort_order)')
    .eq('report_month', reportMonth);
  if (error) throw new Error(error.message);

  const bySubDivision = {};
  for (const row of data ?? []) {
    bySubDivision[row.sub_divisions.name] = {
      energy_injection_kwh: row.energy_injection_kwh,
      ghost_consumers: row.ghost_consumers,
      be_target: row.be_target,
    };
  }
  return bySubDivision;
}

/** Upserts one month's manual inputs for all 5 sub-divisions at once. */
export async function upsertManualInputs(reportMonth, valuesBySubDivision) {
  const db = supabaseAdmin();

  const { data: subs, error: subsErr } = await db.from('sub_divisions').select('id, name');
  if (subsErr) throw new Error(subsErr.message);
  const idByName = Object.fromEntries(subs.map((s) => [s.name, s.id]));

  const rows = Object.entries(valuesBySubDivision).map(([name, v]) => ({
    report_month: reportMonth,
    sub_division_id: idByName[name],
    energy_injection_kwh: v.energy_injection_kwh,
    ghost_consumers: v.ghost_consumers,
    be_target: v.be_target,
  }));

  const { error } = await db
    .from('manual_monthly_inputs')
    .upsert(rows, { onConflict: 'report_month,sub_division_id' });
  if (error) throw new Error(`Failed to save manual inputs: ${error.message}`);
}

/** Lists report_dates that have at least one uploaded input, most recent first. */
export async function listAvailableReportDates(limit = 30) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('input_360_cum')
    .select('report_date')
    .order('report_date', { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);
  const unique = [...new Set((data ?? []).map((r) => r.report_date))];
  return unique.slice(0, limit);
}
