import ExcelJS from 'exceljs';
import {
  ANALYSIS_COLUMNS, ANALYSIS_TABLES, analysisTableRows, analysisCrossRows, mergedAnalysis, trendRows,
  summarizePaymentsRows, summarizeExcludedRows, bandLabel, reasonLabel, fmtDate,
  WIDE_BANDS, NEG_SIZE_BANDS, wideSummaryRows, wideCategoryMatrix, wideGroupRows, wideNegSizeRows,
  NONCOMM_GROUPS, NONCOMM_LABELS, nonCommSummaryRows,
} from './prepaidRecoveryCore';

// ---------------------------------------------------------------------------
// Shared, print-ready sheet builder. Every report below goes through
// addTableSheet so they all look and print the same way:
//   * A4 landscape, fit to one page wide, header row repeated on every page
//   * wrapped text, but each column is made at least as wide as its longest
//     single word, so a word is never broken across two lines
//   * row heights worked out from the wrapped text (never clipped), with a
//     taller minimum where people write by hand (call lists)
// ---------------------------------------------------------------------------

const COLORS = {
  head: '1F3B5C', headText: 'FFFFFF', zebra: 'F3F6FA', total: 'FFF2CC', section: 'DCE6F1',
  border: '9AA8B8', title: '1F3B5C',
};

function toDate(value) {
  if (!value) return null;
  const s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null;
}

// Width of one character in Excel width units; capitals and digits are wider.
function charWidth(ch) {
  if (/[A-Z0-9@%&MW]/.test(ch)) return 1.2;
  if (/[ijlI.,:;'|!()\- ]/.test(ch)) return 0.65;
  return 1;
}
function textWidth(text) {
  let w = 0;
  for (const ch of String(text)) w += charWidth(ch);
  return w;
}
function longestWord(text) {
  let max = 0;
  for (const word of String(text ?? '').split(/\s+/)) max = Math.max(max, textWidth(word));
  return max;
}
/** How many lines a text needs in a column `width` wide, wrapping only at spaces. */
function lineCount(text, width) {
  const avail = Math.max(1, width - 1);
  let lines = 0;
  for (const para of String(text ?? '').split('\n')) {
    let cur = 0;
    let n = 1;
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const w = textWidth(word);
      const sp = cur === 0 ? 0 : 0.65;
      if (cur > 0 && cur + sp + w > avail) { n += 1; cur = w; } else { cur += sp + w; }
    }
    lines += n;
  }
  return Math.max(1, lines);
}

const NUM_FMT = {
  int: '#,##0',
  money: '#,##0.00',
  lakh: '#,##0.00',
  pct: '0.0"%"',
  date: 'dd.mm.yyyy',
};

function safeSheetName(wb, wanted) {
  let base = String(wanted).replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let name = base;
  let i = 2;
  const taken = new Set(wb.worksheets.map((w) => w.name.toLowerCase()));
  while (taken.has(name.toLowerCase())) {
    const suffix = ` ${i}`;
    name = base.slice(0, 31 - suffix.length) + suffix;
    i += 1;
  }
  return name;
}

/**
 * columns: [{ header, key, width, fmt: 'text'|'int'|'money'|'lakh'|'pct'|'date', left: bool, max: number }]
 * rows:    [{ [key]: value, _total?: true, _section?: true }]
 */
export function addTableSheet(wb, sheetName, { title, subtitle, columns, rows, minRowHeight = 18 }) {
  const ws = wb.addWorksheet(safeSheetName(wb, sheetName), { views: [{ showGridLines: false }] });
  const FONT = { name: 'Calibri', size: 10 };
  const thin = { style: 'thin', color: { argb: `FF${COLORS.border}` } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  // ---- column widths: preferred width, but never narrower than the longest word
  const widths = columns.map((c) => {
    let w = c.width || 12;
    w = Math.max(w, longestWord(c.header) + 2.5);
    for (const r of rows) {
      const v = r[c.key];
      if (v == null || typeof v === 'number' || v instanceof Date) continue;
      if (c.fmt && c.fmt !== 'text') continue;
      w = Math.max(w, longestWord(v) + 2.5);
    }
    for (const r of rows) {
      const v = r[c.key];
      if (typeof v === 'number') {
        const fmt = NUM_FMT[c.fmt] || NUM_FMT.int;
        const shown = v.toLocaleString('en-US', { minimumFractionDigits: fmt.includes('.00') ? 2 : 0, maximumFractionDigits: fmt.includes('.00') ? 2 : 1 });
        w = Math.max(w, textWidth(shown) + 2.5);
      }
    }
    return Math.min(Math.max(w, longestWord(c.header) + 2.5), Math.max(c.max || 48, longestWord(c.header) + 2.5));
  });
  columns.forEach((c, i) => { ws.getColumn(i + 1).width = widths[i]; });
  const lastCol = columns.length;
  const sheetWidth = widths.reduce((s, w) => s + w, 0);

  // ---- title block
  let r = 1;
  ws.mergeCells(r, 1, r, lastCol);
  const t = ws.getCell(r, 1);
  t.value = title;
  t.font = { name: 'Calibri', size: 14, bold: true, color: { argb: `FF${COLORS.title}` } };
  t.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  ws.getRow(r).height = 20 * lineCount(title, sheetWidth * 0.8) + 4;
  r += 1;
  if (subtitle) {
    ws.mergeCells(r, 1, r, lastCol);
    const s = ws.getCell(r, 1);
    s.value = subtitle;
    s.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF444444' } };
    s.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws.getRow(r).height = 14 * lineCount(subtitle, sheetWidth * 0.9) + 4;
    r += 1;
  }
  r += 1; // spacer
  const headerRow = r;

  // ---- header
  let headerLines = 1;
  columns.forEach((c, i) => {
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = c.header;
    cell.font = { ...FONT, bold: true, color: { argb: `FF${COLORS.headText}` } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLORS.head}` } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = border;
    headerLines = Math.max(headerLines, lineCount(c.header, widths[i]));
  });
  ws.getRow(headerRow).height = Math.max(24, headerLines * 13 + 8);

  // ---- body
  let zebra = false;
  rows.forEach((row) => {
    r += 1;
    const isTotal = !!row._total;
    const isSection = !!row._section;
    let lines = 1;
    columns.forEach((c, i) => {
      const cell = ws.getCell(r, i + 1);
      let v = row[c.key];
      if (c.fmt === 'date') v = toDate(v);
      if (v === undefined || v === null || v === '') v = null;
      cell.value = v;
      cell.font = { ...FONT, bold: isTotal || isSection };
      cell.border = border;
      const numeric = typeof v === 'number';
      cell.alignment = {
        horizontal: c.left && !numeric ? 'left' : (numeric && c.right ? 'right' : 'center'),
        vertical: 'middle',
        wrapText: true,
        indent: c.left && !numeric ? 1 : 0,
      };
      const cellFmt = (row._fmt && row._fmt[c.key]) || c.fmt;
      if (cellFmt && NUM_FMT[cellFmt]) cell.numFmt = NUM_FMT[cellFmt];
      if (isTotal) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLORS.total}` } };
      else if (isSection) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLORS.section}` } };
      else if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLORS.zebra}` } };
      if (typeof v === 'string') lines = Math.max(lines, lineCount(v, widths[i] - (c.left ? 1 : 0)));
    });
    ws.getRow(r).height = Math.max(minRowHeight, lines * 13 + 5);
    if (!isTotal && !isSection) zebra = !zebra;
  });

  // ---- print setup
  ws.pageSetup = {
    orientation: 'landscape',
    paperSize: 9, // A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    printTitlesRow: `${headerRow}:${headerRow}`,
  };
  ws.headerFooter = { oddFooter: '&L&8Goalpara Electrical Circle, APDCL&C&8Page &P of &N&R&8Printed &D' };
  ws.views = [{ state: 'frozen', ySplit: headerRow, showGridLines: false }];
  return ws;
}

function newWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Goalpara Circle Reporting System';
  return wb;
}

const CIRCLE = 'Goalpara Electrical Circle';
const esdName = (esdMap, code) => (esdMap && esdMap[code]) || code;
const num = (v) => Number(v || 0);
const paidWindowText = (reportDate, from) => (from
  ? `Paid since last report: payments dated ${fmtDate(from)} to ${fmtDate(reportDate)}`
  : `Paid since last report: payments up to ${fmtDate(reportDate)}`);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
export function paidSummaryRows(paymentsRows, summaryRows, esdMap) {
  const s = summarizePaymentsRows(paymentsRows);
  const codes = [...new Set([...summaryRows.map((r) => r.esd_code), ...Object.keys(s.byEsd)])].sort();
  const rows = codes.map((c) => ({ esd: esdName(esdMap, c), n: (s.byEsd[c] || {}).n || 0, amt: (s.byEsd[c] || {}).amt || 0 }));
  rows.push({ esd: `${CIRCLE} Total`, n: s.total.n, amt: s.total.amt, _total: true });
  return rows;
}

function excludedSummaryRows(excludedRows) {
  const s = summarizeExcludedRows(excludedRows);
  const rows = s.reasons.map((reason) => ({
    reason: reasonLabel(reason), n: s.byReason[reason].n, neg: s.byReason[reason].negAmt / 100000,
    paidN: s.byReason[reason].paidN, paidAmt: s.byReason[reason].paidAmt,
  }));
  rows.push({ reason: 'Total excluded', n: s.total.n, neg: s.total.negAmt / 100000, paidN: s.total.paidN, paidAmt: s.total.paidAmt, _total: true });
  return rows;
}

const PAID_COLS = [
  { header: 'ESD', key: 'esd', width: 24 },
  { header: 'Paid since last report (consumers)', key: 'n', width: 18, fmt: 'int' },
  { header: 'Paid since last report (Rs)', key: 'amt', width: 18, fmt: 'money', right: true },
];
const EXCL_SUMMARY_COLS = [
  { header: 'Excluded category', key: 'reason', width: 30, left: true },
  { header: 'Consumers', key: 'n', width: 12, fmt: 'int' },
  { header: 'Negative balance (Lakhs)', key: 'neg', width: 16, fmt: 'lakh' },
  { header: 'Paid since last report (consumers)', key: 'paidN', width: 18, fmt: 'int' },
  { header: 'Paid since last report (Rs)', key: 'paidAmt', width: 18, fmt: 'money', right: true },
];

export async function buildSummaryWorkbook({ reportDate, summaryRows, paymentsRows = [], excludedRows = [], esdMap = {} }) {
  const wb = newWorkbook();
  const paidFrom = (summaryRows[0] || {}).paid_from_date;
  const sub = `As on ${fmtDate(reportDate)}   |   ${paidWindowText(reportDate, paidFrom)}`;

  const t = {
    b36: 0, b612: 0, b1y: 0, bnp: 0, total: 0, neg: 0, nophone: 0, pn: 0, pa: 0,
    n36: 0, n612: 0, n1y: 0, nnp: 0,
  };
  const rows = summaryRows.map((r) => {
    t.b36 += r.band_3_6; t.b612 += r.band_6_12; t.b1y += r.band_above_1y; t.bnp += r.band_no_payment;
    t.total += r.call_list_total; t.neg += num(r.neg_total); t.nophone += r.no_phone_excluded;
    t.pn += r.paid_since_count || 0; t.pa += num(r.paid_since_amount);
    t.n36 += num(r.neg_band_3_6); t.n612 += num(r.neg_band_6_12); t.n1y += num(r.neg_band_above_1y); t.nnp += num(r.neg_band_no_payment);
    return {
      esd: esdName(esdMap, r.esd_code), b36: r.band_3_6, b612: r.band_6_12, b1y: r.band_above_1y, bnp: r.band_no_payment,
      total: r.call_list_total, neg: num(r.neg_total) / 100000, nophone: r.no_phone_excluded,
      pn: r.paid_since_count || 0, pa: num(r.paid_since_amount),
    };
  });
  rows.push({
    esd: `${CIRCLE} Total`, b36: t.b36, b612: t.b612, b1y: t.b1y, bnp: t.bnp, total: t.total, neg: t.neg / 100000,
    nophone: t.nophone, pn: t.pn, pa: t.pa, _total: true,
  });
  addTableSheet(wb, 'Summary', {
    title: `${CIRCLE} - Prepaid Summary as on ${fmtDate(reportDate)}`,
    subtitle: sub,
    columns: [
      { header: 'ESD', key: 'esd', width: 22 },
      { header: bandLabel('3-6 months'), key: 'b36', width: 14, fmt: 'int' },
      { header: bandLabel('6-12 months'), key: 'b612', width: 14, fmt: 'int' },
      { header: bandLabel('Above 1 year'), key: 'b1y', width: 14, fmt: 'int' },
      { header: bandLabel('No payment record'), key: 'bnp', width: 12, fmt: 'int' },
      { header: 'Call list total', key: 'total', width: 11, fmt: 'int' },
      { header: 'Negative balance (Lakhs)', key: 'neg', width: 14, fmt: 'lakh' },
      { header: 'No Phone numbers', key: 'nophone', width: 12, fmt: 'int' },
      { header: 'Paid since last report (consumers)', key: 'pn', width: 16, fmt: 'int' },
      { header: 'Paid since last report (Rs)', key: 'pa', width: 16, fmt: 'money', right: true },
    ],
    rows,
  });

  const nb = summaryRows.map((r) => ({
    esd: esdName(esdMap, r.esd_code), a: num(r.neg_band_3_6) / 100000, b: num(r.neg_band_6_12) / 100000,
    c: num(r.neg_band_above_1y) / 100000, d: num(r.neg_band_no_payment) / 100000, e: num(r.neg_total) / 100000,
  }));
  nb.push({ esd: `${CIRCLE} Total`, a: t.n36 / 100000, b: t.n612 / 100000, c: t.n1y / 100000, d: t.nnp / 100000, e: t.neg / 100000, _total: true });
  addTableSheet(wb, 'Negative balance by band', {
    title: `${CIRCLE} - Negative Balance of Call List by Band (Lakhs) as on ${fmtDate(reportDate)}`,
    subtitle: 'Only consumers on the call list (defaulters with a usable phone number)',
    columns: [
      { header: 'ESD', key: 'esd', width: 22 },
      { header: bandLabel('3-6 months'), key: 'a', width: 16, fmt: 'lakh' },
      { header: bandLabel('6-12 months'), key: 'b', width: 16, fmt: 'lakh' },
      { header: bandLabel('Above 1 year'), key: 'c', width: 16, fmt: 'lakh' },
      { header: bandLabel('No payment record'), key: 'd', width: 16, fmt: 'lakh' },
      { header: 'Total (Lakhs)', key: 'e', width: 14, fmt: 'lakh' },
    ],
    rows: nb,
  });

  addTableSheet(wb, 'Paid since last report', {
    title: `${CIRCLE} - Paid Since Last Report, ESD-wise`,
    subtitle: sub,
    columns: PAID_COLS,
    rows: paidSummaryRows(paymentsRows, summaryRows, esdMap),
  });

  if (excludedRows.length > 0) {
    addTableSheet(wb, 'Excluded summary', {
      title: `${CIRCLE} - Excluded Consumers by Category as on ${fmtDate(reportDate)}`,
      subtitle: `Kept out of the call list and payments. ${paidWindowText(reportDate, paidFrom)}`,
      columns: EXCL_SUMMARY_COLS,
      rows: excludedSummaryRows(excludedRows),
    });
  }
  return wb;
}

// ---------------------------------------------------------------------------
// Payments (paid since last report)
// ---------------------------------------------------------------------------
export async function buildPaymentsWorkbook({ reportDate, paymentsRows, summaryRows = [], esdMap = {} }) {
  const wb = newWorkbook();
  const paidFrom = (summaryRows[0] || {}).paid_from_date;
  const sub = `As on ${fmtDate(reportDate)}   |   ${paidWindowText(reportDate, paidFrom)}`;

  addTableSheet(wb, 'Paid - ESD wise', {
    title: `${CIRCLE} - Paid Since Last Report, ESD-wise`, subtitle: sub,
    columns: PAID_COLS, rows: paidSummaryRows(paymentsRows, summaryRows, esdMap),
  });

  const s = summarizePaymentsRows(paymentsRows);
  const catRows = Object.entries(s.byCategory).sort((a, b) => b[1].amt - a[1].amt)
    .map(([cat, v]) => ({ cat, n: v.n, amt: v.amt }));
  catRows.push({ cat: 'Total', n: s.total.n, amt: s.total.amt, _total: true });
  addTableSheet(wb, 'Paid - Category wise', {
    title: `${CIRCLE} - Paid Since Last Report, Category-wise`, subtitle: sub,
    columns: [
      { header: 'Category', key: 'cat', width: 22, left: true },
      { header: 'Paid since last report (consumers)', key: 'n', width: 18, fmt: 'int' },
      { header: 'Paid since last report (Rs)', key: 'amt', width: 18, fmt: 'money', right: true },
    ],
    rows: catRows,
  });

  addTableSheet(wb, 'Paid list', {
    title: `${CIRCLE} - Consumers Who Paid Since Last Report`, subtitle: sub,
    columns: [
      { header: 'ESD', key: 'esd', width: 14 },
      { header: 'Consumer No', key: 'cno', width: 16 },
      { header: 'Consumer Name', key: 'name', width: 28, left: true },
      { header: 'Category', key: 'cat', width: 12 },
      { header: 'Paid date', key: 'date', width: 12, fmt: 'date' },
      { header: 'Paid amount (Rs)', key: 'amt', width: 14, fmt: 'money', right: true },
      { header: 'Balance now (Rs)', key: 'bal', width: 14, fmt: 'money', right: true },
    ],
    rows: paymentsRows.map((r) => ({
      esd: esdName(esdMap, r.esd_code), cno: r.consumer_no, name: r.consumer_name, cat: r.category_name,
      date: r.paid_date, amt: num(r.paid_amount), bal: r.balance_now == null ? null : num(r.balance_now),
    })),
  });
  return wb;
}

// ---------------------------------------------------------------------------
// Call list - one sheet per ESD, roomy rows for handwritten remarks, no address
// ---------------------------------------------------------------------------
export async function buildCallListWorkbook({ reportDate, rows, esdMap = {} }) {
  const wb = newWorkbook();
  const byEsd = {};
  for (const r of rows) (byEsd[r.esd_code] || (byEsd[r.esd_code] = [])).push(r);
  for (const code of Object.keys(byEsd).sort()) {
    addTableSheet(wb, esdName(esdMap, code), {
      title: `${CIRCLE} - Prepaid Call List - ${esdName(esdMap, code)} ESD`,
      subtitle: `As on ${fmtDate(reportDate)}   |   ${byEsd[code].length.toLocaleString('en-IN')} consumers   |   Sr. No. 1 = largest negative balance`,
      minRowHeight: 30,
      columns: [
        { header: 'Sr. No.', key: 'sr', width: 7, fmt: 'int' },
        { header: 'Consumer No', key: 'cno', width: 15 },
        { header: 'Consumer Name', key: 'name', width: 24, left: true },
        { header: 'Category', key: 'cat', width: 10 },
        { header: 'Status', key: 'status', width: 10 },
        { header: 'Phone No', key: 'phone', width: 13 },
        { header: 'Last Payment', key: 'lpd', width: 12, fmt: 'date' },
        { header: 'Negative Balance (Rs)', key: 'bal', width: 13, fmt: 'money', right: true },
        { header: 'Not Recharged For', key: 'band', width: 15 },
        { header: 'Remarks', key: 'remark', width: 34, left: true },
      ],
      rows: byEsd[code].map((r) => ({
        sr: r.serial_no, cno: r.consumer_no, name: r.consumer_name, cat: r.category_name,
        status: r.connection_status, phone: r.phone_no, lpd: r.last_payment_date || null,
        bal: r.balance == null ? null : num(r.balance), band: bandLabel(r.band), remark: r.remark || '',
      })),
    });
  }
  return wb;
}

// ---------------------------------------------------------------------------
// Excluded consumers
// ---------------------------------------------------------------------------
export async function buildExcludedWorkbook({ reportDate, rows, summaryRows = [], esdMap = {} }) {
  const wb = newWorkbook();
  const paidFrom = (summaryRows[0] || {}).paid_from_date;
  const sub = `As on ${fmtDate(reportDate)}   |   ${paidWindowText(reportDate, paidFrom)}`;

  addTableSheet(wb, 'Excluded summary', {
    title: `${CIRCLE} - Excluded Consumers by Category`, subtitle: sub,
    columns: EXCL_SUMMARY_COLS, rows: excludedSummaryRows(rows),
  });

  const s = summarizeExcludedRows(rows);
  const codes = [...new Set([...summaryRows.map((r) => r.esd_code), ...rows.map((r) => r.esd_code)])].sort();
  const mrows = s.reasons.map((reason) => {
    const row = { reason: reasonLabel(reason) };
    let tot = 0;
    codes.forEach((c) => { row[`e${c}`] = s.matrix[reason][c] || 0; tot += s.matrix[reason][c] || 0; });
    row.total = tot;
    return row;
  });
  const trow = { reason: 'Total excluded', _total: true, total: 0 };
  codes.forEach((c) => {
    trow[`e${c}`] = s.reasons.reduce((t, reason) => t + (s.matrix[reason][c] || 0), 0);
    trow.total += trow[`e${c}`];
  });
  mrows.push(trow);
  addTableSheet(wb, 'Category x ESD', {
    title: `${CIRCLE} - Excluded Consumers, Category x ESD`, subtitle: sub,
    columns: [
      { header: 'Excluded category', key: 'reason', width: 30, left: true },
      ...codes.map((c) => ({ header: esdName(esdMap, c), key: `e${c}`, width: 12, fmt: 'int' })),
      { header: 'Total', key: 'total', width: 12, fmt: 'int' },
    ],
    rows: mrows,
  });

  addTableSheet(wb, 'Excluded list', {
    title: `${CIRCLE} - Excluded Consumers`, subtitle: sub,
    columns: [
      { header: 'ESD', key: 'esd', width: 12 },
      { header: 'Consumer No', key: 'cno', width: 15 },
      { header: 'Consumer Name', key: 'name', width: 24, left: true },
      { header: 'Category', key: 'cat', width: 12 },
      { header: 'Status', key: 'status', width: 10 },
      { header: 'Phone No', key: 'phone', width: 13 },
      { header: 'Balance (Rs)', key: 'bal', width: 13, fmt: 'money', right: true },
      { header: 'Excluded because', key: 'reason', width: 22, left: true },
      { header: 'Detail', key: 'detail', width: 30, left: true },
      { header: 'Paid since last report', key: 'paid', width: 11 },
      { header: 'Paid date', key: 'pdate', width: 12, fmt: 'date' },
      { header: 'Paid amount (Rs)', key: 'pamt', width: 13, fmt: 'money', right: true },
    ],
    rows: rows.map((r) => ({
      esd: esdName(esdMap, r.esd_code), cno: r.consumer_no, name: r.consumer_name, cat: r.category_name,
      status: r.connection_status, phone: r.phone_no, bal: r.balance == null ? null : num(r.balance),
      reason: reasonLabel(r.reason_category), detail: r.reason_detail, paid: r.paid_since_last ? 'Yes' : 'No',
      pdate: r.paid_since_last ? r.last_payment_date : null, pamt: r.paid_since_last ? num(r.last_payment_amount) : null,
    })),
  });
  return wb;
}

// ---------------------------------------------------------------------------
// Allotments (summary + one printable sheet per allotment)
// ---------------------------------------------------------------------------
export async function buildAllotmentsWorkbook({ reportDate, evaluated, esdMap = {} }) {
  const wb = newWorkbook();
  const tot = { n: 0, paid: 0, cleared: 0, rec: 0, still: 0, nir: 0, amt: 0 };
  const rows = evaluated.map((e) => {
    const a = e.allotment;
    const base = { label: a.label, esd: esdName(esdMap, a.esd_code), range: `${a.from_serial}-${a.to_serial}`, on: a.allotted_on, n: a.consumer_count };
    if (e.pending) return { ...base, paid: 'Check from next report' };
    const s = e.stats;
    tot.n += s.allotted; tot.paid += s.paid; tot.cleared += s.cleared; tot.rec += s.recovered;
    tot.still += s.stillUnpaid; tot.nir += s.notInReport; tot.amt += s.paidAmount;
    return { ...base, paid: s.paid, cleared: s.cleared, rec: s.recovered, still: s.stillUnpaid, nir: s.notInReport, pct: s.recoveredPct, amt: s.paidAmount };
  });
  rows.push({ label: 'TOTAL', n: tot.n, paid: tot.paid, cleared: tot.cleared, rec: tot.rec, still: tot.still, nir: tot.nir,
    pct: tot.n ? (tot.rec / tot.n) * 100 : 0, amt: tot.amt, _total: true });
  addTableSheet(wb, 'Allotment Summary', {
    title: `${CIRCLE} - Telecalling Allotments checked against report of ${fmtDate(reportDate)}`,
    subtitle: 'Paid = recharged since the consumer was allotted. Balance cleared = no longer a defaulter without a recorded payment.',
    columns: [
      { header: 'Allotted to', key: 'label', width: 20, left: true },
      { header: 'ESD', key: 'esd', width: 13 },
      { header: 'Sr. No. range', key: 'range', width: 11 },
      { header: 'Allotted on', key: 'on', width: 12, fmt: 'date' },
      { header: 'Consumers allotted', key: 'n', width: 11, fmt: 'int' },
      { header: 'Paid since allotment', key: 'paid', width: 13, fmt: 'int' },
      { header: 'Balance cleared', key: 'cleared', width: 11, fmt: 'int' },
      { header: 'Total recovered', key: 'rec', width: 11, fmt: 'int' },
      { header: 'Still unpaid', key: 'still', width: 10, fmt: 'int' },
      { header: 'Not in report', key: 'nir', width: 10, fmt: 'int' },
      { header: 'Recovered %', key: 'pct', width: 10, fmt: 'pct' },
      { header: 'Amount paid (Rs)', key: 'amt', width: 14, fmt: 'money', right: true },
    ],
    rows,
  });

  evaluated.filter((e) => !e.pending).forEach((e) => {
    const a = e.allotment;
    addTableSheet(wb, `${a.label} ${esdName(esdMap, a.esd_code)} ${a.from_serial}-${a.to_serial}`, {
      title: `${CIRCLE} - Allotment: ${a.label} - ${esdName(esdMap, a.esd_code)} ESD, Sr. No. ${a.from_serial}-${a.to_serial}`,
      subtitle: `Allotted on ${fmtDate(a.allotted_on)}   |   Checked against report of ${fmtDate(reportDate)}`,
      minRowHeight: 30,
      columns: [
        { header: 'Sr. No.', key: 'sr', width: 7, fmt: 'int' },
        { header: 'Consumer No', key: 'cno', width: 15 },
        { header: 'Consumer Name', key: 'name', width: 24, left: true },
        { header: 'Phone No', key: 'phone', width: 13 },
        { header: 'Not Recharged For (at allotment)', key: 'band', width: 16 },
        { header: 'Balance at allotment (Rs)', key: 'bal', width: 13, fmt: 'money', right: true },
        { header: 'Status now', key: 'status', width: 13 },
        { header: 'Paid date', key: 'pdate', width: 12, fmt: 'date' },
        { header: 'Paid amount (Rs)', key: 'pamt', width: 13, fmt: 'money', right: true },
        { header: 'Remarks', key: 'remark', width: 28, left: true },
      ],
      rows: e.items.map((it) => ({
        sr: it.serial_no, cno: it.consumer_no, name: it.consumer_name, phone: it.phone_no, band: bandLabel(it.band),
        bal: it.balance == null ? null : num(it.balance), status: it.status, pdate: it.paid_date || null,
        pamt: it.paid_amount == null ? null : num(it.paid_amount), remark: '',
      })),
    });
  });
  return wb;
}

// ---------------------------------------------------------------------------
// Analysis (every consumer in the billing files)
// ---------------------------------------------------------------------------
function analysisMetricCols(first) {
  return [
    ...first,
    ...ANALYSIS_COLUMNS.map((c) => ({
      header: c.header, key: c.key, width: 12, fmt: c.fmt === 'pct' ? 'pct' : c.fmt,
      right: c.fmt === 'money',
    })),
  ];
}
function metricsToRow(m) {
  const out = {};
  for (const c of ANALYSIS_COLUMNS) out[c.key] = c.get(m);
  return out;
}

const ANALYSIS_SHEET_NAMES = {
  category: 'By category',
  connection: 'By connection status',
  type: 'Normal-Govt-Tower-PDC',
  balanceBand: 'By balance band',
  arrearBand: 'By arrear band',
};

export async function buildAnalysisWorkbook({
  reportDate, previousDate, analysis, prevAnalysis = {}, summaryRows, prevSummaryRows = [], esdMap = {},
}) {
  const wb = newWorkbook();
  const codes = Object.keys(analysis).sort();
  const sub = `As on ${fmtDate(reportDate)}   |   Covers every consumer in the billing files   |   ${paidWindowText(reportDate, (summaryRows[0] || {}).paid_from_date)}`;
  const blocks = [{ name: `${CIRCLE} (all ESDs)`, an: mergedAnalysis(analysis) }, ...codes.map((c) => ({ name: esdName(esdMap, c), an: mergedAnalysis(analysis, [c]) }))];

  // Overview: one row per ESD
  const ov = [...codes.map((c) => ({ esd: esdName(esdMap, c), ...metricsToRow(mergedAnalysis(analysis, [c]).overall) })),
    { esd: `${CIRCLE} Total`, ...metricsToRow(mergedAnalysis(analysis).overall), _total: true }];
  addTableSheet(wb, 'Overview', {
    title: `${CIRCLE} - Prepaid Consumer Analysis: ESD-wise Overview`, subtitle: sub,
    columns: analysisMetricCols([{ header: 'ESD', key: 'esd', width: 24 }]), rows: ov,
  });

  // Dimension tables: a block per ESD (circle first)
  for (const tbl of ANALYSIS_TABLES) {
    const rows = [];
    for (const b of blocks) {
      const { rows: tr, total } = analysisTableRows(b.an, tbl.dim);
      rows.push({ esd: b.name, key: '', _section: true });
      for (const r of tr) rows.push({ esd: b.name, key: r.key, ...metricsToRow(r.m) });
      rows.push({ esd: b.name, key: 'Total', ...metricsToRow(total), _total: true });
    }
    addTableSheet(wb, ANALYSIS_SHEET_NAMES[tbl.dim] || tbl.dim, {
      title: `${CIRCLE} - Prepaid Consumer Analysis: ${tbl.title}`, subtitle: sub,
      columns: analysisMetricCols([
        { header: 'ESD', key: 'esd', width: 22 },
        { header: tbl.keyHeader, key: 'key', width: 24, left: true },
      ]),
      rows,
    });
  }

  // Cross tables: category x connection status
  for (const [field, label, fmt] of [['n', 'Consumers', 'int'], ['negAmt', 'Negative balance (Lakhs)', 'lakh']]) {
    const rows = [];
    let conns = [];
    for (const b of blocks) {
      const x = analysisCrossRows(b.an, field);
      conns = x.conns.length > conns.length ? x.conns : conns;
      rows.push({ esd: b.name, cat: '', _section: true });
      for (const r of x.rows) {
        const row = { esd: b.name, cat: r.key, total: r.total };
        x.conns.forEach((c, i) => { row[`c${c}`] = r.vals[i]; });
        rows.push(row);
      }
      const trow = { esd: b.name, cat: 'Total', total: x.grand, _total: true };
      x.conns.forEach((c, i) => { trow[`c${c}`] = x.totals[i]; });
      rows.push(trow);
    }
    addTableSheet(wb, `Category x Status - ${field === 'n' ? 'Consumers' : 'Neg bal'}`, {
      title: `${CIRCLE} - Category x Connection Status: ${label}`, subtitle: sub,
      columns: [
        { header: 'ESD', key: 'esd', width: 22 },
        { header: 'Category', key: 'cat', width: 20, left: true },
        ...conns.map((c) => ({ header: c, key: `c${c}`, width: 12, fmt })),
        { header: 'Total', key: 'total', width: 12, fmt },
      ],
      rows,
    });
  }

  // Change since the previous report (grouped by measure, ESD-wise)
  if (previousDate) {
    const t = trendRows(summaryRows, prevSummaryRows, analysis, prevAnalysis);
    const rows = [];
    for (const m of t.metrics) {
      rows.push({ measure: m.header, esd: '', _section: true });
      for (const r of t.rows) {
        const v = r.values[m.key];
        rows.push({
          measure: m.header,
          esd: r.code === 'TOTAL' ? `${CIRCLE} Total` : esdName(esdMap, r.code),
          prev: v.prev, now: v.now, change: v.prev == null ? null : v.now - v.prev, _total: r.code === 'TOTAL',
          _fmt: { prev: m.fmt, now: m.fmt, change: m.fmt },
        });
      }
    }
    addTableSheet(wb, 'Change since last report', {
      title: `${CIRCLE} - Change Since Previous Report (${fmtDate(previousDate)} to ${fmtDate(reportDate)})`,
      subtitle: 'Only the previous report is kept for comparison',
      columns: [
        { header: 'Measure', key: 'measure', width: 38, left: true },
        { header: 'ESD', key: 'esd', width: 24 },
        { header: `Previous report (${fmtDate(previousDate)})`, key: 'prev', width: 16, fmt: 'money', right: true },
        { header: `This report (${fmtDate(reportDate)})`, key: 'now', width: 16, fmt: 'money', right: true },
        { header: 'Change', key: 'change', width: 14, fmt: 'money', right: true },
      ],
      rows,
    });
  }
  return wb;
}

// ---------------------------------------------------------------------------
// Still unpaid tracker
// ---------------------------------------------------------------------------
export async function buildStillUnpaidWorkbook({ reportDate, previousDate, tracker, esdMap = {} }) {
  const wb = newWorkbook();
  const count = (st) => tracker.filter((r) => r.status === st).length;
  addTableSheet(wb, 'Still unpaid tracker', {
    title: `${CIRCLE} - Still Unpaid Tracker`,
    subtitle: `Call list of ${fmtDate(previousDate)} compared with ${fmtDate(reportDate)}   |   Still unpaid ${count('Still unpaid')}   |   Paid since last report ${count('Paid since last report')}   |   No longer in report ${count('No longer in report')}`,
    columns: [
      { header: 'ESD', key: 'esd', width: 13 },
      { header: 'Consumer No', key: 'cno', width: 16 },
      { header: 'Consumer Name', key: 'name', width: 28, left: true },
      { header: `Balance on ${fmtDate(previousDate)} (Rs)`, key: 'bal', width: 16, fmt: 'money', right: true },
      { header: `Not Recharged For (${fmtDate(previousDate)})`, key: 'band', width: 18 },
      { header: 'Status', key: 'status', width: 22 },
    ],
    rows: tracker.map((r) => ({
      esd: esdName(esdMap, r.esdCode), cno: r.consumerNo, name: r.consumerName,
      bal: r.balance == null ? null : num(r.balance), band: bandLabel(r.band),
      status: r.status === 'Paid since last upload' ? 'Paid since last report' : r.status,
    })),
  });
  return wb;
}


// ---------------------------------------------------------------------------
// Summary - All Categories: everyone except Govt, PDC and GHDT consumers.
// A separate workbook, so the normal Summary export is never touched.
// Negative balances are always shown in Lakhs.
// ---------------------------------------------------------------------------
const LK = (v) => (v || 0) / 100000;
const WIDE_SUB = 'All categories - excludes only Government, PDC and GHDT consumers. Negative balance Rs 500 and above = balance of -500 or lower. Amounts in Lakhs.';

function wideGroupColumns(first) {
  return [
    ...first,
    { header: 'Consumers', key: 'n', width: 11, fmt: 'int' },
    ...WIDE_BANDS.map((b, i) => ({ header: bandLabel(b), key: `c${i}`, width: 13, fmt: 'int' })),
    { header: 'Not recharged total (consumers)', key: 'ageN', width: 14, fmt: 'int' },
    ...WIDE_BANDS.map((b, i) => ({ header: `${bandLabel(b)} (Lakhs)`, key: `l${i}`, width: 13, fmt: 'lakh' })),
    { header: 'Not recharged total (Lakhs)', key: 'ageL', width: 14, fmt: 'lakh' },
    { header: 'Recharged in last 3 months (consumers)', key: 'recN', width: 15, fmt: 'int' },
    { header: 'Total negative balance (Rs 500+) consumers', key: 'negN', width: 15, fmt: 'int' },
    { header: 'Total negative balance (Rs 500+) Lakhs', key: 'negL', width: 15, fmt: 'lakh' },
    { header: 'Average negative balance (Rs)', key: 'avg', width: 14, fmt: 'money', right: true },
  ];
}
function wideGroupRow(prefix, f) {
  const row = { ...prefix, n: f.n, ageN: f.ageN, ageL: LK(f.ageAmt), recN: f.recent.n, negN: f.neg500.n, negL: LK(f.neg500.amt), avg: f.avgNeg };
  WIDE_BANDS.forEach((b, i) => { row[`c${i}`] = f.band[b].n; row[`l${i}`] = LK(f.band[b].amt); });
  return row;
}

export async function buildWideSummaryWorkbook({ reportDate, analysis, summaryRows = [], esdMap = {} }) {
  const wb = newWorkbook();
  const codes = Object.keys(analysis).sort();
  const sub = `As on ${fmtDate(reportDate)}   |   ${WIDE_SUB}   |   ${paidWindowText(reportDate, (summaryRows[0] || {}).paid_from_date)}`;
  const { rows, total } = wideSummaryRows(analysis);

  // 1. Summary - same layout as the normal summary
  const sumRow = (name, r, isTotal) => ({
    esd: name,
    b0: r.band[WIDE_BANDS[0]].n, b1: r.band[WIDE_BANDS[1]].n, b2: r.band[WIDE_BANDS[2]].n, b3: r.band[WIDE_BANDS[3]].n,
    ageN: r.ageN, ageL: LK(r.ageAmt), recN: r.recent.n, negN: r.neg500.n, negL: LK(r.neg500.amt),
    nophone: r.noPhone.n, pn: r.paid.n, pa: r.paid.amt, ...(isTotal ? { _total: true } : {}),
  });
  addTableSheet(wb, 'Summary', {
    title: `${CIRCLE} - Prepaid Summary (All Categories) as on ${fmtDate(reportDate)}`,
    subtitle: sub,
    columns: [
      { header: 'ESD', key: 'esd', width: 22 },
      ...WIDE_BANDS.map((b, i) => ({ header: bandLabel(b), key: `b${i}`, width: 14, fmt: 'int' })),
      { header: 'Not recharged total (consumers)', key: 'ageN', width: 14, fmt: 'int' },
      { header: 'Not recharged total - negative balance (Lakhs)', key: 'ageL', width: 15, fmt: 'lakh' },
      { header: 'Recharged in last 3 months (consumers)', key: 'recN', width: 15, fmt: 'int' },
      { header: 'Total negative balance Rs 500 and above (consumers)', key: 'negN', width: 16, fmt: 'int' },
      { header: 'Total negative balance Rs 500 and above (Lakhs)', key: 'negL', width: 16, fmt: 'lakh' },
      { header: 'No Phone numbers (included here)', key: 'nophone', width: 13, fmt: 'int' },
      { header: 'Paid since last report (consumers)', key: 'pn', width: 16, fmt: 'int' },
      { header: 'Paid since last report (Rs)', key: 'pa', width: 16, fmt: 'money', right: true },
    ],
    rows: [...rows.map((r) => sumRow(esdName(esdMap, r.code), r)), sumRow(`${CIRCLE} Total`, total, true)],
  });

  // 2. Negative balance by band (Lakhs)
  const nbRow = (name, r, isTotal) => ({
    esd: name, a: LK(r.band[WIDE_BANDS[0]].amt), b: LK(r.band[WIDE_BANDS[1]].amt), c: LK(r.band[WIDE_BANDS[2]].amt),
    d: LK(r.band[WIDE_BANDS[3]].amt), e: LK(r.ageAmt), f: LK(r.recent.amt), g: LK(r.neg500.amt), ...(isTotal ? { _total: true } : {}),
  });
  addTableSheet(wb, 'Negative balance by band', {
    title: `${CIRCLE} - Negative Balance by Band, All Categories (Lakhs) as on ${fmtDate(reportDate)}`,
    subtitle: WIDE_SUB,
    columns: [
      { header: 'ESD', key: 'esd', width: 22 },
      ...WIDE_BANDS.map((b, i) => ({ header: bandLabel(b), key: ['a', 'b', 'c', 'd'][i], width: 16, fmt: 'lakh' })),
      { header: 'Not recharged total (Lakhs)', key: 'e', width: 16, fmt: 'lakh' },
      { header: 'Recharged in last 3 months (Lakhs)', key: 'f', width: 16, fmt: 'lakh' },
      { header: 'Total negative balance Rs 500 and above (Lakhs)', key: 'g', width: 18, fmt: 'lakh' },
    ],
    rows: [...rows.map((r) => nbRow(esdName(esdMap, r.code), r)), nbRow(`${CIRCLE} Total`, total, true)],
  });

  // 3. ESD x Category: ESDs down the left, categories across; Lakhs first, then consumers
  const x = wideCategoryMatrix(analysis);
  const catKey = (i) => `k${i}`;
  const matrixRows = [];
  for (const [label, field, scale, fmt] of [
    ['Negative balance Rs 500 and above (Lakhs)', 'amt', 100000, 'lakh'],
    ['Consumers with negative balance Rs 500 and above', 'n', 1, 'int'],
  ]) {
    matrixRows.push({ esd: label, _section: true });
    const mk = (name, r, isTotal) => {
      const o = { esd: name, total: r.total[field] / scale, ...(isTotal ? { _total: true } : {}), _fmt: { total: fmt } };
      x.cats.forEach((c, i) => { o[catKey(i)] = r.cells[c][field] / scale; o._fmt[catKey(i)] = fmt; });
      return o;
    };
    for (const r of x.rows) matrixRows.push(mk(esdName(esdMap, r.code), r));
    matrixRows.push(mk(`${CIRCLE} Total`, x.totalRow, true));
  }
  addTableSheet(wb, 'ESD x Category', {
    title: `${CIRCLE} - ESD x Category: Negative Balance Rs 500 and above, All Categories as on ${fmtDate(reportDate)}`,
    subtitle: WIDE_SUB,
    columns: [
      { header: 'ESD', key: 'esd', width: 24, left: true },
      ...x.cats.map((c, i) => ({ header: c, key: catKey(i), width: 13, fmt: 'lakh' })),
      { header: 'Total', key: 'total', width: 13, fmt: 'lakh' },
    ],
    rows: matrixRows,
  });

  // 4/5. Category-wise and connection-status-wise, one block for the circle and one per ESD
  for (const [dim, sheet, keyHeader, title] of [
    ['category', 'By category', 'Category', 'Category-wise Age Analysis'],
    ['connection', 'By connection status', 'Connection status', 'Connection Status-wise Age Analysis (Running / TDC)'],
  ]) {
    const blocks = [{ name: `${CIRCLE} (all ESDs)`, codes: null }, ...codes.map((c) => ({ name: esdName(esdMap, c), codes: [c] }))];
    const out = [];
    for (const b of blocks) {
      const g = wideGroupRows(analysis, dim, b.codes);
      out.push({ esd: b.name, key: '', _section: true });
      for (const r of g.rows) out.push(wideGroupRow({ esd: b.name, key: r.key }, r));
      out.push({ ...wideGroupRow({ esd: b.name, key: 'Total' }, g.total), _total: true });
    }
    addTableSheet(wb, sheet, {
      title: `${CIRCLE} - ${title}, All Categories as on ${fmtDate(reportDate)}`,
      subtitle: WIDE_SUB,
      columns: wideGroupColumns([
        { header: 'ESD', key: 'esd', width: 22 },
        { header: keyHeader, key: 'key', width: 20, left: true },
      ]),
      rows: out,
    });
  }

  // 6. Size of negative balance
  const sz = wideNegSizeRows(analysis);
  const szRows = [];
  for (const [label, field, scale, fmt] of [
    ['Negative balance (Lakhs)', 'amt', 100000, 'lakh'],
    ['Consumers', 'n', 1, 'int'],
  ]) {
    szRows.push({ esd: label, _section: true });
    const mk = (name, r, isTotal) => {
      const o = { esd: name, total: r.total[field] / scale, ...(isTotal ? { _total: true } : {}), _fmt: { total: fmt } };
      NEG_SIZE_BANDS.forEach((k, i) => { o[`s${i}`] = r.sizes[k][field] / scale; o._fmt[`s${i}`] = fmt; });
      return o;
    };
    for (const r of sz.rows) szRows.push(mk(esdName(esdMap, r.code), r));
    szRows.push(mk(`${CIRCLE} Total`, sz.totalRow, true));
  }
  addTableSheet(wb, 'By size of negative balance', {
    title: `${CIRCLE} - Negative Balance Rs 500 and above by Size, All Categories as on ${fmtDate(reportDate)}`,
    subtitle: WIDE_SUB,
    columns: [
      { header: 'ESD', key: 'esd', width: 24, left: true },
      ...NEG_SIZE_BANDS.map((k, i) => ({ header: `Rs ${k}`, key: `s${i}`, width: 16, fmt: 'lakh' })),
      { header: 'Total', key: 'total', width: 14, fmt: 'lakh' },
    ],
    rows: szRows,
  });

  // 7. What is in / out of this view
  const scopeRow = (name, r, isTotal) => ({
    esd: name, files: r.filesN, out: r.filesN - r.n, inn: r.n, ...(isTotal ? { _total: true } : {}),
  });
  addTableSheet(wb, 'Scope', {
    title: `${CIRCLE} - Consumers Covered by This Summary as on ${fmtDate(reportDate)}`,
    subtitle: 'Left out: Government (Govt Flag), PDC connections and GHDT DTR consumers. Everything else is counted.',
    columns: [
      { header: 'ESD', key: 'esd', width: 24 },
      { header: 'Consumers in billing file', key: 'files', width: 16, fmt: 'int' },
      { header: 'Left out (Govt / PDC / GHDT)', key: 'out', width: 18, fmt: 'int' },
      { header: 'Counted in this summary', key: 'inn', width: 16, fmt: 'int' },
    ],
    rows: [...rows.map((r) => scopeRow(esdName(esdMap, r.code), r)), scopeRow(`${CIRCLE} Total`, total, true)],
  });
  return wb;
}

// ---------------------------------------------------------------------------
// Smart Prepaid Non-Comm (more than 30 days) - Unbilled Summary.
// Titles and tables only (no notes or subtitle lines). Sheet 1 is the full
// summary, sheet 2 a short version with the totals only.
// ---------------------------------------------------------------------------
const NC_TONES = {
  total: { head: '1F3B5C', sub: 'DCE6F1' },
  billed: { head: '2E7D4F', sub: 'DDF0E3' },
  unbilled: { head: 'B7791F', sub: 'FBEBC8' },
  eligible: { head: '1B7F8C', sub: 'D5EEF1' },
  notEligible: { head: 'A63D40', sub: 'F6D9DA' },
};

export async function buildNonCommWorkbook({ reportDate, analysis, esdMap = {} }) {
  const wb = newWorkbook();
  const { rows, total } = nonCommSummaryRows(analysis);
  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${argb}` } });
  const thin = { style: 'thin', color: { argb: 'FF9AA8B8' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const FONT = { name: 'Calibri', size: 11 };
  const dmyTitle = fmtDate(reportDate).replace(/\./g, '-');
  const title = `${CIRCLE} - Smart Prepaid Non-Comm (more than 30 days) Report as on ${dmyTitle}`;
  const all = [...rows.map((r) => ({ ...r, name: esdName(esdMap, r.code) })), { ...total, name: `${CIRCLE} Total`, isTotal: true }];

  // ---------------- Sheet 1: full summary
  const ws = wb.addWorksheet('Non-Comm Unbilled Summary', { views: [{ showGridLines: false }] });
  const lastCol = 1 + NONCOMM_GROUPS.length * 3;
  ws.getColumn(1).width = 30;
  for (let c = 2; c <= lastCol; c++) ws.getColumn(c).width = 11.5;

  ws.mergeCells(1, 1, 1, lastCol);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  t.fill = fill('1F3B5C');
  t.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  ws.getRow(1).height = 34;

  const bandRow = 3; const subRow = 4;
  ws.mergeCells(bandRow, 1, subRow, 1);
  const e = ws.getCell(bandRow, 1);
  e.value = 'ESD';
  e.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } };
  e.fill = fill('1F3B5C');
  e.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell(subRow, 1).border = border; e.border = border;
  NONCOMM_GROUPS.forEach((g, gi) => {
    const c0 = 2 + gi * 3;
    ws.mergeCells(bandRow, c0, bandRow, c0 + 2);
    const b = ws.getCell(bandRow, c0);
    b.value = NONCOMM_LABELS[g];
    b.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } };
    b.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    for (let k = 0; k < 3; k++) {
      ws.getCell(bandRow, c0 + k).fill = fill(NC_TONES[g].head);
      ws.getCell(bandRow, c0 + k).border = border;
      const sc = ws.getCell(subRow, c0 + k);
      sc.value = ['1-Ph', '3-Ph', 'Total'][k];
      sc.font = { ...FONT, bold: true, color: { argb: 'FF1F2937' } };
      sc.fill = fill(NC_TONES[g].sub);
      sc.alignment = { horizontal: 'center', vertical: 'middle' };
      sc.border = border;
    }
  });
  ws.getRow(bandRow).height = 34;
  ws.getRow(subRow).height = 20;

  let r = subRow;
  all.forEach((row, i) => {
    r += 1;
    ws.getRow(r).height = 22;
    const nameCell = ws.getCell(r, 1);
    nameCell.value = row.name;
    nameCell.font = { ...FONT, bold: !!row.isTotal };
    nameCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    nameCell.border = border;
    nameCell.fill = fill(row.isTotal ? 'FFF2CC' : i % 2 ? 'F3F6FA' : 'FFFFFF');
    NONCOMM_GROUPS.forEach((g, gi) => {
      [row[g].p1, row[g].p3, row[g].total].forEach((v, k) => {
        const c = ws.getCell(r, 2 + gi * 3 + k);
        c.value = v;
        c.numFmt = '#,##0';
        c.font = { ...FONT, bold: !!row.isTotal || k === 2 };
        c.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
        c.border = border;
        c.fill = fill(row.isTotal ? 'FFF2CC' : k === 2 ? NC_TONES[g].sub : i % 2 ? 'F3F6FA' : 'FFFFFF');
      });
    });
  });

  // Share of total Non-Comm cases
  r += 2;
  ws.mergeCells(r, 1, r, 6);
  const t2 = ws.getCell(r, 1);
  t2.value = 'Share of Total Non-Comm Cases';
  t2.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  t2.fill = fill('1F3B5C');
  t2.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(r).height = 24;
  r += 1;
  const shareHead = [['ESD', 'total'], ['Total Non-Comm Cases', 'total'], ['Billed %', 'billed'], ['Unbilled %', 'unbilled'], ['Eligible %', 'eligible'], ['Not Eligible %', 'notEligible']];
  shareHead.forEach(([h, g], k) => {
    const c = ws.getCell(r, 1 + k);
    c.value = h;
    c.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = fill(NC_TONES[g].head);
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = border;
  });
  ws.getRow(r).height = 34;
  const pct = (a, b) => (b ? a / b : 0);
  all.forEach((row, i) => {
    r += 1;
    ws.getRow(r).height = 22;
    const tot = row.total.total;
    const vals = [row.name, tot, pct(row.billed.total, tot), pct(row.unbilled.total, tot), pct(row.eligible.total, tot), pct(row.notEligible.total, tot)];
    vals.forEach((v, k) => {
      const c = ws.getCell(r, 1 + k);
      c.value = v;
      if (k === 1) c.numFmt = '#,##0';
      if (k >= 2) c.numFmt = '0.0%';
      c.font = { ...FONT, bold: !!row.isTotal };
      c.alignment = k === 0 ? { horizontal: 'left', vertical: 'middle', indent: 1 } : { horizontal: 'right', vertical: 'middle', indent: 1 };
      c.border = border;
      c.fill = fill(row.isTotal ? 'FFF2CC' : i % 2 ? 'F3F6FA' : 'FFFFFF');
    });
  });
  ws.pageSetup = {
    orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1, horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  };

  // ---------------- Sheet 2: short version (totals only)
  addTableSheet(wb, 'Short Summary', {
    title,
    columns: [
      { header: 'ESD', key: 'esd', width: 30, left: true },
      ...NONCOMM_GROUPS.map((g) => ({ header: NONCOMM_LABELS[g], key: g, width: 16, fmt: 'int' })),
    ],
    rows: all.map((row) => {
      const o = { esd: row.name, ...(row.isTotal ? { _total: true } : {}) };
      for (const g of NONCOMM_GROUPS) o[g] = row[g].total;
      return o;
    }),
  });
  return wb;
}
