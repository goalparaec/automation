import { supabaseAdmin } from './supabaseAdmin.js';
import { CIRCLE_FILTER, ESDS, buildOverallCE } from './overallCeCore.js';

// The five reports Overall CE is built from. Four are the same tables the
// daily report already fills (an upload on either page feeds both); the
// Prepaid Recharge report is new. `hint` is shown next to the upload button.
export const OVERALL_INPUTS = [
  { key: '360_Cum', label: '360 Cumulative Report', table: 'input_360_cum', fetchable: true,
    hint: 'Month-to-date postpaid demand and collection' },
  { key: '360_Daily', label: '360 Daily Report', table: 'input_360_daily', fetchable: true,
    hint: "Day's postpaid collection (shown for information)" },
  { key: 'Prepaid_Bill', label: 'Prepaid Billing Report', table: 'input_prepaid_bill', fetchable: false,
    hint: 'Prepaid demand - upload the previous month\'s file under this month\'s date' },
  { key: 'Prepaid_Coll', label: 'Prepaid Recharge Report', table: 'input_prepaid_coll', fetchable: false,
    hint: 'Prepaid collection - upload the previous month\'s file under this month\'s date' },
  { key: 'Converted', label: 'Smart Prepaid Converted Status Report', table: 'input_converted', fetchable: false,
    hint: "This month's converted-consumer demand and collection" },
];

export const monthStart = (isoDate) => `${isoDate.slice(0, 7)}-01`;

function inferUploadSource(filename) {
  if (!filename) return 'unknown';
  if (filename.startsWith('github-actions-')) return 'Automatic (GitHub Actions)';
  if (filename.startsWith('portal-fetch-')) return 'Automatic (Fetch from Portal button)';
  return 'Manual upload';
}

/**
 * For one input: the rows of the most recent upload dated within the SAME
 * calendar month as reportDate and on/before it. An earlier month is never
 * used - if nothing was uploaded this month, the input counts as missing.
 */
async function latestThisMonth(input, reportDate) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from(input.table)
    .select('*')
    .eq('circle', CIRCLE_FILTER)
    .gte('report_date', monthStart(reportDate))
    .lte('report_date', reportDate)
    .order('report_date', { ascending: false })
    .limit(2000);
  if (error) throw new Error(`${input.label}: ${error.message}`);

  const effectiveDate = data?.[0]?.report_date ?? null;
  const rows = effectiveDate ? data.filter((r) => r.report_date === effectiveDate) : [];

  let upload = null;
  if (effectiveDate) {
    const { data: ups, error: upErr } = await db
      .from('uploads')
      .select('filename, uploaded_at')
      .eq('report_date', effectiveDate)
      .eq('status', 'success')
      .contains('sheets_parsed', [input.key])
      .order('uploaded_at', { ascending: false })
      .limit(1);
    if (upErr) throw new Error(upErr.message);
    upload = ups?.[0] ?? null;
  }

  return {
    key: input.key,
    label: input.label,
    present: effectiveDate !== null,
    effectiveDate,
    isCarriedForward: effectiveDate !== null && effectiveDate !== reportDate,
    uploadedAt: upload?.uploaded_at ?? null,
    source: inferUploadSource(upload?.filename),
    rows,
  };
}

export async function getMonthlyInputs(month) {
  const { data, error } = await supabaseAdmin()
    .from('overall_ce_monthly_inputs')
    .select('sub_division, manual_amount, assessment_amount')
    .eq('report_month', month);
  if (error) throw new Error(error.message);
  const out = {};
  for (const r of data ?? []) {
    out[r.sub_division] = { manual_amount: Number(r.manual_amount) || 0, assessment_amount: Number(r.assessment_amount) || 0 };
  }
  return out;
}

/** values: { [esd]: { manual_amount, assessment_amount } } for the 5 ESDs. */
export async function upsertMonthlyInputs(month, values) {
  const rows = ESDS.map((esd) => ({
    report_month: month,
    sub_division: esd,
    manual_amount: Number(values?.[esd]?.manual_amount) || 0,
    assessment_amount: Number(values?.[esd]?.assessment_amount) || 0,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabaseAdmin()
    .from('overall_ce_monthly_inputs')
    .upsert(rows, { onConflict: 'report_month,sub_division' });
  if (error) throw new Error(`Failed to save monthly inputs: ${error.message}`);
}

/** Builds the Overall CE for one date from whatever has been uploaded this month. */
export async function getOverallCE(reportDate) {
  const month = monthStart(reportDate);
  const [fetched, monthlyValues] = await Promise.all([
    Promise.all(OVERALL_INPUTS.map((i) => latestThisMonth(i, reportDate))),
    getMonthlyInputs(month),
  ]);
  const by = Object.fromEntries(fetched.map((f) => [f.key, f.rows]));

  const rows = buildOverallCE(
    { cum: by['360_Cum'], daily: by['360_Daily'], prepaidBill: by['Prepaid_Bill'], converted: by['Converted'], prepaidColl: by['Prepaid_Coll'] },
    monthlyValues
  );

  const monthlyPresent = ESDS.some((e) => monthlyValues[e]);
  const missing = fetched.filter((f) => !f.present).map((f) => f.label);
  if (!monthlyPresent) missing.push('Monthly inputs (manual / assessment amounts)');

  return {
    reportDate,
    month,
    rows,
    sources: fetched.map(({ rows: _omit, ...meta }) => meta),
    monthlyPresent,
    missing,
  };
}

/** Dates that have at least one successful upload of an Overall CE input, newest first. */
export async function listOverallDates(limit = 30) {
  const { data, error } = await supabaseAdmin()
    .from('uploads')
    .select('report_date')
    .eq('status', 'success')
    .overlaps('sheets_parsed', OVERALL_INPUTS.map((i) => i.key))
    .order('report_date', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((r) => r.report_date))].slice(0, limit);
}
