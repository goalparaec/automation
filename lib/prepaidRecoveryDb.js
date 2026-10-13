import { supabaseAdmin } from './supabaseAdmin';
import { ensureSerials, buildStillUnpaidTracker } from './prepaidRecoveryCore';

const isoDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

const CHUNK_SIZE = 1000;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const PAGE_SIZE = 1000; // Supabase/PostgREST silently caps a single response at 1000 rows

/** Read EVERY row of a query, not just the first 1000. `makeQuery` must return
 * a fresh query builder each call (filters + a stable ordering that ends in a
 * unique column such as id, so pages never overlap or skip rows). */
async function fetchAll(makeQuery) {
  // Read the first page; if it was full, read the following pages 6 at a time
  // in parallel until one comes back short (sequential paging of 20k+ rows
  // is slow enough to hit serverless time limits).
  const first = await makeQuery().range(0, PAGE_SIZE - 1);
  if (first.error) throw first.error;
  const pages = [first.data];
  if (first.data.length < PAGE_SIZE) return first.data;
  const GROUP = 6;
  for (let g = 1; ; g += GROUP) {
    const group = await Promise.all(Array.from({ length: GROUP }, async (_, i) => {
      const from = (g + i) * PAGE_SIZE;
      const { data, error } = await makeQuery().range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return data;
    }));
    pages.push(...group);
    if (group.some((d) => d.length < PAGE_SIZE)) break;
  }
  return pages.flat();
}

export async function getEsdMap() {
  const db = supabaseAdmin();
  const { data, error } = await db.from('prepaid_recovery_esd_map').select('*').order('esd_code');
  if (error) throw error;
  const map = {};
  for (const row of data) map[row.esd_code] = row.esd_label;
  return map;
}

export async function upsertEsdLabel(esdCode, esdLabel) {
  const db = supabaseAdmin();
  const { error } = await db
    .from('prepaid_recovery_esd_map')
    .upsert({ esd_code: esdCode, esd_label: esdLabel, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** Replace everything for one ESD on one report date: summary row, call
 * list rows, and payments rows. This is what the upload API calls once per
 * ESD after the browser has parsed & classified that ESD's file. */
export async function replacePrepaidRecoveryForEsd({
  reportDate, esdCode, esdLabel, summary, callListRows, paymentsRows, excludedRows, analysis, uploadedBy,
}) {
  const db = supabaseAdmin();

  const { error: summaryErr } = await db.from('prepaid_recovery_summary').upsert({
    report_date: reportDate,
    esd_code: esdCode,
    esd_label: esdLabel,
    band_3_6: summary.band36,
    band_6_12: summary.band612,
    band_above_1y: summary.bandAbove1y,
    band_no_payment: summary.bandNoPayment,
    call_list_total: summary.callListTotal,
    neg_band_3_6: summary.negBand36,
    neg_band_6_12: summary.negBand612,
    neg_band_above_1y: summary.negBandAbove1y,
    neg_band_no_payment: summary.negBandNoPayment,
    neg_total: summary.negTotal,
    no_phone_excluded: summary.noPhoneExcluded,
    good_standing_count: summary.goodStandingCount,
    paid_since_count: summary.paidSinceCount,
    paid_since_amount: summary.paidSinceAmount,
    paid_from_date: summary.paidFromDate,
    rows_in_report: summary.rows,
    latest_last_payment_date: summary.latestLastPaymentDate,
    stale_warning: summary.staleWarning,
    uploaded_at: new Date().toISOString(),
    uploaded_by: uploadedBy || null,
  }, { onConflict: 'report_date,esd_code' });
  if (summaryErr) throw summaryErr;

  const { error: delCallErr } = await db
    .from('prepaid_recovery_calllist')
    .delete()
    .eq('report_date', reportDate)
    .eq('esd_code', esdCode);
  if (delCallErr) throw delCallErr;

  const { error: delPayErr } = await db
    .from('prepaid_recovery_payments')
    .delete()
    .eq('report_date', reportDate)
    .eq('esd_code', esdCode);
  if (delPayErr) throw delPayErr;

  const { error: delExclErr } = await db
    .from('prepaid_recovery_excluded')
    .delete()
    .eq('report_date', reportDate)
    .eq('esd_code', esdCode);
  if (delExclErr) throw delExclErr;

  // Serial numbers: 1 = largest negative balance in this ESD. Fixed at upload
  // time so "ESD Goalpara, serial 1-500" always means the same people.
  const numbered = [...callListRows].sort(
    (a, b) => (a.balance ?? 0) - (b.balance ?? 0) || String(a.consumerNo).localeCompare(String(b.consumerNo)),
  );
  const callRows = numbered.map((r, i) => ({
    report_date: reportDate,
    esd_code: esdCode,
    serial_no: i + 1,
    consumer_no: r.consumerNo,
    consumer_name: r.consumerName,
    category_name: r.categoryName,
    connection_status: r.connectionStatus,
    phone_no: r.phoneNo,
    last_payment_date: isoDate(r.lastPaymentDate),
    balance: r.balance,
    band: r.band,
  }));
  for (const batch of chunk(callRows, CHUNK_SIZE)) {
    if (batch.length === 0) continue;
    const { error } = await db.from('prepaid_recovery_calllist').insert(batch);
    if (error) throw error;
  }

  const payRows = paymentsRows.map((r) => ({
    report_date: reportDate,
    esd_code: esdCode,
    consumer_no: r.consumerNo,
    consumer_name: r.consumerName,
    category_name: r.categoryName,
    paid_amount: r.paidAmount,
    paid_date: isoDate(r.paidDate),
    balance_now: r.balanceNow,
    paid_when: 'since_last',
  }));
  for (const batch of chunk(payRows, CHUNK_SIZE)) {
    if (batch.length === 0) continue;
    const { error } = await db.from('prepaid_recovery_payments').insert(batch);
    if (error) throw error;
  }

  const exclRows = (excludedRows || []).map((r) => ({
    report_date: reportDate,
    esd_code: esdCode,
    consumer_no: r.consumerNo,
    consumer_name: r.consumerName,
    category_name: r.categoryName,
    connection_status: r.connectionStatus,
    phone_no: r.phoneNo,
    balance: r.balance,
    reason_category: r.reasonCategory,
    reason_detail: r.reasonDetail,
    last_payment_date: isoDate(r.lastPaymentDate),
    last_payment_amount: r.lastPaymentAmount ?? null,
    paid_since_last: !!r.paidSinceLast,
  }));
  for (const batch of chunk(exclRows, CHUNK_SIZE)) {
    if (batch.length === 0) continue;
    const { error } = await db.from('prepaid_recovery_excluded').insert(batch);
    if (error) throw error;
  }

  if (analysis) {
    const { error: anErr } = await db.from('prepaid_recovery_analysis').upsert({
      report_date: reportDate, esd_code: esdCode, analysis, uploaded_at: new Date().toISOString(),
    }, { onConflict: 'report_date,esd_code' });
    if (anErr) throw anErr;
  }

  if (esdLabel) await upsertEsdLabel(esdCode, esdLabel);

  await pruneOldReportDates();
}

/** Good-standing rows (eligible consumers who simply aren't a defaulter
 * right now) are sent by the client in small chunks, since a single ESD can
 * have 50k+ of them — far too much for one request body. Call with
 * isFirstChunk true on the first chunk of an ESD's upload to clear out any
 * previous data for that (date, esd) before appending; later chunks append. */
export async function replaceGoodStandingChunk({ reportDate, esdCode, rows, isFirstChunk }) {
  const db = supabaseAdmin();

  if (isFirstChunk) {
    const { error: delErr } = await db
      .from('prepaid_recovery_good_standing')
      .delete()
      .eq('report_date', reportDate)
      .eq('esd_code', esdCode);
    if (delErr) throw delErr;
  }

  const insertRows = (rows || []).map((r) => ({
    report_date: reportDate,
    esd_code: esdCode,
    consumer_no: r.consumerNo,
    consumer_name: r.consumerName,
    category_name: r.categoryName,
    balance: r.balance,
    last_payment_date: isoDate(r.lastPaymentDate),
    last_payment_amount: r.lastPaymentAmount ?? null,
    skip_reason: r.skipReason,
  }));
  for (const batch of chunk(insertRows, CHUNK_SIZE)) {
    if (batch.length === 0) continue;
    const { error } = await db.from('prepaid_recovery_good_standing').insert(batch);
    if (error) throw error;
  }
}

/** Paginated search over good-standing consumers — never loaded in full,
 * since there can be 200k+ of them for a single date. */
export async function searchGoodStanding({ reportDate, esdCode, q, offset = 0, limit = 300 }) {
  const db = supabaseAdmin();
  let query = db
    .from('prepaid_recovery_good_standing')
    .select('*', { count: 'exact' })
    .eq('report_date', reportDate);
  if (esdCode) query = query.eq('esd_code', esdCode);
  if (q && q.trim()) {
    const term = q.trim();
    query = query.or(`consumer_no.ilike.%${term}%,consumer_name.ilike.%${term}%`);
  }
  query = query.order('consumer_no').range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data, total: count ?? data.length };
}

/** Keep only the most recent `keep` report dates (2 by default: "today"
 * and "yesterday") across the per-date tables, since good-standing volume
 * especially would otherwise grow without bound. Remarks and the ESD label
 * map are untouched — they're keyed by consumer/ESD, not by date. */
export async function pruneOldReportDates(keep = 2) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('prepaid_recovery_summary')
    .select('report_date')
    .order('report_date', { ascending: false });
  if (error) throw error;

  const dates = [...new Set(data.map((d) => d.report_date))];
  if (dates.length <= keep) return;
  const keepDates = dates.slice(0, keep);
  const dropDates = dates.slice(keep);

  for (const table of ['prepaid_recovery_summary', 'prepaid_recovery_calllist', 'prepaid_recovery_payments',
    'prepaid_recovery_excluded', 'prepaid_recovery_good_standing', 'prepaid_recovery_analysis']) {
    const { error: delErr } = await db.from(table).delete().in('report_date', dropDates);
    if (delErr) throw delErr;
  }

  return { keepDates, dropDates };
}

export async function getExcludedForDate(reportDate) {
  const db = supabaseAdmin();
  return fetchAll(() => db
    .from('prepaid_recovery_excluded')
    .select('*')
    .eq('report_date', reportDate)
    .order('reason_category')
    .order('id'));
}

/** Most recent report date strictly before the given one, or null if there
 * isn't one. Used to build the day-over-day still-unpaid tracker. */
export async function getPreviousReportDate(reportDate) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('prepaid_recovery_summary')
    .select('report_date')
    .lt('report_date', reportDate)
    .order('report_date', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data.length > 0 ? data[0].report_date : null;
}

/** Lean call-list fetch for the tracker comparison: just enough fields to
 * display plus the join key (consumer_no + esd_code). */
export async function getCallListKeysForDate(reportDate) {
  const db = supabaseAdmin();
  const data = await fetchAll(() => db
    .from('prepaid_recovery_calllist')
    .select('consumer_no, esd_code, consumer_name, balance, band')
    .eq('report_date', reportDate)
    .order('id'));
  return data.map((r) => ({
    consumerNo: r.consumer_no, esdCode: r.esd_code, consumerName: r.consumer_name,
    balance: r.balance, band: r.band,
  }));
}

export async function getPaymentsKeysForDate(reportDate) {
  const db = supabaseAdmin();
  const data = await fetchAll(() => db
    .from('prepaid_recovery_payments')
    .select('consumer_no, esd_code')
    .eq('report_date', reportDate)
    .order('id'));
  return data.map((r) => ({ consumerNo: r.consumer_no, esdCode: r.esd_code }));
}

export async function getSummaryForDate(reportDate) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('prepaid_recovery_summary')
    .select('*')
    .eq('report_date', reportDate)
    .order('esd_code');
  if (error) throw error;
  return data;
}

/** Stored analysis aggregates, one entry per ESD: { esd_code: analysisJson }. */
export async function getAnalysisForDate(reportDate) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('prepaid_recovery_analysis')
    .select('esd_code, analysis')
    .eq('report_date', reportDate)
    .order('esd_code');
  if (error) throw error;
  const out = {};
  for (const r of data) out[r.esd_code] = r.analysis;
  return out;
}

export async function getPaymentsForDate(reportDate) {
  const db = supabaseAdmin();
  return fetchAll(() => db
    .from('prepaid_recovery_payments')
    .select('*')
    .eq('report_date', reportDate)
    .order('paid_amount', { ascending: false })
    .order('id'));
}

/** Call list for a date (every row, ordered ESD then serial), left-joined
 * with the latest remark per consumer. */
export async function getCallListForDate(reportDate) {
  const db = supabaseAdmin();
  let rows;
  try {
    rows = await fetchAll(() => db
      .from('prepaid_recovery_calllist')
      .select('*')
      .eq('report_date', reportDate)
      .order('esd_code')
      .order('serial_no', { ascending: true, nullsFirst: false })
      .order('id'));
  } catch (err) {
    // serial_no column missing (schema update not run yet): still show the list.
    rows = await fetchAll(() => db
      .from('prepaid_recovery_calllist')
      .select('*')
      .eq('report_date', reportDate)
      .order('esd_code')
      .order('balance', { ascending: true })
      .order('id'));
  }
  if (rows.length === 0) return [];
  ensureSerials(rows); // rows uploaded before serial numbers existed get them on the fly
  rows.sort((a, b) => String(a.esd_code).localeCompare(String(b.esd_code)) || a.serial_no - b.serial_no);

  // The remarks table is small (one row per consumer ever remarked on), so
  // read it whole instead of a huge IN (...) filter that can overflow the URL.
  const remarks = await fetchAll(() => db
    .from('prepaid_recovery_remarks')
    .select('*')
    .order('consumer_no')
    .order('esd_code'));
  const remarksByConsumer = {};
  for (const r of remarks) remarksByConsumer[`${r.consumer_no}|${r.esd_code}`] = r.remark;

  return rows.map((r) => ({ ...r, remark: remarksByConsumer[`${r.consumer_no}|${r.esd_code}`] || '' }));
}

export async function listAvailableDates() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('prepaid_recovery_summary')
    .select('report_date')
    .order('report_date', { ascending: false });
  if (error) throw error;
  return [...new Set(data.map((d) => d.report_date))];
}

export async function getEsdCoverageForDate(reportDate) {
  const db = supabaseAdmin();
  const map = await getEsdMap();
  const { data, error } = await db
    .from('prepaid_recovery_summary')
    .select('esd_code, uploaded_at')
    .eq('report_date', reportDate);
  if (error) throw error;
  const covered = data.map((d) => d.esd_code);
  const missing = Object.keys(map).filter((c) => !covered.includes(c));
  return { covered, missing, isComplete: missing.length === 0, map };
}

export async function upsertRemark(consumerNo, esdCode, remark, updatedBy) {
  const db = supabaseAdmin();
  const { error } = await db.from('prepaid_recovery_remarks').upsert({
    consumer_no: consumerNo,
    esd_code: esdCode,
    remark,
    updated_by: updatedBy || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'consumer_no,esd_code' });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Telecalling allotments
// ---------------------------------------------------------------------------

/** Create an allotment: snapshot the call-list consumers of one ESD whose
 * serial number is within [fromSerial, toSerial] on the given report date. */
export async function createAllotment({ reportDate, esdCode, fromSerial, toSerial, label }) {
  const db = supabaseAdmin();
  // Read the ESD's whole call list and number it the same way the screen does,
  // so this works even for reports uploaded before serial numbers existed.
  const all = await fetchAll(() => db
    .from('prepaid_recovery_calllist')
    .select('serial_no, consumer_no, consumer_name, phone_no, band, balance, esd_code')
    .eq('report_date', reportDate)
    .eq('esd_code', esdCode)
    .order('id'));
  ensureSerials(all);
  const rows = all
    .filter((r) => r.serial_no >= fromSerial && r.serial_no <= toSerial)
    .sort((a, b) => a.serial_no - b.serial_no);
  if (rows.length === 0) {
    throw new Error(`No call-list consumers found for that ESD with Sr. No. ${fromSerial}-${toSerial} on this report `
      + `(this ESD has ${all.length} consumers on its call list).`);
  }
  const { data: allot, error } = await db.from('prepaid_recovery_allotments').insert({
    label, esd_code: esdCode, from_serial: fromSerial, to_serial: toSerial,
    allotted_on: reportDate, consumer_count: rows.length,
  }).select().single();
  if (error) throw error;

  const items = rows.map((r) => ({
    allotment_id: allot.id, esd_code: esdCode, serial_no: r.serial_no, consumer_no: r.consumer_no,
    consumer_name: r.consumer_name, phone_no: r.phone_no, band: r.band, balance: r.balance,
  }));
  for (const batch of chunk(items, CHUNK_SIZE)) {
    const { error: itemErr } = await db.from('prepaid_recovery_allotment_items').insert(batch);
    if (itemErr) throw itemErr;
  }
  return allot;
}

export async function deleteAllotment(id) {
  const db = supabaseAdmin();
  const { error } = await db.from('prepaid_recovery_allotments').delete().eq('id', id); // items cascade
  if (error) throw error;
}

/** Evaluate every allotment against a later report. The allotted consumers
 * were saved when the allotment was made, so serial numbers changing between
 * reports does not matter. For each consumer, on `reportDate`:
 *   Paid            - recharged since allotment: in this report's paid list,
 *                     or in good standing with a last payment on/after the
 *                     allotment date
 *   Balance cleared - no longer a defaulter although no payment after the
 *                     allotment date is recorded (balance back above the
 *                     threshold, e.g. an adjustment)
 *   Still unpaid    - still on this report's call list
 *   Not in report   - none of the above (now excluded, disconnected, ...)
 * Allotments made ON the report date itself are returned with pending=true. */
export async function evaluateAllotments(reportDate, onlyId = null) {
  const db = supabaseAdmin();
  let allotments = await fetchAll(() => db
    .from('prepaid_recovery_allotments').select('*').order('allotted_on', { ascending: false }).order('id'));
  if (onlyId != null) allotments = allotments.filter((a) => String(a.id) === String(onlyId));
  const results = [];
  const esdPayments = {};
  const esdCalls = {};

  for (const a of allotments) {
    if (a.allotted_on >= reportDate) {
      results.push({ allotment: a, pending: true, items: [] });
      continue;
    }
    const items = await fetchAll(() => db
      .from('prepaid_recovery_allotment_items').select('*').eq('allotment_id', a.id).order('serial_no').order('id'));

    if (!esdPayments[a.esd_code]) {
      const pays = await fetchAll(() => db.from('prepaid_recovery_payments')
        .select('consumer_no, paid_amount, paid_date').eq('report_date', reportDate).eq('esd_code', a.esd_code).order('id'));
      esdPayments[a.esd_code] = new Map(pays.map((p) => [p.consumer_no, p]));
      const calls = await fetchAll(() => db.from('prepaid_recovery_calllist')
        .select('consumer_no, balance').eq('report_date', reportDate).eq('esd_code', a.esd_code).order('id'));
      esdCalls[a.esd_code] = new Map(calls.map((c) => [c.consumer_no, c]));
    }
    const payMap = esdPayments[a.esd_code];
    const callMap = esdCalls[a.esd_code];

    // Anything neither paid nor still on the call list: ask good standing.
    const unknown = items.filter((it) => !payMap.has(it.consumer_no) && !callMap.has(it.consumer_no)).map((it) => it.consumer_no);
    const goodMap = new Map();
    for (const batch of chunk(unknown, 150)) {
      const { data, error } = await db.from('prepaid_recovery_good_standing')
        .select('consumer_no, last_payment_date, last_payment_amount')
        .eq('report_date', reportDate).eq('esd_code', a.esd_code).in('consumer_no', batch);
      if (error) throw error;
      for (const g of data) goodMap.set(g.consumer_no, g);
    }

    const out = items.map((it) => {
      const pay = payMap.get(it.consumer_no);
      if (pay) return { ...it, status: 'Paid', paid_amount: pay.paid_amount, paid_date: pay.paid_date };
      if (callMap.has(it.consumer_no)) return { ...it, status: 'Still unpaid', balance_now: callMap.get(it.consumer_no).balance };
      const good = goodMap.get(it.consumer_no);
      if (good) {
        if (good.last_payment_date && good.last_payment_date >= a.allotted_on) {
          return { ...it, status: 'Paid', paid_amount: good.last_payment_amount, paid_date: good.last_payment_date };
        }
        return { ...it, status: 'Balance cleared' };
      }
      return { ...it, status: 'Not in report' };
    });
    results.push({ allotment: a, pending: false, items: out });
  }
  return results;
}

/** Still-unpaid tracker: this report's call list vs the previous report's. */
export async function getStillUnpaidTracker(reportDate) {
  const previousDate = await getPreviousReportDate(reportDate);
  if (!previousDate) return { previousDate: null, tracker: [] };
  const [prev, cur, pays] = await Promise.all([
    getCallListKeysForDate(previousDate),
    getCallListKeysForDate(reportDate),
    getPaymentsKeysForDate(reportDate),
  ]);
  return { previousDate, tracker: buildStillUnpaidTracker(prev, cur, pays) };
}

/** Every good-standing consumer of one ESD (for the Excel download). */
export async function getGoodStandingForEsd(reportDate, esdCode) {
  const db = supabaseAdmin();
  return fetchAll(() => db
    .from('prepaid_recovery_good_standing')
    .select('*')
    .eq('report_date', reportDate)
    .eq('esd_code', esdCode)
    .order('consumer_no')
    .order('id'));
}
