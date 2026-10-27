// Server-only database access for HQ requisition / supply / issue.
import { supabaseAdmin } from './supabaseAdmin.js';
import { fyMonths } from './meterCostCore.js';
import { LEDGERS } from './meterCostHq.js';

function fyRange(fyStart) {
  const months = fyMonths(fyStart);
  const [y, m] = months[11].split('-').map(Number);
  return { first: `${months[0]}-01`, nextFirst: m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01` };
}

export async function listLedger(type, fyStart) {
  const L = LEDGERS[type];
  let q = supabaseAdmin().from(L.table).select('*');
  if (fyStart) {
    const { first, nextFirst } = fyRange(fyStart);
    q = q.gte(L.dateCol, first).lt(L.dateCol, nextFirst);
  }
  const { data, error } = await q.order(L.dateCol, { ascending: false }).order('id', { ascending: false }).limit(2000);
  if (error) throw new Error(error.message);
  return data;
}

export async function findByNumber(type, no) {
  const L = LEDGERS[type];
  const { data, error } = await supabaseAdmin().from(L.table).select('*').eq(L.noCol, no);
  if (error) throw new Error(error.message);
  return data;
}

export async function addLedger(type, row) {
  const { data, error } = await supabaseAdmin().from(LEDGERS[type].table).insert(row).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteLedger(type, id) {
  const { error } = await supabaseAdmin().from(LEDGERS[type].table).delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function updateLedger(type, id, fields) {
  const { data, error } = await supabaseAdmin().from(LEDGERS[type].table).update(fields).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function loadHq(fyStart) {
  const [reqs, supplies] = await Promise.all([listLedger('req', fyStart), listLedger('supply', fyStart)]);
  return { reqs, supplies };
}
