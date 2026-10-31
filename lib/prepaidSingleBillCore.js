// Prepaid "single bill" check.
//
// Inputs: last month's Smart Prepaid Statement (one row per consumer, with the
// month's total units and the last Bill Date) and this month's Billing Payment
// Status file (the consumer's latest bill and latest payment).
//
// A consumer is a candidate when, among the Bill Dates chosen from the
// statement, the whole month was billed in ONE bill: the status file still
// shows that same bill as the last one (same date) and its Unit Billed equals
// the statement's total month units. For each candidate we show the month-end
// balance from the statement, the current balance from the status file and the
// payment made on or after that last bill (any month, not only this one).
// Pure functions only, so the arithmetic can be tested without a browser.

export const DEFAULT_TOLERANCE = 0.5; // units: bills are rounded differently in the two reports

const DAY = 86400000;

/** Date from "dd/mm/yyyy", "yyyy-mm-dd[ hh:mm:ss]", a Date, or an Excel serial. UTC midnight, or null. */
export function toDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const n = Number(s);
  if (!isNaN(n) && n > 20000 && n < 80000) return new Date(Math.round((Date.UTC(1899, 11, 30) + n * DAY) / DAY) * DAY);
  return null;
}

const num = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
};
const str = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());

export const STATEMENT_COLUMNS = ['Consumer No', 'Bill Date', 'UNIB', 'Final Balance'];
export const STATUS_COLUMNS = ['Consumer No', 'Last Bill Date', 'Unit Billed', 'Last Payment Date', 'Last Payment Amount', 'Balance'];

function requireColumns(rows, needed, label) {
  if (!rows.length) throw new Error(`${label}: no rows were found in the file.`);
  const have = new Set(Object.keys(rows[0]));
  const missing = needed.filter((c) => !have.has(c));
  if (missing.length) throw new Error(`${label}: these columns were not found: ${missing.join(', ')}. Is this the right file?`);
}

/** Statement rows (as read from the sheet) -> clean records. */
export function normalizeStatement(raw) {
  requireColumns(raw, STATEMENT_COLUMNS, 'Prepaid Statement');
  return raw
    .map((r) => ({
      consumerNo: str(r['Consumer No']),
      name: str(r['Consumer Name']),
      category: str(r['Category Name']),
      billDate: toDate(r['Bill Date']),
      units: num(r['UNIB']) ?? 0,
      netBill: num(r['Net Bill']) ?? 0,
      recharge: num(r['Recharge']) ?? 0,
      finalBalance: num(r['Final Balance']) ?? 0,
    }))
    .filter((r) => r.consumerNo !== '');
}

/** Billing Payment Status rows -> clean records. */
export function normalizeStatus(raw) {
  requireColumns(raw, STATUS_COLUMNS, 'Billing Payment Status');
  return raw
    .map((r) => ({
      consumerNo: str(r['Consumer No']),
      name: str(r['Consumer Name']),
      phone: str(r['Phone No']),
      category: str(r['Category Name']),
      feeder: str(r['Feeder Name']),
      connection: str(r['Connection Status']),
      lastBillDate: toDate(r['Last Bill Date']),
      unitBilled: num(r['Unit Billed']),
      lastPaymentDate: toDate(r['Last Payment Date']),
      lastPaymentAmount: num(r['Last Payment Amount']),
      balance: num(r['Balance']),
      monthUnits: num(r['Current Month UNIB']),
      monthDemand: num(r['Current Month DMD']),
    }))
    .filter((r) => r.consumerNo !== '');
}

/** Bill Dates present in the statement with how many consumers each has (helps pick the date range). */
export function billDateCounts(statement) {
  const m = new Map();
  for (const r of statement) {
    if (!r.billDate) continue;
    const k = r.billDate.getTime();
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([t, count]) => ({ date: new Date(t), count }));
}

/**
 * @param {{statement, status, from: Date, to: Date, tolerance?: number, minUnits?: number}} p
 * from / to: Bill Dates of the STATEMENT to consider, both included.
 */
export function findSingleBillCandidates({ statement, status, from, to, tolerance = DEFAULT_TOLERANCE, minUnits = 0 }) {
  const byNo = new Map(status.map((r) => [r.consumerNo, r]));
  const stats = {
    inRange: 0, notInStatus: 0, billedAgain: 0, severalBills: 0, belowMinUnits: 0, candidates: 0,
  };
  const out = [];
  for (const s of statement) {
    if (!s.billDate || s.billDate < from || s.billDate > to) continue;
    stats.inRange += 1;
    if (!(s.units > minUnits)) { stats.belowMinUnits += 1; continue; }
    const t = byNo.get(s.consumerNo);
    if (!t) { stats.notInStatus += 1; continue; }
    // The status file must still show the statement's last bill, not a newer one.
    if (!t.lastBillDate || t.lastBillDate.getTime() !== s.billDate.getTime()) { stats.billedAgain += 1; continue; }
    // That one bill must be the whole month.
    if (t.unitBilled == null || Math.abs(t.unitBilled - s.units) > tolerance) { stats.severalBills += 1; continue; }
    const paidAfter = t.lastPaymentDate && t.lastPaymentDate >= t.lastBillDate ? (t.lastPaymentAmount ?? 0) : 0;
    out.push({
      consumerNo: s.consumerNo,
      name: t.name || s.name,
      phone: t.phone,
      category: t.category || s.category,
      feeder: t.feeder,
      connection: t.connection,
      lastBillDate: t.lastBillDate,
      unitBilled: t.unitBilled,
      monthUnits: s.units,
      balanceMonth: s.finalBalance,
      balanceNow: t.balance,
      lastPaymentDate: t.lastPaymentDate,
      lastPaymentAmount: t.lastPaymentAmount,
      paidAfterBill: paidAfter,
    });
  }
  out.sort((a, b) => a.lastBillDate - b.lastBillDate || (a.consumerNo < b.consumerNo ? -1 : 1));
  stats.candidates = out.length;
  return { candidates: out, stats, summary: summarize(out) };
}

export function summarize(list) {
  const sum = (f) => list.reduce((t, r) => t + (Number(f(r)) || 0), 0);
  return {
    consumers: list.length,
    unitBilled: sum((r) => r.unitBilled),
    monthUnits: sum((r) => r.monthUnits),
    balanceMonth: sum((r) => r.balanceMonth),
    balanceNow: sum((r) => r.balanceNow),
    paidCount: list.filter((r) => r.paidAfterBill > 0).length,
    paidAmount: sum((r) => r.paidAfterBill),
    negativeNow: list.filter((r) => (r.balanceNow ?? 0) < 0).length,
  };
}
