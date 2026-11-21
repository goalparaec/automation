// Pure logic for the "Consumer Watchlist" module (daily payment check for a
// supplied list of consumers). No DOM / Supabase / Next.js imports on purpose:
// this file runs identically in the browser (where the uploaded .xls/.xlsx
// files are parsed), on the server and under plain Node for unit tests.

import { parseDateFlexible, parseNumFlexible } from './prepaidRecoveryCore.js';

export const DEFAULT_ESD_MAP = {
  '038': 'Dhupdhara',
  '039': 'Dudhnoi',
  '040': 'Goalpara',
  '041': 'Lakhipur',
  '042': 'Mankachar',
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Consumer numbers are 12 characters ("042000000005"). Excel often drops the
 * leading zero ("42000000005"), so all-digit numbers shorter than 12 are
 * zero-padded back. Everything else is just trimmed and upper-cased. */
export function normalizeConsumerNo(value) {
  if (value == null) return '';
  let s = typeof value === 'number' ? String(Math.round(value)) : String(value).trim();
  s = s.replace(/\.0+$/, '').replace(/\s+/g, '').toUpperCase();
  if (/^\d+$/.test(s) && s.length < 12) s = s.padStart(12, '0');
  return s;
}

/** ESD code = first 3 characters of the consumer number (same rule as Prepaid Reports). */
export function esdCodeOf(consumerNo) {
  return String(consumerNo || '').slice(0, 3) || 'UNK';
}

export const esdLabelOf = (code, esdMap = DEFAULT_ESD_MAP) => (esdMap && esdMap[code]) || `ESD-${code}`;

/** Date (UTC midnight) -> "YYYY-MM-DD", or null. */
export function toIsoDate(d) {
  if (!d) return null;
  const x = d instanceof Date ? d : parseDateFlexible(d);
  if (!x || isNaN(x.getTime())) return null;
  return x.toISOString().slice(0, 10);
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ---------------------------------------------------------------------------
// Reading the consumer list the user uploads
// ---------------------------------------------------------------------------

const FIELD_ALIASES = {
  consumerNo: ['consumer no', 'consumer no.', 'consumer number', 'consumerno', 'consumer_no', 'consumer id'],
  consumerName: ['consumer name', 'name'],
  categoryName: ['category name', 'category'],
  phoneNo: ['phone no', 'phone', 'mobile', 'mobile no'],
  connectionStatus: ['connection status'],
  balance: ['balance', 'negative balance', 'neg balance'],
  lastPaymentDate: ['last payment date'],
  lastPaymentAmount: ['last payment amount'],
  remarks: ['remarks', 'remark'],
};

function pickField(row, aliases) {
  // Header text can have stray spaces / different case, so match loosely.
  for (const key of Object.keys(row)) {
    const k = String(key).trim().toLowerCase();
    if (aliases.includes(k)) return row[key];
  }
  return undefined;
}

const isBlank = (v) => v == null || String(v).trim() === '';

/** sheets: [{ sheetName, rows }] where rows come from XLSX.utils.sheet_to_json(sheet, { defval: '' }).
 * Every sheet that has a "Consumer No" column is read (summary sheets without one are skipped).
 * A consumer that appears on several sheets is kept once; blanks are filled from the other copy
 * (so a helper sheet that only carries "Consumer No + Remarks" still adds its remark). */
export function parseListSheets(sheets) {
  const byNo = new Map();
  const readSheets = [];
  const skippedSheets = [];
  let duplicates = 0;
  let rowsRead = 0;

  for (const { sheetName, rows } of sheets) {
    const hasConsumerNo = rows.length > 0 && Object.keys(rows[0]).some(
      (k) => FIELD_ALIASES.consumerNo.includes(String(k).trim().toLowerCase()),
    );
    if (!hasConsumerNo) { skippedSheets.push(sheetName); continue; }
    readSheets.push(sheetName);
    for (const raw of rows) {
      const consumerNo = normalizeConsumerNo(pickField(raw, FIELD_ALIASES.consumerNo));
      if (!consumerNo || !/^[0-9A-Z]{8,}$/.test(consumerNo)) continue;
      rowsRead += 1;
      const entry = {
        consumerNo,
        esdCode: esdCodeOf(consumerNo),
        consumerName: String(pickField(raw, FIELD_ALIASES.consumerName) ?? '').trim(),
        categoryName: String(pickField(raw, FIELD_ALIASES.categoryName) ?? '').trim(),
        phoneNo: String(pickField(raw, FIELD_ALIASES.phoneNo) ?? '').trim(),
        connectionStatus: String(pickField(raw, FIELD_ALIASES.connectionStatus) ?? '').trim(),
        balance: parseNumFlexible(pickField(raw, FIELD_ALIASES.balance)),
        lastPaymentDate: toIsoDate(pickField(raw, FIELD_ALIASES.lastPaymentDate)),
        lastPaymentAmount: parseNumFlexible(pickField(raw, FIELD_ALIASES.lastPaymentAmount)),
        remarks: String(pickField(raw, FIELD_ALIASES.remarks) ?? '').trim(),
        sourceSheet: sheetName,
      };
      const existing = byNo.get(consumerNo);
      if (!existing) { byNo.set(consumerNo, entry); continue; }
      duplicates += 1;
      for (const [k, v] of Object.entries(entry)) {
        if (k === 'sourceSheet') continue;
        if (isBlank(existing[k]) && !isBlank(v)) existing[k] = v;
      }
    }
  }
  return { consumers: [...byNo.values()], readSheets, skippedSheets, duplicates, rowsRead };
}

// ---------------------------------------------------------------------------
// Reading the daily Billing Payment Status files
// ---------------------------------------------------------------------------

/** Keeps only the listed consumers' rows (a billing file can have 80,000+ rows).
 * rowsByFile: array of arrays of raw row objects. Returns
 * { byNo: Map(consumerNo -> raw row), totalRows, latestPaymentDate, latestBillDate }. */
export function indexBillingRows(rowsByFile, wantedNos) {
  const wanted = wantedNos instanceof Set ? wantedNos : new Set(wantedNos);
  const byNo = new Map();
  let totalRows = 0;
  let latestPay = null;
  let latestBill = null;
  for (const rows of rowsByFile) {
    for (const raw of rows) {
      totalRows += 1;
      const pd = parseDateFlexible(raw['Last Payment Date']);
      if (pd && (!latestPay || pd > latestPay)) latestPay = pd;
      const bd = parseDateFlexible(raw['Last Bill Date']);
      if (bd && (!latestBill || bd > latestBill)) latestBill = bd;
      const no = normalizeConsumerNo(raw['Consumer No']);
      if (no && wanted.has(no) && !byNo.has(no)) byNo.set(no, raw);
    }
  }
  return { byNo, totalRows, latestPaymentDate: toIsoDate(latestPay), latestBillDate: toIsoDate(latestBill) };
}

/** Does the file look old? (nothing billed in the 3 days up to the report date) */
export function staleWarning(reportDate, latestBillDate) {
  if (!latestBillDate) return 'No Last Bill Date found in the uploaded files, so their age could not be checked.';
  const diff = (Date.parse(`${reportDate}T00:00:00Z`) - Date.parse(`${latestBillDate}T00:00:00Z`)) / 86400000;
  if (diff > 3) return `The newest Last Bill Date in the uploaded files is ${latestBillDate}, ${Math.round(diff)} days before the report date. The files may be old.`;
  if (diff < 0) return `The newest Last Bill Date in the uploaded files (${latestBillDate}) is AFTER the report date ${reportDate}. Check the report date.`;
  return null;
}

// ---------------------------------------------------------------------------
// The payment check itself
// ---------------------------------------------------------------------------

/** Is the payment now shown in the billing file a NEW one compared with the baseline?
 * base = { payDate, payAmount } (what we knew at the previous check, or at listing).
 *  - later date than the baseline            -> new payment
 *  - same date but a different amount        -> new payment (a second recharge on the same day)
 *  - no baseline date at all                 -> new only if paid on/after the day it was listed
 * Only the LATEST payment of a consumer is visible in the billing file ("Last Payment
 * Date/Amount"), so two recharges between two checks count as one (the later one). */
export function isNewPayment(payDate, payAmount, base, listedOn) {
  if (!payDate) return false;
  if (base && base.payDate) {
    if (payDate > base.payDate) return true;
    if (payDate === base.payDate) {
      return payAmount != null && base.payAmount != null && round2(payAmount) !== round2(base.payAmount);
    }
    return false;
  }
  return !!listedOn && payDate >= listedOn;
}

/** listItems: [{ consumerNo, esdCode, consumerName, categoryName, phoneNo, listedOn, listedBalance,
 *               base: { payDate, payAmount, cumAmount, cumCount, firstPaidDate } }]
 * billingByNo: Map(consumerNo -> raw billing row)
 * reportDate: "YYYY-MM-DD". Returns one row per listed consumer. */
export function evaluateCheck({ listItems, billingByNo }) {
  return listItems.map((it) => {
    const base = it.base || {};
    const prevCumAmount = Number(base.cumAmount) || 0;
    const prevCumCount = Number(base.cumCount) || 0;
    const raw = billingByNo.get(it.consumerNo);

    if (!raw) {
      // Not in any uploaded file (e.g. that ESD's file was not uploaded today).
      // Carry the old snapshot forward untouched so tomorrow's comparison still works.
      return {
        consumerNo: it.consumerNo, esdCode: it.esdCode, consumerName: it.consumerName,
        categoryName: it.categoryName, connectionStatus: '', inFile: false,
        balanceNow: base.balanceNow ?? it.listedBalance ?? null, // last known balance (not today's)
        lastPaymentDate: base.payDate || null, lastPaymentAmount: base.payAmount ?? null,
        newPayment: false, paidAmount: 0, cumPaidAmount: round2(prevCumAmount), cumPaidCount: prevCumCount,
        firstPaidDate: base.firstPaidDate || null, listedBalance: it.listedBalance ?? null,
      };
    }

    const payDate = toIsoDate(raw['Last Payment Date']);
    const payAmount = parseNumFlexible(raw['Last Payment Amount']);
    const fresh = isNewPayment(payDate, payAmount, base, it.listedOn);
    const paidAmount = fresh ? round2(payAmount || 0) : 0;
    return {
      consumerNo: it.consumerNo,
      esdCode: it.esdCode,
      consumerName: String(raw['Consumer Name'] ?? '').trim() || it.consumerName,
      categoryName: String(raw['Category Name'] ?? '').trim() || it.categoryName,
      connectionStatus: String(raw['Connection Status'] ?? '').trim(),
      inFile: true,
      balanceNow: parseNumFlexible(raw['Balance']),
      lastPaymentDate: payDate,
      lastPaymentAmount: payAmount,
      newPayment: fresh,
      paidAmount,
      cumPaidAmount: round2(prevCumAmount + paidAmount),
      cumPaidCount: prevCumCount + (fresh ? 1 : 0),
      firstPaidDate: base.firstPaidDate || (fresh ? payDate : null),
      listedBalance: it.listedBalance ?? null,
    };
  });
}

/** 'PAID' (new payment since the last check) | 'NOT_PAID' | 'NOT_IN_FILE'. */
export function rowStatus(r) {
  if (!r.inFile) return 'NOT_IN_FILE';
  return r.newPayment ? 'PAID' : 'NOT_PAID';
}

export const STATUS_LABELS = { PAID: 'Paid', NOT_PAID: 'Not paid', NOT_IN_FILE: 'Not in billing file' };

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

function emptyStats() {
  return {
    listed: 0, inFile: 0, notInFile: 0, paidN: 0, paidAmt: 0, todayN: 0, todayAmt: 0,
    cumN: 0, cumAmt: 0, listedNeg: 0, balanceNow: 0,
  };
}

function addRow(stats, r) {
  stats.listed += 1;
  if (r.inFile) stats.inFile += 1; else stats.notInFile += 1;
  // Balance now of EVERY listed consumer: today's balance when the consumer is in the billing files,
  // otherwise the last known balance (older rows saved without one fall back to the listed balance).
  stats.balanceNow += Number(r.balanceNow ?? r.listedBalance) || 0;
  if (r.newPayment) { stats.paidN += 1; stats.paidAmt += Number(r.paidAmount) || 0; }
  if (r.paidToday) { stats.todayN += 1; stats.todayAmt += Number(r.todayAmount) || 0; }
  if ((r.cumPaidCount || 0) > 0) stats.cumN += 1;
  stats.cumAmt += Number(r.cumPaidAmount) || 0;
  stats.listedNeg += Number(r.listedBalance) || 0;
}

function finishStats(s) {
  return {
    ...s,
    paidAmt: round2(s.paidAmt), todayAmt: round2(s.todayAmt), cumAmt: round2(s.cumAmt), listedNeg: round2(s.listedNeg), balanceNow: round2(s.balanceNow),
    paidPct: s.inFile > 0 ? (s.paidN / s.inFile) * 100 : 0,
    cumPct: s.inFile > 0 ? (s.cumN / s.inFile) * 100 : 0,
  };
}

/** "Paid today" = the billing file of the report date shows the consumer's last payment ON that date
 * (only payments made today; earlier payments are not "today"). Adds paidToday / todayAmount to each row. */
export function withToday(rows, reportDate) {
  return rows.map((r) => {
    const today = !!r.inFile && !!r.lastPaymentDate && r.lastPaymentDate === reportDate;
    return { ...r, paidToday: today, todayAmount: today ? (Number(r.lastPaymentAmount) || 0) : 0 };
  });
}

/** Totals for a set of check rows. */
export function totalsOf(rows) {
  const s = emptyStats();
  for (const r of rows) addRow(s, r);
  return finishStats(s);
}

/** { [key]: stats } grouped by keyFn(row). */
export function groupStats(rows, keyFn) {
  const out = {};
  for (const r of rows) {
    const k = keyFn(r);
    if (!out[k]) out[k] = emptyStats();
    addRow(out[k], r);
  }
  for (const k of Object.keys(out)) out[k] = finishStats(out[k]);
  return out;
}

export const sortedEsdCodes = (rows) => [...new Set(rows.map((r) => r.esdCode))].sort();
export const sortedCategories = (rows) => [...new Set(rows.map((r) => r.categoryName || '(blank)'))].sort();

/** ESD-wise overview rows plus a grand total (the list's headline table). */
export function esdOverviewRows(rows, esdMap = DEFAULT_ESD_MAP) {
  const by = groupStats(rows, (r) => r.esdCode);
  const out = sortedEsdCodes(rows).map((code) => ({ code, label: esdLabelOf(code, esdMap), ...by[code] }));
  out.push({ code: 'ALL', label: 'Total', _total: true, ...totalsOf(rows) });
  return out;
}

export const MATRIX_METRICS = {
  listed: { title: 'A. No. of consumers on the list (Category wise)', fmt: 'int', value: () => 1 },
  listedNegLakh: { title: 'B. Negative balance when listed, Rs. Lakh (Category wise)', fmt: 'lakh', value: (r) => (Number(r.listedBalance) || 0) / 100000 },
  todayN: { title: 'C. Consumers who paid today (Category wise)', fmt: 'int', value: (r) => (r.paidToday ? 1 : 0) },
  todayAmt: { title: 'D. Amount realized today, Rs. (Category wise)', fmt: 'money', value: (r) => Number(r.todayAmount) || 0 },
  paidN: { title: 'E. Consumers who paid since the last check (Category wise)', fmt: 'int', value: (r) => (r.newPayment ? 1 : 0) },
  paidAmt: { title: 'F. Amount realized since the last check, Rs. (Category wise)', fmt: 'money', value: (r) => Number(r.paidAmount) || 0 },
  cumN: { title: 'G. Unique consumers who have paid since listing (Category wise)', fmt: 'int', value: (r) => ((r.cumPaidCount || 0) > 0 ? 1 : 0) },
  cumAmt: { title: 'H. Total amount realized since listing, Rs. (Category wise)', fmt: 'money', value: (r) => Number(r.cumPaidAmount) || 0 },
  notInFile: { title: 'I. Consumers not found in the uploaded billing files (Category wise)', fmt: 'int', value: (r) => (r.inFile ? 0 : 1) },
};
export const MATRIX_ORDER = ['listed', 'listedNegLakh', 'todayN', 'todayAmt', 'paidN', 'paidAmt', 'cumN', 'cumAmt', 'notInFile'];

/** Category x ESD grid like the user's own "Summary" sheet.
 * Returns { esdCodes, esdLabels, body: [{ label, cells: [..], total }], totals: { cells, total } }. */
export function categoryEsdMatrix(rows, metricKey, esdMap = DEFAULT_ESD_MAP) {
  const metric = MATRIX_METRICS[metricKey];
  const esdCodes = sortedEsdCodes(rows);
  const categories = sortedCategories(rows);
  const grid = {};
  for (const c of categories) grid[c] = Object.fromEntries(esdCodes.map((e) => [e, 0]));
  for (const r of rows) {
    const c = r.categoryName || '(blank)';
    grid[c][r.esdCode] += metric.value(r);
  }
  const body = categories.map((c) => {
    const cells = esdCodes.map((e) => round2(grid[c][e]));
    return { label: c, cells, total: round2(cells.reduce((s, v) => s + v, 0)) };
  });
  const colTotals = esdCodes.map((_, i) => round2(body.reduce((s, b) => s + b.cells[i], 0)));
  return {
    key: metricKey, title: metric.title, fmt: metric.fmt,
    esdCodes, esdLabels: esdCodes.map((e) => esdLabelOf(e, esdMap)), body,
    totals: { cells: colTotals, total: round2(colTotals.reduce((s, v) => s + v, 0)) },
  };
}

const lakhOf = (rupees) => (rupees == null ? null : Math.round((Number(rupees) / 100000) * 100) / 100);

const fmtLakhText = (v) => (v == null ? '-' : Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtIntText = (v) => (v == null ? '-' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 }));

/** The "Progress Report" table (ESD wise, amounts in Rs. Lakh) shown on screen, in Excel and as the image.
 *  rows: check rows; reportDate: the day of the billing files; asOnDate: the date the uploaded list's
 *  balances were as on; criteria: free text such as "with negative balance less than -10K". */
export function progressReport({ rows, reportDate, asOnDate, criteria, esdMap = DEFAULT_ESD_MAP }) {
  const today = fmtDateDMY(reportDate);
  const asOn = fmtDateDMY(asOnDate || reportDate);
  const withFlags = withToday(rows, reportDate);
  const by = groupStats(withFlags, (r) => r.esdCode);
  const codes = sortedEsdCodes(withFlags);

  const columns = [
    { key: 'sl', header: 'Sl. No.', kind: 'int' },
    { key: 'esd', header: 'ESD Name', kind: 'text' },
    { key: 'listed', header: 'Nos. of Consumers in the List', kind: 'int' },
    { key: 'neg0', header: `Negative Balance on ${asOn} (Rs. Lakh)`, kind: 'lakh' },
    { key: 'todayN', header: `No. of Consumers Paid Today (${today})`, kind: 'int' },
    { key: 'todayAmt', header: `Total Amount Realized Today (${today}) (Rs. Lakh)`, kind: 'lakh' },
    { key: 'cumN', header: 'Cumulative Nos. of Unique Consumers Paid till Date', kind: 'int' },
    { key: 'cumAmt', header: 'Cumulative Amount Realized till Date (Rs. Lakh)', kind: 'lakh' },
    { key: 'after', header: 'Negative Balance of the Consumers after Realization (Rs. Lakh)', kind: 'lakh' },
    { key: 'actual', header: `Actual Negative Balance of the Consumers as on ${today} (Rs. Lakh)`, kind: 'lakh' },
  ];

  const lineFor = (label, st, sl, total) => {
    return {
      sl, esd: label, _total: !!total,
      listed: st.listed,
      neg0: lakhOf(st.listedNeg),
      todayN: st.todayN,
      todayAmt: lakhOf(st.todayAmt),
      cumN: st.cumN,
      cumAmt: lakhOf(st.cumAmt),
      after: lakhOf(st.listedNeg + st.cumAmt),
      actual: lakhOf(st.balanceNow),
    };
  };
  const body = codes.map((c, i) => lineFor(esdLabelOf(c, esdMap), by[c], i + 1, false));
  body.push(lineFor('Total', totalsOf(withFlags), null, true));
  for (const line of body) {
    line.display = columns.map((c) => {
      const v = line[c.key];
      if (c.key === 'sl') return v == null ? '' : String(v);
      if (c.kind === 'text') return String(v ?? '');
      return c.kind === 'lakh' ? fmtLakhText(v) : fmtIntText(v);
    });
  }

  const missing = esdsMissingFromFiles(withFlags).map((c) => esdLabelOf(c, esdMap));
  const notes = [
    'Amounts are in Rs. Lakh. Cumulative figures count each consumer once, however many times the consumer has paid.',
    `Negative balance after realization = Negative balance on ${asOn} + cumulative amount realized till date.`,
  ];
  if (missing.length) {
    notes.push(`No billing file was uploaded for ${missing.join(', ')} on ${today}: their paid-today figures are 0 and their actual negative balance is the last known balance.`);
  }
  return {
    title: `Progress Report of Consumers${criteria && criteria.trim() ? ` ${criteria.trim()}` : ''} as on ${today}`,
    columns, rows: body, notes, missing,
  };
}

/** Which ESDs have NO consumer found in the uploaded files at all (file probably not uploaded)? */
export function esdsMissingFromFiles(rows) {
  const found = {};
  for (const r of rows) {
    if (!found[r.esdCode]) found[r.esdCode] = 0;
    if (r.inFile) found[r.esdCode] += 1;
  }
  return Object.keys(found).filter((c) => found[c] === 0).sort();
}

/** Trend rows (oldest first) from stored per-date check headers, adding the day-on-day change. */
export function trendRows(checks) {
  const sorted = [...checks].sort((a, b) => String(a.report_date).localeCompare(String(b.report_date)));
  return sorted.map((c) => ({
    reportDate: String(c.report_date).slice(0, 10),
    listed: c.listed || 0, inFile: c.in_file || 0, notInFile: c.not_in_file || 0,
    paidN: c.paid_count || 0, paidAmt: Number(c.paid_amount) || 0,
    cumN: c.cum_count || 0, cumAmt: Number(c.cum_amount) || 0,
  }));
}

// ---------------------------------------------------------------------------
// DB row <-> check row
// ---------------------------------------------------------------------------

/** Row shape stored in watchlist_check_rows. */
export function rowToDb(r, listId, reportDate) {
  return {
    list_id: listId,
    report_date: reportDate,
    esd_code: r.esdCode,
    consumer_no: r.consumerNo,
    consumer_name: r.consumerName,
    category_name: r.categoryName,
    connection_status: r.connectionStatus,
    in_file: !!r.inFile,
    balance_now: r.balanceNow,
    last_payment_date: r.lastPaymentDate,
    last_payment_amount: r.lastPaymentAmount,
    new_payment: !!r.newPayment,
    paid_amount: r.paidAmount || 0,
    cum_paid_amount: r.cumPaidAmount || 0,
    cum_paid_count: r.cumPaidCount || 0,
    first_paid_date: r.firstPaidDate,
    listed_balance: r.listedBalance,
  };
}

export function rowFromDb(d) {
  return {
    consumerNo: d.consumer_no,
    esdCode: d.esd_code,
    consumerName: d.consumer_name || '',
    categoryName: d.category_name || '',
    connectionStatus: d.connection_status || '',
    inFile: !!d.in_file,
    balanceNow: d.balance_now == null ? null : Number(d.balance_now),
    lastPaymentDate: d.last_payment_date ? String(d.last_payment_date).slice(0, 10) : null,
    lastPaymentAmount: d.last_payment_amount == null ? null : Number(d.last_payment_amount),
    newPayment: !!d.new_payment,
    paidAmount: Number(d.paid_amount) || 0,
    cumPaidAmount: Number(d.cum_paid_amount) || 0,
    cumPaidCount: Number(d.cum_paid_count) || 0,
    firstPaidDate: d.first_paid_date ? String(d.first_paid_date).slice(0, 10) : null,
    listedBalance: d.listed_balance == null ? null : Number(d.listed_balance),
    // joined from the list, when available
    phoneNo: d.phone_no || '',
    remarks: d.remarks || '',
    listedOn: d.listed_on ? String(d.listed_on).slice(0, 10) : null,
  };
}

/** Header numbers stored with each check (used by the Trend tab, so it never has to load every row). */
export function checkHeaderTotals(rows) {
  const t = totalsOf(rows);
  return {
    listed: t.listed, in_file: t.inFile, not_in_file: t.notInFile,
    paid_count: t.paidN, paid_amount: t.paidAmt, cum_count: t.cumN, cum_amount: t.cumAmt,
  };
}

export const fmtDateDMY = (value) => {
  if (!value) return '';
  const m = String(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(value);
};
