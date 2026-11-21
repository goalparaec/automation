import { supabaseAdmin } from './supabaseAdmin';
import { rowToDb, rowFromDb } from './watchlistCore';

const CHUNK_SIZE = 1000;
const PAGE_SIZE = 1000; // Supabase/PostgREST silently caps one response at 1000 rows
const KEEP_CHECK_DATES = 60; // daily checks kept per list; older ones are removed

const isoDate = (d) => (d ? String(d).slice(0, 10) : null);

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Read EVERY row of a query, not just the first 1000. `makeQuery` must return a fresh
 * query builder each call, ordered by a unique column so pages never overlap. */
async function fetchAll(makeQuery) {
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

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

/** Every list with its consumer count, ESD-wise counts and the dates it has been checked. */
export async function listWatchlists() {
  const db = supabaseAdmin();
  const { data: lists, error } = await db.from('watchlists').select('*').order('name');
  if (error) throw error;
  if (lists.length === 0) return [];
  const consumers = await fetchAll(() => db.from('watchlist_consumers').select('id, list_id, esd_code').order('id'));
  const { data: checks, error: chkErr } = await db
    .from('watchlist_checks').select('list_id, report_date').order('report_date', { ascending: false });
  if (chkErr) throw chkErr;
  return lists.map((l) => {
    const mine = consumers.filter((c) => c.list_id === l.id);
    const byEsd = {};
    for (const c of mine) byEsd[c.esd_code] = (byEsd[c.esd_code] || 0) + 1;
    return {
      ...l,
      consumer_count: mine.length,
      byEsd,
      dates: checks.filter((c) => c.list_id === l.id).map((c) => isoDate(c.report_date)),
    };
  });
}

export async function getWatchlist(listId) {
  const db = supabaseAdmin();
  const { data, error } = await db.from('watchlists').select('*').eq('id', listId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteWatchlist(listId) {
  const db = supabaseAdmin();
  const { error } = await db.from('watchlists').delete().eq('id', listId); // consumers, checks, rows cascade
  if (error) throw error;
}

/** Step 1 of a list upload: find or create the list by name. Returns the list and a sync id
 * that every following batch carries, so "replace" can drop consumers that are no longer on the list. */
export async function startListSync({ name, sourceFile }) {
  const db = supabaseAdmin();
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Give the list a name.');
  let { data: list, error } = await db.from('watchlists').select('*').eq('name', cleanName).maybeSingle();
  if (error) throw error;
  let created = false;
  if (!list) {
    const ins = await db.from('watchlists').insert({ name: cleanName, source_file: sourceFile || null }).select().single();
    if (ins.error) throw ins.error;
    list = ins.data;
    created = true;
  } else if (sourceFile) {
    await db.from('watchlists').update({ source_file: sourceFile, updated_at: new Date().toISOString() }).eq('id', list.id);
  }
  const syncId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { listId: list.id, syncId, created };
}

/** Step 2 (repeated): add/update one batch of consumers. Consumers already on the list keep their
 * original listed date, listed balance and "before" payment snapshot; name, category, phone and
 * remarks are refreshed from the new file (a blank in the new file never wipes an existing value). */
export async function appendListConsumers({ listId, syncId, consumers, listedOn }) {
  const db = supabaseAdmin();
  const existing = await fetchAll(() => db.from('watchlist_consumers').select('*').eq('list_id', listId).order('id'));
  const byNo = new Map(existing.map((e) => [e.consumer_no, e]));
  const rows = consumers.map((c) => {
    const old = byNo.get(c.consumerNo);
    return {
      list_id: listId,
      consumer_no: c.consumerNo,
      esd_code: c.esdCode,
      consumer_name: c.consumerName || (old && old.consumer_name) || null,
      category_name: c.categoryName || (old && old.category_name) || null,
      phone_no: c.phoneNo || (old && old.phone_no) || null,
      remarks: c.remarks || (old && old.remarks) || null,
      listed_on: old ? old.listed_on : listedOn,
      listed_balance: old ? old.listed_balance : (c.balance ?? null),
      base_pay_date: old ? old.base_pay_date : (c.lastPaymentDate || null),
      base_pay_amount: old ? old.base_pay_amount : (c.lastPaymentAmount ?? null),
      sync_id: syncId,
    };
  });
  for (const batch of chunk(rows, CHUNK_SIZE)) {
    if (batch.length === 0) continue;
    const { error } = await db.from('watchlist_consumers').upsert(batch, { onConflict: 'list_id,consumer_no' });
    if (error) throw error;
  }
  return rows.length;
}

/** Step 3: finish the upload. In 'replace' mode every consumer that was NOT in this upload is removed
 * from the list (their past daily results stay in the history). In 'add' mode nothing is removed. */
export async function finishListSync({ listId, syncId, mode }) {
  const db = supabaseAdmin();
  let removed = 0;
  if (mode === 'replace') {
    const stale = await fetchAll(() => db
      .from('watchlist_consumers').select('id, sync_id').eq('list_id', listId).order('id'));
    const ids = stale.filter((s) => s.sync_id !== syncId).map((s) => s.id);
    for (const batch of chunk(ids, 500)) {
      const { error } = await db.from('watchlist_consumers').delete().in('id', batch);
      if (error) throw error;
    }
    removed = ids.length;
  }
  const { count, error: cntErr } = await db
    .from('watchlist_consumers').select('id', { count: 'exact', head: true }).eq('list_id', listId);
  if (cntErr) throw cntErr;
  const { error } = await db.from('watchlists')
    .update({ consumer_count: count || 0, updated_at: new Date().toISOString() }).eq('id', listId);
  if (error) throw error;
  return { removed, total: count || 0 };
}

export async function getListConsumers(listId) {
  const db = supabaseAdmin();
  return fetchAll(() => db.from('watchlist_consumers').select('*').eq('list_id', listId).order('esd_code').order('id'));
}

// ---------------------------------------------------------------------------
// Daily checks
// ---------------------------------------------------------------------------

async function previousAndLaterDates(listId, reportDate) {
  const db = supabaseAdmin();
  const { data, error } = await db.from('watchlist_checks').select('report_date').eq('list_id', listId);
  if (error) throw error;
  const dates = data.map((d) => isoDate(d.report_date)).sort();
  const before = dates.filter((d) => d < reportDate);
  const after = dates.filter((d) => d > reportDate);
  return { previousDate: before.length ? before[before.length - 1] : null, laterDate: after.length ? after[after.length - 1] : null };
}

/** What the browser needs before checking a day's files: every consumer on the list plus the
 * snapshot to compare against (the previous check's result, or the list's own "before" data). */
export async function getBaseline(listId, reportDate) {
  const db = supabaseAdmin();
  const list = await getWatchlist(listId);
  if (!list) throw new Error('List not found.');
  const { previousDate, laterDate } = await previousAndLaterDates(listId, reportDate);
  const consumers = await getListConsumers(listId);
  let prevByNo = new Map();
  if (previousDate) {
    const prev = await fetchAll(() => db.from('watchlist_check_rows')
      .select('consumer_no, last_payment_date, last_payment_amount, cum_paid_amount, cum_paid_count, first_paid_date')
      .eq('list_id', listId).eq('report_date', previousDate).order('id'));
    prevByNo = new Map(prev.map((p) => [p.consumer_no, p]));
  }
  const items = consumers.map((c) => {
    const p = prevByNo.get(c.consumer_no);
    return {
      consumerNo: c.consumer_no,
      esdCode: c.esd_code,
      consumerName: c.consumer_name || '',
      categoryName: c.category_name || '',
      listedOn: isoDate(c.listed_on),
      listedBalance: c.listed_balance == null ? null : Number(c.listed_balance),
      base: p
        ? {
          payDate: isoDate(p.last_payment_date), payAmount: p.last_payment_amount == null ? null : Number(p.last_payment_amount),
          cumAmount: Number(p.cum_paid_amount) || 0, cumCount: Number(p.cum_paid_count) || 0, firstPaidDate: isoDate(p.first_paid_date),
        }
        : {
          payDate: isoDate(c.base_pay_date), payAmount: c.base_pay_amount == null ? null : Number(c.base_pay_amount),
          cumAmount: 0, cumCount: 0, firstPaidDate: null,
        },
    };
  });
  return { list, previousDate, laterDate, items };
}

/** Start saving a day's check: refuses if a LATER date is already saved (the cumulative figures
 * run forward from the previous day), then clears any earlier save of the same date. */
export async function startCheck({ listId, reportDate, fileNames, rowsInFiles, staleWarning, uploadedBy }) {
  const db = supabaseAdmin();
  const { laterDate } = await previousAndLaterDates(listId, reportDate);
  if (laterDate) {
    throw new Error(`A check for ${laterDate} is already saved for this list. Checks must be uploaded in date order, `
      + `so ${reportDate} cannot be saved now.`);
  }
  const { error: delErr } = await db.from('watchlist_check_rows').delete().eq('list_id', listId).eq('report_date', reportDate);
  if (delErr) throw delErr;
  const { error } = await db.from('watchlist_checks').upsert({
    list_id: listId, report_date: reportDate, file_names: fileNames || null, rows_in_files: rowsInFiles ?? null,
    stale_warning: staleWarning || null, uploaded_by: uploadedBy || null, uploaded_at: new Date().toISOString(),
    listed: 0, in_file: 0, not_in_file: 0, paid_count: 0, paid_amount: 0, cum_count: 0, cum_amount: 0,
  }, { onConflict: 'list_id,report_date' });
  if (error) throw error;
}

export async function appendCheckRows({ listId, reportDate, rows }) {
  const db = supabaseAdmin();
  const mapped = rows.map((r) => rowToDb(r, listId, reportDate));
  for (const batch of chunk(mapped, CHUNK_SIZE)) {
    if (batch.length === 0) continue;
    const { error } = await db.from('watchlist_check_rows').insert(batch);
    if (error) throw error;
  }
  return mapped.length;
}

/** Last step: store the header totals (for the Trend tab) and drop checks older than the retention window. */
export async function finishCheck({ listId, reportDate, totals }) {
  const db = supabaseAdmin();
  const { error } = await db.from('watchlist_checks').update({
    listed: totals.listed, in_file: totals.in_file, not_in_file: totals.not_in_file,
    paid_count: totals.paid_count, paid_amount: totals.paid_amount, cum_count: totals.cum_count, cum_amount: totals.cum_amount,
  }).eq('list_id', listId).eq('report_date', reportDate);
  if (error) throw error;

  const { data, error: dErr } = await db.from('watchlist_checks').select('report_date').eq('list_id', listId).order('report_date', { ascending: false });
  if (dErr) throw dErr;
  const dates = data.map((d) => isoDate(d.report_date));
  if (dates.length > KEEP_CHECK_DATES) {
    const drop = dates.slice(KEEP_CHECK_DATES);
    for (const t of ['watchlist_check_rows', 'watchlist_checks']) {
      const { error: pErr } = await db.from(t).delete().eq('list_id', listId).in('report_date', drop);
      if (pErr) throw pErr;
    }
  }
}

/** Everything the report page / Excel needs for one list and date, or null if that date was not checked. */
export async function getCheck(listId, reportDate) {
  const db = supabaseAdmin();
  const list = await getWatchlist(listId);
  if (!list) return null;
  const { data: header, error } = await db.from('watchlist_checks').select('*').eq('list_id', listId).eq('report_date', reportDate).maybeSingle();
  if (error) throw error;
  if (!header) return { list, header: null, rows: [] };
  const [dbRows, consumers] = await Promise.all([
    fetchAll(() => db.from('watchlist_check_rows').select('*').eq('list_id', listId).eq('report_date', reportDate).order('esd_code').order('id')),
    getListConsumers(listId),
  ]);
  const byNo = new Map(consumers.map((c) => [c.consumer_no, c]));
  const rows = dbRows.map((r) => {
    const c = byNo.get(r.consumer_no) || {};
    return rowFromDb({ ...r, phone_no: c.phone_no, remarks: c.remarks, listed_on: c.listed_on });
  });
  return { list, header, rows };
}

export async function getChecksForList(listId) {
  const db = supabaseAdmin();
  const { data, error } = await db.from('watchlist_checks').select('*').eq('list_id', listId).order('report_date', { ascending: false });
  if (error) throw error;
  return data;
}
