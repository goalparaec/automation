// Server-only database access for the Meter Cost Record module.
import { supabaseAdmin } from './supabaseAdmin.js';
import { fyMonths, recordKey, applicationKey, KIND_BY_HEAD } from './meterCostCore.js';

const HEADS = Object.keys(KIND_BY_HEAD);
const COLS =
  'id, esd_code, application_no, consumer_no, consumer_name, kind, head, amount, load_kw, phase, status, reason, receipt_no, bill_no, payment_date, source_file';

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function fyRange(fyStart) {
  const months = fyMonths(fyStart);
  const first = `${months[0]}-01`;
  const lastMonth = months[11];
  const [y, m] = lastMonth.split('-').map(Number);
  const nextFirst = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { first, nextFirst };
}

/** All deposit rows of a financial year (pages through Supabase's 1000-row cap). */
export async function getDepositsForFy(fyStart) {
  const { first, nextFirst } = fyRange(fyStart);
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin()
      .from('meter_cost_deposits')
      .select(COLS)
      .gte('payment_date', first)
      .lt('payment_date', nextFirst)
      .order('payment_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

/** What is already saved for the rows of an upload (for duplicate detection). */
export async function getExistingFor(records) {
  const byKey = new Map();
  const byApp = new Map();
  const db = supabaseAdmin();

  const receipts = [...new Set(records.map((r) => r.receipt_no))];
  for (const part of chunk(receipts, 100)) {
    const { data, error } = await db.from('meter_cost_deposits').select(COLS).in('receipt_no', part).in('head', HEADS);
    if (error) throw new Error(error.message);
    for (const r of data) byKey.set(recordKey(r), r);
  }

  const apps = [...new Set(records.map((r) => r.application_no))];
  for (const part of chunk(apps, 100)) {
    const { data, error } = await db.from('meter_cost_deposits').select(COLS).in('application_no', part).in('head', HEADS);
    if (error) throw new Error(error.message);
    for (const r of data) {
      const k = applicationKey(r);
      if (!byApp.has(k)) byApp.set(k, []);
      byApp.get(k).push(r);
    }
  }
  return { byKey, byApp };
}

/** Saves decided rows. Rows already saved (same ESD + receipt + head) are skipped. */
export async function saveDeposits(rows) {
  let saved = 0;
  for (const part of chunk(rows, 400)) {
    const { data, error } = await supabaseAdmin()
      .from('meter_cost_deposits')
      .upsert(part, { onConflict: 'esd_code,receipt_no,head', ignoreDuplicates: true })
      .select('id');
    if (error) throw new Error(error.message);
    saved += data.length;
  }
  return { saved, skipped: rows.length - saved };
}

export async function listDeposits({ fyStart, esd, status, limit = 500 }) {
  let q = supabaseAdmin().from('meter_cost_deposits').select(COLS);
  if (fyStart) {
    const { first, nextFirst } = fyRange(fyStart);
    q = q.gte('payment_date', first).lt('payment_date', nextFirst);
  }
  if (esd) q = q.eq('esd_code', esd);
  if (status) q = q.eq('status', status);
  const { data, error } = await q.order('payment_date', { ascending: false }).order('id', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteDeposit(id) {
  const { error } = await supabaseAdmin().from('meter_cost_deposits').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Change a saved row: count it (with a phase) or ignore it. */
export async function updateDeposit(id, { status, phase }) {
  const patch =
    status === 'counted'
      ? { status: 'counted', phase: String(phase), reason: 'Approved manually' }
      : { status: 'ignored', phase: null, reason: 'Ignored manually' };
  if (patch.status === 'counted' && !['1', '3'].includes(patch.phase)) throw new Error('Choose 1-phase or 3-phase.');
  const { error } = await supabaseAdmin().from('meter_cost_deposits').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

// ------------------------------------------------------------------- PR

export async function listPrs(fyStart) {
  let q = supabaseAdmin().from('meter_cost_pr').select('*');
  if (fyStart) {
    const { first, nextFirst } = fyRange(fyStart);
    q = q.gte('pr_date', first).lt('pr_date', nextFirst);
  }
  const { data, error } = await q.order('pr_date', { ascending: false }).order('id', { ascending: false }).limit(2000);
  if (error) throw new Error(error.message);
  return data;
}

export async function findPrByNumber(prNo) {
  const { data, error } = await supabaseAdmin().from('meter_cost_pr').select('*').eq('pr_no', prNo);
  if (error) throw new Error(error.message);
  return data;
}

export async function addPr(pr) {
  const { data, error } = await supabaseAdmin().from('meter_cost_pr').insert(pr).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deletePr(id) {
  const { error } = await supabaseAdmin().from('meter_cost_pr').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function updatePr(id, fields) {
  const { data, error } = await supabaseAdmin().from('meter_cost_pr').update(fields).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}
