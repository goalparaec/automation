// Excel for the Prepaid single-bill check. Plain (no colours): a Summary with the
// two files side by side, the candidate List, and the two data sheets the List
// and the Summary are linked to by formulas. ExcelJS is passed in so the same
// code runs in the browser (dynamic import) and in tests.

const DF = 'dd-mm-yyyy';
const NUM2 = '#,##0.00';
const NUM0 = '#,##0';
const serial = (d) => (d ? Math.round(d.getTime() / 86400000) + 25569 : null); // Excel serial of a UTC-midnight date

function dmy(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

export const SINGLE_BILL_LIST_HEADERS = [
  'Sl No', 'Consumer No', 'Consumer Name', 'Phone No', 'Category', 'Feeder', 'Connection Status', 'Last Bill Date',
  'Unit Billed (Last Bill)', 'Month Units (Statement)', 'Balance at Month End (Statement)', 'Current Balance (Rs)',
  'Last Payment Date', 'Last Payment Amount (Rs)', 'Amount Paid on or after Bill Date (Rs)',
];

/**
 * @param ExcelJS the exceljs module (default export)
 * @param {{statement, status, result, from: Date, to: Date}} p  result = findSingleBillCandidates(...)
 */
export function buildSingleBillWorkbook(ExcelJS, { statement, status, result, from, to }) {
  const wb = new ExcelJS.Workbook();
  const border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  const bold = { bold: true };
  const center = { horizontal: 'center', vertical: 'middle', wrapText: true };

  const sm = wb.addWorksheet('Summary');
  const li = wb.addWorksheet('List');
  const sa = wb.addWorksheet('Status');
  const sb = wb.addWorksheet('Statement');

  // ---- data sheets (only the columns that are needed) -------------------------------------------
  const statusCols = ['Consumer No', 'Consumer Name', 'Phone No', 'Category Name', 'Feeder Name', 'Connection Status',
    'Last Bill Date', 'Unit Billed', 'Last Payment Date', 'Last Payment Amount', 'Balance', 'Current Month UNIB', 'Current Month DMD'];
  sa.addRow(statusCols);
  for (const r of status) {
    sa.addRow([r.consumerNo, r.name, r.phone, r.category, r.feeder, r.connection, r.lastBillDate, r.unitBilled,
      r.lastPaymentDate, r.lastPaymentAmount, r.balance, r.monthUnits, r.monthDemand]);
  }
  const stmtCols = ['Consumer No', 'Consumer Name', 'Category Name', 'Bill Date', 'UNIB', 'Net Bill', 'Recharge', 'Final Balance'];
  sb.addRow(stmtCols);
  for (const r of statement) {
    sb.addRow([r.consumerNo, r.name, r.category, r.billDate, r.units, r.netBill, r.recharge, r.finalBalance]);
  }
  for (const [ws, n, dateCols] of [[sa, statusCols.length, [7, 9]], [sb, stmtCols.length, [4]]]) {
    ws.getRow(1).font = bold;
    ws.getRow(1).alignment = center;
    for (let c = 1; c <= n; c++) ws.getColumn(c).width = c === 1 ? 15 : c === 2 ? 30 : 14;
    for (const c of dateCols) ws.getColumn(c).numFmt = DF;
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
    ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  }
  const N = status.length + 1;
  const M = statement.length + 1;
  const SA = (col) => `Status!$${col}$2:$${col}$${N}`;
  const SB = (col) => `Statement!$${col}$2:$${col}$${M}`;

  // ---- List -------------------------------------------------------------------------------------
  li.addRow(SINGLE_BILL_LIST_HEADERS);
  const hr = li.getRow(1);
  hr.font = bold;
  hr.alignment = center;
  hr.height = 48;
  hr.eachCell((c) => { c.border = border; });
  const L = result.candidates;
  L.forEach((c, i) => {
    const rn = i + 2;
    const m = `MATCH($B${rn},${SA('A')},0)`;
    const ms = `MATCH($B${rn},${SB('A')},0)`;
    const lk = (col, v) => ({ formula: `INDEX(${SA(col)},${m})`, result: v ?? '' });
    li.addRow([
      i + 1,
      c.consumerNo,
      lk('B', c.name),
      lk('C', c.phone),
      lk('D', c.category),
      lk('E', c.feeder),
      lk('F', c.connection),
      lk('G', serial(c.lastBillDate)),
      lk('H', c.unitBilled),
      { formula: `INDEX(${SB('E')},${ms})`, result: c.monthUnits },
      { formula: `INDEX(${SB('H')},${ms})`, result: c.balanceMonth },
      lk('K', c.balanceNow),
      lk('I', serial(c.lastPaymentDate)),
      lk('J', c.lastPaymentAmount),
      { formula: `IF(M${rn}>=H${rn},N${rn},0)`, result: c.paidAfterBill },
    ]);
  });
  const lastRow = L.length + 1;
  const sums = result.summary;
  const totalRow = li.addRow([]);
  const tr = totalRow.number;
  li.getCell(tr, 3).value = 'Total';
  const totals = { 9: sums.unitBilled, 10: sums.monthUnits, 11: sums.balanceMonth, 12: sums.balanceNow, 14: L.reduce((t, r) => t + (r.lastPaymentAmount || 0), 0), 15: sums.paidAmount };
  for (const [col, v] of Object.entries(totals)) {
    const letter = String.fromCharCode(64 + Number(col));
    li.getCell(tr, Number(col)).value = L.length ? { formula: `SUM(${letter}2:${letter}${lastRow})`, result: v } : 0;
  }
  totalRow.font = bold;
  for (let r = 2; r <= tr; r++) {
    for (let c = 1; c <= 15; c++) {
      const cell = li.getCell(r, c);
      cell.border = border;
      if (c === 8 || c === 13) { cell.numFmt = DF; cell.alignment = { horizontal: 'center' }; }
      if ([9, 10, 11, 12, 14, 15].includes(c)) { cell.numFmt = NUM2; cell.alignment = { horizontal: 'right' }; }
    }
  }
  [6, 14, 28, 12, 10, 24, 11, 11, 10, 12, 14, 12, 11, 12, 14].forEach((w, i) => { li.getColumn(i + 1).width = w; });
  li.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];
  li.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  li.pageSetup.printTitlesRow = '1:1';

  // ---- Summary: the two files side by side ------------------------------------------------------
  const sumN = (arr, f) => arr.reduce((t, r) => t + (Number(f(r)) || 0), 0);
  const cnt = (arr, f) => arr.filter(f).length;
  sm.mergeCells(1, 1, 1, 3);
  sm.getCell(1, 1).value = 'Prepaid Summary';
  sm.getCell(1, 1).font = { bold: true, size: 12 };
  sm.getCell(1, 1).alignment = { horizontal: 'center' };
  const head = ['Particulars', 'Prepaid Statement', 'Billing Payment Status'];
  head.forEach((h, i) => { const c = sm.getCell(3, i + 1); c.value = h; c.font = bold; c.alignment = center; c.border = border; });
  const rows = [
    ['Consumers', { formula: `COUNTA(${SB('A')})`, result: statement.length }, { formula: `COUNTA(${SA('A')})`, result: status.length }],
    ['Units billed', { formula: `SUM(${SB('E')})`, result: sumN(statement, (r) => r.units) }, { formula: `SUM(${SA('L')})`, result: sumN(status, (r) => r.monthUnits) }],
    ['Current demand (Rs)', { formula: `SUM(${SB('F')})`, result: sumN(statement, (r) => r.netBill) }, { formula: `SUM(${SA('M')})`, result: sumN(status, (r) => r.monthDemand) }],
    ['Consumers with balance below 0', { formula: `COUNTIF(${SB('H')},"<0")`, result: cnt(statement, (r) => r.finalBalance < 0) }, { formula: `COUNTIF(${SA('K')},"<0")`, result: cnt(status, (r) => (r.balance ?? 0) < 0) }],
    ['Consumers with balance Rs -500 and below', { formula: `COUNTIF(${SB('H')},"<=-500")`, result: cnt(statement, (r) => r.finalBalance <= -500) }, { formula: `COUNTIF(${SA('K')},"<=-500")`, result: cnt(status, (r) => (r.balance ?? 0) <= -500) }],
    ['Net balance (Rs)', { formula: `SUM(${SB('H')})`, result: sumN(statement, (r) => r.finalBalance) }, { formula: `SUM(${SA('K')})`, result: sumN(status, (r) => r.balance) }],
    ['Running consumers', null, { formula: `COUNTIF(${SA('F')},"RUNNING")`, result: cnt(status, (r) => r.connection.toUpperCase() === 'RUNNING') }],
    ['TDC consumers', null, { formula: `COUNTIF(${SA('F')},"TDC")`, result: cnt(status, (r) => r.connection.toUpperCase() === 'TDC') }],
    ['PDC consumers', null, { formula: `COUNTIF(${SA('F')},"PDC")`, result: cnt(status, (r) => r.connection.toUpperCase() === 'PDC') }],
  ];
  let rn = 4;
  for (const r of rows) {
    r.forEach((v, i) => { const c = sm.getCell(rn, i + 1); c.value = v; c.border = border; if (i > 0) { c.numFmt = NUM0; c.alignment = { horizontal: 'right' }; } });
    rn += 1;
  }
  rn += 1;
  sm.mergeCells(rn, 1, rn, 3);
  sm.getCell(rn, 1).value = `Last billed from ${dmy(from)} to ${dmy(to)}, whole month in one bill`;
  sm.getCell(rn, 1).font = bold;
  sm.getCell(rn, 1).alignment = { horizontal: 'center' };
  rn += 1;
  const lr = (col) => `List!${col}2:${col}${Math.max(lastRow, 2)}`;
  const sub = [
    ['Consumers', { formula: `COUNTA(${lr('B')})`, result: L.length }],
    ['Units billed (last bill)', { formula: `SUM(${lr('I')})`, result: sums.unitBilled }],
    ['Month units (statement)', { formula: `SUM(${lr('J')})`, result: sums.monthUnits }],
    ['Balance at month end (Rs)', { formula: `SUM(${lr('K')})`, result: sums.balanceMonth }],
    ['Current balance (Rs)', { formula: `SUM(${lr('L')})`, result: sums.balanceNow }],
    ['Consumers who paid on or after bill date', { formula: `COUNTIF(${lr('O')},">0")`, result: sums.paidCount }],
    ['Amount paid on or after bill date (Rs)', { formula: `SUM(${lr('O')})`, result: sums.paidAmount }],
  ];
  for (const [a, v] of sub) {
    const c1 = sm.getCell(rn, 1); c1.value = a; c1.border = border;
    const c2 = sm.getCell(rn, 2); c2.value = v; c2.border = border; c2.numFmt = NUM0; c2.alignment = { horizontal: 'right' };
    sm.getCell(rn, 3).border = border;
    rn += 1;
  }
  sm.getColumn(1).width = 50;
  sm.getColumn(2).width = 26;
  sm.getColumn(3).width = 28;
  sm.getRow(3).height = 30;
  sm.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1 };

  return wb;
}
