import { supabaseAdmin } from './supabaseAdmin';

const CHUNK_SIZE = 1000;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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
  reportDate, esdCode, esdLabel, summary, callListRows, paymentsRows, uploadedBy,
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
    paid_yesterday_count: summary.paidYesterdayCount,
    paid_yesterday_amount: summary.paidYesterdayAmount,
    paid_today_count: summary.paidTodayCount,
    paid_today_amount: summary.paidTodayAmount,
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

  const callRows = callListRows.map((r) => ({
    report_date: reportDate,
    esd_code: esdCode,
    consumer_no: r.consumerNo,
    consumer_name: r.consumerName,
    consumer_address: r.consumerAddress,
    category_name: r.categoryName,
    connection_status: r.connectionStatus,
    phone_no: r.phoneNo,
    last_payment_date: r.lastPaymentDate,
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
    balance_now: r.balanceNow,
    paid_when: r.when,
  }));
  for (const batch of chunk(payRows, CHUNK_SIZE)) {
    if (batch.length === 0) continue;
    const { error } = await db.from('prepaid_recovery_payments').insert(batch);
    if (error) throw error;
  }

  if (esdLabel) await upsertEsdLabel(esdCode, esdLabel);
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

export async function getPaymentsForDate(reportDate) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('prepaid_recovery_payments')
    .select('*')
    .eq('report_date', reportDate)
    .order('paid_amount', { ascending: false });
  if (error) throw error;
  return data;
}

/** Call list for a date, left-joined with the latest remark per consumer. */
export async function getCallListForDate(reportDate) {
  const db = supabaseAdmin();
  const { data: rows, error } = await db
    .from('prepaid_recovery_calllist')
    .select('*')
    .eq('report_date', reportDate)
    .order('balance', { ascending: true });
  if (error) throw error;
  if (rows.length === 0) return [];

  const consumerNos = [...new Set(rows.map((r) => r.consumer_no))];
  const remarksByConsumer = {};
  for (const batch of chunk(consumerNos, CHUNK_SIZE)) {
    const { data: remarks, error: remarkErr } = await db
      .from('prepaid_recovery_remarks')
      .select('*')
      .in('consumer_no', batch);
    if (remarkErr) throw remarkErr;
    for (const r of remarks) remarksByConsumer[`${r.consumer_no}|${r.esd_code}`] = r.remark;
  }

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
