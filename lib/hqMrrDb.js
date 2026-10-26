// Server-only database access for the HQ MRR module.
import { supabaseAdmin } from './supabaseAdmin.js';
import { getManualInputs } from './db.js';
import { ESDS } from './hqMrrCore.js';

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Replaces one ESD's rows for a month with the uploaded ones. */
export async function saveEsdMrr(month, esd, rows, fileName) {
  const db = supabaseAdmin();
  const records = rows.map((r) => {
    const { category_code, category_name, ...data } = r;
    return { report_month: month, esd, category_code, category_name, data };
  });
  for (const part of chunk(records, 100)) {
    const { error } = await db.from('hq_mrr_rows').upsert(part, { onConflict: 'report_month,esd,category_code' });
    if (error) throw new Error(`Could not save ${esd}: ${error.message}`);
  }
  // Categories that were saved earlier but are not in this file go away, so a
  // re-upload is a true replacement.
  const keep = rows.map((r) => r.category_code);
  const { error: delErr } = await db
    .from('hq_mrr_rows')
    .delete()
    .eq('report_month', month)
    .eq('esd', esd)
    .not('category_code', 'in', `(${keep.map((c) => `"${c}"`).join(',')})`);
  if (delErr) throw new Error(`Could not clean old ${esd} rows: ${delErr.message}`);

  const { error: upErr } = await db
    .from('hq_mrr_uploads')
    .upsert({ report_month: month, esd, file_name: fileName, uploaded_at: new Date().toISOString() }, { onConflict: 'report_month,esd' });
  if (upErr) throw new Error(`Could not record the upload: ${upErr.message}`);
}

/** { esd: [category rows] } for a month. */
export async function getMrrRows(month) {
  const { data, error } = await supabaseAdmin()
    .from('hq_mrr_rows')
    .select('esd, category_code, category_name, data')
    .eq('report_month', month)
    .order('category_code', { ascending: true })
    .limit(1000);
  if (error) throw new Error(error.message);
  const out = {};
  for (const r of data ?? []) {
    (out[r.esd] ||= []).push({ category_code: r.category_code, category_name: r.category_name, ...r.data });
  }
  return out;
}

/** Months that have at least one ESD file, newest first. */
export async function listMrrMonths() {
  const { data, error } = await supabaseAdmin()
    .from('hq_mrr_uploads')
    .select('report_month')
    .order('report_month', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((r) => r.report_month))];
}

export async function getUploads(month) {
  const { data, error } = await supabaseAdmin()
    .from('hq_mrr_uploads')
    .select('esd, file_name, uploaded_at')
    .eq('report_month', month);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((r) => [r.esd, r]));
}

/** IRCA units (kWh) per ESD for a month, from the uploaded IRCA MRR. */
export async function getIrca(month) {
  const { data, error } = await supabaseAdmin()
    .from('hq_mrr_irca')
    .select('esd, units_kwh, file_name')
    .eq('report_month', month);
  if (error) throw new Error(error.message);
  return {
    units: Object.fromEntries((data ?? []).map((r) => [r.esd, Number(r.units_kwh) || 0])),
    fileName: data?.[0]?.file_name || null,
  };
}

/** Replaces the IRCA rows of the 5 ESDs for a month. byEsd = { esd: { units_kwh, row } } */
export async function saveIrca(month, byEsd, fileName) {
  const rows = Object.entries(byEsd).map(([esd, v]) => ({
    report_month: month,
    esd,
    units_kwh: v.units_kwh,
    data: v.row,
    file_name: fileName,
    uploaded_at: new Date().toISOString(),
  }));
  const { error } = await supabaseAdmin().from('hq_mrr_irca').upsert(rows, { onConflict: 'report_month,esd' });
  if (error) throw new Error(`Could not save the IRCA MRR: ${error.message}`);
}

/** Energy injection (kWh) per ESD, from the Monthly Inputs page of the app. */
export async function getInjection(month) {
  const manual = await getManualInputs(month);
  const out = {};
  for (const e of ESDS) {
    const v = manual?.[e]?.energy_injection_kwh;
    out[e] = v === null || v === undefined || v === '' ? null : Number(v);
  }
  return out;
}

/** Everything buildHqMrrReport needs for one month. */
export async function loadReportInputs(month) {
  const [rowsByEsd, irca, injectionByEsd, uploads] = await Promise.all([
    getMrrRows(month),
    getIrca(month),
    getInjection(month),
    getUploads(month),
  ]);
  return { rowsByEsd, ircaByEsd: irca.units, ircaLoaded: Object.keys(irca.units).length > 0, injectionByEsd, uploads };
}
