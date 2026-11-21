import ExcelJS from 'exceljs';
import { addTableSheet } from './prepaidRecoveryExcelExport';
import {
  esdOverviewRows, categoryEsdMatrix, MATRIX_ORDER, trendRows, rowStatus, esdLabelOf, esdsMissingFromFiles, fmtDateDMY,
  withToday, progressReport,
} from './watchlistCore';

// Builds the Excel download for one list and date. Every sheet goes through addTableSheet (the same
// print-ready builder the Prepaid Reports use), so the look, A4 printing and column sizing match.

const CIRCLE = 'Goalpara Electrical Circle';

function newWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Goalpara Circle Reporting System';
  return wb;
}

const lakh = (n) => (n == null ? null : Number(n) / 100000);

function progressSheet(wb, { list, reportDate, rows, esdMap, asOnDate, criteria }) {
  const rep = progressReport({ rows, reportDate, asOnDate, criteria, esdMap });
  const widths = [7, 18, 14, 16, 15, 17, 17, 16, 19, 19];
  addTableSheet(wb, 'Progress Report', {
    title: rep.title,
    subtitle: `${CIRCLE}   |   As on ${fmtDateDMY(reportDate)}`,
    columns: rep.columns.map((c, i) => ({
      header: c.header, key: c.key, width: widths[i] || 15,
      fmt: c.kind === 'text' ? undefined : c.kind, left: c.key === 'esd',
    })),
    rows: rep.rows.map((r) => ({ ...r, display: undefined })),
  });
}

function overviewSheet(wb, { list, reportDate, rows, esdMap }) {
  const ov = esdOverviewRows(rows, esdMap).map((r) => ({
    esd: r.label, listed: r.listed, inFile: r.inFile, notInFile: r.notInFile,
    todayN: r.todayN, todayAmt: r.todayAmt,
    paidN: r.paidN, paidPct: r.inFile ? r.paidPct : null, paidAmt: r.paidAmt, cumN: r.cumN, cumAmt: r.cumAmt,
    listedNeg: lakh(r.listedNeg), balanceNow: lakh(r.balanceNow), _total: r._total,
  }));
  const missing = esdsMissingFromFiles(rows).map((c) => esdLabelOf(c, esdMap));
  const sub = `${CIRCLE}   |   As on ${fmtDateDMY(reportDate)}`
    + (missing.length ? `   |   No billing file found for: ${missing.join(', ')}` : '');
  addTableSheet(wb, 'Summary', {
    title: `${list.name} - daily payment check`,
    subtitle: sub,
    columns: [
      { header: 'ESD', key: 'esd', width: 22, left: true },
      { header: 'Consumers on list', key: 'listed', width: 12, fmt: 'int' },
      { header: 'Found in billing files', key: 'inFile', width: 12, fmt: 'int' },
      { header: 'Not found in files', key: 'notInFile', width: 12, fmt: 'int' },
      { header: 'Paid today (consumers)', key: 'todayN', width: 13, fmt: 'int' },
      { header: 'Amount realized today (Rs)', key: 'todayAmt', width: 16, fmt: 'money', right: true },
      { header: 'Paid since last check (consumers)', key: 'paidN', width: 15, fmt: 'int' },
      { header: '% of found who paid', key: 'paidPct', width: 11, fmt: 'pct' },
      { header: 'Amount realized since last check (Rs)', key: 'paidAmt', width: 17, fmt: 'money', right: true },
      { header: 'Paid since listing (consumers)', key: 'cumN', width: 15, fmt: 'int' },
      { header: 'Amount realized since listing (Rs)', key: 'cumAmt', width: 17, fmt: 'money', right: true },
      { header: 'Negative balance when listed (Rs Lakh)', key: 'listedNeg', width: 16, fmt: 'lakh', right: true },
      { header: 'Balance now of listed consumers (Rs Lakh)', key: 'balanceNow', width: 16, fmt: 'lakh', right: true },
    ],
    rows: ov,
  });
}

function matrixSheet(wb, { list, reportDate, rows, esdMap }) {
  const first = categoryEsdMatrix(rows, MATRIX_ORDER[0], esdMap);
  const columns = [
    { header: 'Category', key: 'label', width: 22, left: true },
    ...first.esdLabels.map((l, i) => ({ header: l, key: `c${i}`, width: 14 })),
    { header: 'Total', key: 'total', width: 15 },
  ];
  const out = [];
  for (const key of MATRIX_ORDER) {
    const m = categoryEsdMatrix(rows, key, esdMap);
    if (key === 'notInFile' && m.totals.total === 0) continue;
    out.push({ _section: true, label: m.title });
    const fmtMap = { total: m.fmt };
    m.esdCodes.forEach((_, i) => { fmtMap[`c${i}`] = m.fmt; });
    const line = (label, cells, total, extra = {}) => {
      const r = { label, total, _fmt: fmtMap, ...extra };
      cells.forEach((v, i) => { r[`c${i}`] = v; });
      return r;
    };
    for (const b of m.body) out.push(line(b.label, b.cells, b.total));
    out.push(line('Grand Total', m.totals.cells, m.totals.total, { _total: true }));
  }
  addTableSheet(wb, 'Category x ESD', {
    title: `${list.name} - category wise summary`,
    subtitle: `${CIRCLE}   |   As on ${fmtDateDMY(reportDate)}`,
    columns,
    rows: out,
  });
}

const DETAIL_COLUMNS = (esdMap) => [
  { header: 'Sl. No', key: 'sl', width: 7, fmt: 'int' },
  { header: 'ESD', key: 'esd', width: 14 },
  { header: 'Consumer No', key: 'consumerNo', width: 15 },
  { header: 'Consumer Name', key: 'consumerName', width: 28, left: true, max: 34 },
  { header: 'Category', key: 'categoryName', width: 14 },
  { header: 'Phone No', key: 'phoneNo', width: 13 },
  { header: 'Connection Status', key: 'connectionStatus', width: 12 },
  { header: 'Listed on', key: 'listedOn', width: 11, fmt: 'date' },
  { header: 'Balance when listed (Rs)', key: 'listedBalance', width: 14, fmt: 'money', right: true },
  { header: 'Balance now (Rs)', key: 'balanceNow', width: 14, fmt: 'money', right: true },
  { header: 'Last payment date', key: 'lastPaymentDate', width: 12, fmt: 'date' },
  { header: 'Paid today (Rs)', key: 'todayAmount', width: 13, fmt: 'money', right: true },
  { header: 'Paid since last check (Rs)', key: 'paidAmount', width: 14, fmt: 'money', right: true },
  { header: 'Total paid since listing (Rs)', key: 'cumPaidAmount', width: 15, fmt: 'money', right: true },
  { header: 'Remarks', key: 'remarks', width: 24, left: true, max: 40 },
];

function detailRows(rows, esdMap, withTotal) {
  const out = rows.map((r, i) => ({
    sl: i + 1, esd: esdLabelOf(r.esdCode, esdMap), consumerNo: r.consumerNo, consumerName: r.consumerName,
    categoryName: r.categoryName, phoneNo: r.phoneNo, connectionStatus: r.connectionStatus, listedOn: r.listedOn,
    listedBalance: r.listedBalance, balanceNow: r.balanceNow, lastPaymentDate: r.lastPaymentDate,
    todayAmount: r.paidToday ? r.todayAmount : null,
    paidAmount: r.paidAmount, cumPaidAmount: r.cumPaidAmount, remarks: r.remarks,
  }));
  if (withTotal && out.length) {
    out.push({
      sl: null, esd: 'Total', consumerNo: `${out.length.toLocaleString('en-IN')} consumers`,
      listedBalance: rows.reduce((s, r) => s + (r.listedBalance || 0), 0),
      balanceNow: rows.reduce((s, r) => s + (r.balanceNow || 0), 0),
      todayAmount: rows.reduce((s, r) => s + (r.todayAmount || 0), 0),
      paidAmount: rows.reduce((s, r) => s + (r.paidAmount || 0), 0),
      cumPaidAmount: rows.reduce((s, r) => s + (r.cumPaidAmount || 0), 0),
      _total: true,
    });
  }
  return out;
}

const byAmountDesc = (a, b) => (b.paidAmount - a.paidAmount) || (b.cumPaidAmount - a.cumPaidAmount) || a.consumerNo.localeCompare(b.consumerNo);
const byBalance = (a, b) => ((a.balanceNow ?? 0) - (b.balanceNow ?? 0)) || a.consumerNo.localeCompare(b.consumerNo);

export async function buildWatchlistWorkbook({ list, reportDate, rows: rawRows, checks = [], esdMap = {}, asOnDate, criteria }) {
  const wb = newWorkbook();
  const rows = withToday(rawRows, reportDate);
  const ctx = { list, reportDate, rows, esdMap, asOnDate, criteria };
  const sub = `${CIRCLE}   |   As on ${fmtDateDMY(reportDate)}`;

  progressSheet(wb, ctx);
  overviewSheet(wb, ctx);
  matrixSheet(wb, ctx);

  const paidToday = rows.filter((r) => r.paidToday).sort((a, b) => b.todayAmount - a.todayAmount || a.consumerNo.localeCompare(b.consumerNo));
  addTableSheet(wb, 'Paid today', {
    title: `${list.name} - consumers who paid today (${fmtDateDMY(reportDate)})`, subtitle: sub,
    columns: DETAIL_COLUMNS(esdMap), rows: detailRows(paidToday, esdMap, true),
  });

  const paidNow = rows.filter((r) => r.newPayment).sort(byAmountDesc);
  addTableSheet(wb, 'Paid since last check', {
    title: `${list.name} - consumers who paid since the last check`, subtitle: sub,
    columns: DETAIL_COLUMNS(esdMap), rows: detailRows(paidNow, esdMap, true),
  });

  const paidEver = rows.filter((r) => r.cumPaidCount > 0).sort((a, b) => (b.cumPaidAmount - a.cumPaidAmount) || a.consumerNo.localeCompare(b.consumerNo));
  addTableSheet(wb, 'Paid since listing', {
    title: `${list.name} - consumers who have paid since they were listed`, subtitle: sub,
    columns: DETAIL_COLUMNS(esdMap), rows: detailRows(paidEver, esdMap, true),
  });

  const notPaid = rows.filter((r) => rowStatus(r) !== 'NOT_IN_FILE' && r.cumPaidCount === 0).sort(byBalance);
  addTableSheet(wb, 'Not paid', {
    title: `${list.name} - found in the billing files, no payment since listing`, subtitle: sub,
    columns: DETAIL_COLUMNS(esdMap), rows: detailRows(notPaid, esdMap, true),
  });

  const notFound = rows.filter((r) => rowStatus(r) === 'NOT_IN_FILE');
  if (notFound.length) {
    addTableSheet(wb, 'Not in billing file', {
      title: `${list.name} - not found in the uploaded billing files`,
      subtitle: `${sub}   |   Upload that ESD's Billing Payment Status file to include these consumers.`,
      columns: DETAIL_COLUMNS(esdMap), rows: detailRows(notFound, esdMap, false),
    });
  }

  const trend = trendRows(checks);
  if (trend.length) {
    addTableSheet(wb, 'Daily trend', {
      title: `${list.name} - day by day`, subtitle: CIRCLE,
      columns: [
        { header: 'Report date', key: 'reportDate', width: 13, fmt: 'date' },
        { header: 'Consumers on list', key: 'listed', width: 12, fmt: 'int' },
        { header: 'Found in files', key: 'inFile', width: 12, fmt: 'int' },
        { header: 'Paid since previous check (consumers)', key: 'paidN', width: 16, fmt: 'int' },
        { header: 'Amount realized since previous check (Rs)', key: 'paidAmt', width: 18, fmt: 'money', right: true },
        { header: 'Paid since listing (consumers)', key: 'cumN', width: 15, fmt: 'int' },
        { header: 'Amount realized since listing (Rs)', key: 'cumAmt', width: 18, fmt: 'money', right: true },
      ],
      rows: trend,
    });
  }
  return wb;
}
