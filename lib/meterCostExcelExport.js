import ExcelJS from 'exceljs';
import { KIND_LABEL, ESD_BY_CODE } from './meterCostCore.js';

const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
const TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };
const thin = { style: 'thin', color: { argb: 'FF444444' } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

function styleRange(ws, fromRow, toRow, toCol) {
  for (let r = fromRow; r <= toRow; r++) {
    for (let c = 1; c <= toCol; c++) {
      const cell = ws.getCell(r, c);
      cell.border = BORDER;
      cell.alignment = { vertical: 'middle', horizontal: c <= 3 ? 'left' : 'center', wrapText: true };
    }
  }
}

function header(ws, row, labels) {
  labels.forEach((l, i) => {
    const c = ws.getCell(row, i + 1);
    c.value = l;
    c.font = { bold: true };
    c.fill = HEAD_FILL;
  });
  ws.getRow(row).height = 32;
}

/** One data row: counts in D..I, with the total columns as live formulas. */
function countRow(ws, r, lead, c) {
  lead.forEach((v, i) => { ws.getCell(r, i + 1).value = v; });
  ws.getCell(r, 4).value = c.new1;
  ws.getCell(r, 5).value = c.new3;
  ws.getCell(r, 6).value = { formula: `D${r}+E${r}`, result: c.new1 + c.new3 };
  ws.getCell(r, 7).value = c.rep1;
  ws.getCell(r, 8).value = c.rep3;
  ws.getCell(r, 9).value = { formula: `G${r}+H${r}`, result: c.rep1 + c.rep3 };
  ws.getCell(r, 10).value = { formula: `D${r}+G${r}`, result: c.new1 + c.rep1 };
  ws.getCell(r, 11).value = { formula: `E${r}+H${r}`, result: c.new3 + c.rep3 };
}

const HEADERS = ['Month', 'ESD Code', 'ESD Name', 'New Conn. 1-Ph Count', 'New Conn. 3-Ph Count', 'New Conn. Total Count',
  'Replaced 1-Ph Count', 'Replaced 3-Ph Count', 'Replaced Total Count', 'Total 1-Ph Count', 'Total 3-Ph Count'];

export async function buildMeterCostWorkbook({ summary, status, prs, hq = null, lists = null }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Goalpara Circle Reporting System';

  // ---- Deposit (month x ESD)
  const ws = wb.addWorksheet('Deposit');
  ws.getCell('A1').value = `Meter Cost Summary - Goalpara Electrical Circle (FY ${summary.label})`;
  ws.getCell('A1').font = { bold: true, size: 14 };
  header(ws, 4, HEADERS);
  let lastWithData = -1;
  summary.monthly.forEach((m, i) => { if (m.total.total1 + m.total.total3 > 0) lastWithData = i; });
  let r = 5;
  const totalRows = [];
  for (const m of summary.monthly.slice(0, lastWithData + 1)) {
    const first = r;
    for (const row of m.rows) { countRow(ws, r, [m.label, row.esd_code, row.esd], row); r += 1; }
    countRow(ws, r, [`${m.label} TOTAL`, '', ''], m.total);
    for (const col of [4, 5, 7, 8]) {
      const L = ws.getColumn(col).letter;
      ws.getCell(r, col).value = { formula: `SUM(${L}${first}:${L}${r - 1})`, result: ws.getCell(r, col).value };
    }
    for (let c = 1; c <= 11; c++) { ws.getCell(r, c).fill = TOTAL_FILL; ws.getCell(r, c).font = { bold: true }; }
    totalRows.push(r);
    r += 1;
  }
  countRow(ws, r, [`GRAND TOTAL (FY ${summary.label})`, '', ''], summary.grand);
  for (const col of [4, 5, 7, 8]) {
    const L = ws.getColumn(col).letter;
    ws.getCell(r, col).value = { formula: totalRows.map((t) => `${L}${t}`).join('+') || '0', result: summary.grand[['new1', 'new3', 'rep1', 'rep3'][[4, 5, 7, 8].indexOf(col)]] };
  }
  for (let c = 1; c <= 11; c++) { ws.getCell(r, c).fill = TOTAL_FILL; ws.getCell(r, c).font = { bold: true }; }
  styleRange(ws, 4, r, 11);
  ws.getColumn(1).width = 20;
  ws.getColumn(2).width = 10;
  ws.getColumn(3).width = 14;
  for (let c = 4; c <= 11; c++) ws.getColumn(c).width = 13;
  ws.views = [{ state: 'frozen', ySplit: 4 }];

  // ---- Quarterly
  const wq = wb.addWorksheet('Quarterly Summary');
  wq.getCell('A1').value = `Quarterly Summary by ESD - Goalpara Electrical Circle (FY ${summary.label})`;
  wq.getCell('A1').font = { bold: true, size: 14 };
  header(wq, 4, ['Quarter', ...HEADERS.slice(1)]);
  let q = 5;
  for (const qu of summary.quarterly) {
    for (const row of qu.rows) { countRow(wq, q, [qu.label, row.esd_code, row.esd], row); q += 1; }
    countRow(wq, q, [`${qu.label} TOTAL`, '', ''], qu.total);
    for (let c = 1; c <= 11; c++) { wq.getCell(q, c).fill = TOTAL_FILL; wq.getCell(q, c).font = { bold: true }; }
    q += 1;
  }
  styleRange(wq, 4, q - 1, 11);
  wq.getColumn(1).width = 14; wq.getColumn(3).width = 14;
  for (let c = 4; c <= 11; c++) wq.getColumn(c).width = 13;

  // ---- PR status (deposits vs PR = issued to ESD)
  const wp = wb.addWorksheet('PR Status');
  wp.getCell('A1').value = `Deposits vs PR (Issued to ESD) - FY ${summary.label}`;
  wp.getCell('A1').font = { bold: true, size: 14 };
  const pg = ['New connection', 'Replacement', 'Total deposited', 'PR / issued', 'Pending PR', 'Advance PR'];
  header(wp, 3, ['ESD', ...pg.flatMap((g) => [`${g} 1-Ph`, `${g} 3-Ph`])]);
  [...status.rows, status.total].forEach((r, i) => {
    const row = 4 + i;
    [r.esd, r.new1, r.new3, r.rep1, r.rep3, r.dep1, r.dep3, r.pr1, r.pr3, r.pending1, r.pending3, r.advance1, r.advance3]
      .forEach((v, c) => { wp.getCell(row, c + 1).value = v; });
    if (r === status.total) for (let c = 1; c <= 13; c++) { wp.getCell(row, c).fill = TOTAL_FILL; wp.getCell(row, c).font = { bold: true }; }
  });
  styleRange(wp, 3, 3 + status.rows.length + 1, 13);
  wp.getColumn(1).width = 16;
  for (let c = 2; c <= 13; c++) wp.getColumn(c).width = 12;
  wp.getRow(3).height = 48;
  landscape(wp);

  // ---- PR list
  const wl = wb.addWorksheet('PR List');
  header(wl, 1, ['Date', 'ESD', 'PR No', '1-Ph', '3-Ph', 'Total', 'Note']);
  prs.forEach((pr, i) => {
    const row = i + 2;
    [String(pr.pr_date).slice(0, 10), ESD_BY_CODE[pr.esd_code] || pr.esd_code, pr.pr_no, pr.ph1, pr.ph3, { formula: `D${row}+E${row}`, result: pr.ph1 + pr.ph3 }, pr.note || '']
      .forEach((v, c) => { wl.getCell(row, c + 1).value = v; });
  });
  styleRange(wl, 1, prs.length + 1, 7);
  [12, 14, 26, 8, 8, 8, 30].forEach((w, i) => { wl.getColumn(i + 1).width = w; });
  if (hq && lists) addHqSheets(wb, hq, lists, summary.label);
  return wb;
}

function landscape(ws) {
  ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true };
}

function addHqSheets(wb, hq, lists, label) {
  // ---- circle: requisition vs received
  const wc = wb.addWorksheet('HQ Requisition');
  wc.getCell('A1').value = `Requisition to HQ vs Received - FY ${label}`;
  wc.getCell('A1').font = { bold: true, size: 14 };
  const groups = ['Deposited', 'Requisition to HQ', 'Received from HQ', 'Pending from HQ', 'Advance received', 'Issued to ESDs (PR)', 'Stock in hand'];
  header(wc, 3, groups.flatMap((g) => [`${g} 1-Ph`, `${g} 3-Ph`]));
  const c0 = hq.circle;
  [c0.dep1, c0.dep3, c0.req1, c0.req3, c0.sup1, c0.sup3, c0.pend1, c0.pend3, c0.adv1, c0.adv3, c0.iss1, c0.iss3, c0.stock1, c0.stock3]
    .forEach((v, c) => { wc.getCell(4, c + 1).value = v; });
  styleRange(wc, 3, 4, 14);
  for (let c = 1; c <= 14; c++) wc.getColumn(c).width = 12;
  wc.getRow(3).height = 48;
  landscape(wc);

  // ---- each requisition
  const wr = wb.addWorksheet('Each Requisition');
  wr.getCell('A1').value = `Each Requisition - FY ${label}`;
  wr.getCell('A1').font = { bold: true, size: 14 };
  header(wr, 3, ['Requisition no', 'Date', 'Requisitioned 1-Ph', 'Requisitioned 3-Ph', 'Received 1-Ph', 'Received 3-Ph', 'Pending 1-Ph', 'Pending 3-Ph', 'Advance 1-Ph', 'Advance 3-Ph']);
  let rr = 4;
  for (const r of hq.requisitions) {
    [r.req_no, r.date, r.r1, r.r3, r.h1, r.h3, r.pend1, r.pend3, r.adv1, r.adv3].forEach((v, c) => { wr.getCell(rr, c + 1).value = v; });
    rr += 1;
  }
  if (hq.unlinked.h1 || hq.unlinked.h3) {
    ['Received, not linked to a requisition', '', '', '', hq.unlinked.h1, hq.unlinked.h3, '', '', '', ''].forEach((v, c) => { wr.getCell(rr, c + 1).value = v; });
    rr += 1;
  }
  styleRange(wr, 3, Math.max(rr - 1, 3), 10);
  wr.getColumn(1).width = 20; wr.getColumn(2).width = 12;
  for (let c = 3; c <= 10; c++) wr.getColumn(c).width = 13;
  wr.getRow(3).height = 48;
  landscape(wr);

  // ---- entry lists
  const lists3 = [
    ['HQ Requisition List', ['Date', 'Requisition no', '1-Ph', '3-Ph', 'Note'], lists.reqs, (p) => [String(p.req_date).slice(0, 10), p.req_no, p.ph1, p.ph3, p.note || ''], [12, 22, 8, 8, 30]],
    ['HQ Supply List', ['Date', 'Challan / reference no', 'Requisition', '1-Ph', '3-Ph', 'Note'], lists.supplies, (p) => [String(p.supply_date).slice(0, 10), p.ref_no, p.req_no || '', p.ph1, p.ph3, p.note || ''], [12, 24, 20, 8, 8, 30]],
  ];
  for (const [name, heads, rows, map, widths] of lists3) {
    const w = wb.addWorksheet(name);
    header(w, 1, heads);
    rows.forEach((p, i) => map(p).forEach((v, c) => { w.getCell(i + 2, c + 1).value = v; }));
    styleRange(w, 1, rows.length + 1, heads.length);
    widths.forEach((x, i) => { w.getColumn(i + 1).width = x; });
    landscape(w);
  }
}
