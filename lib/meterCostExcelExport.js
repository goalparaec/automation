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

export async function buildMeterCostWorkbook({ summary, status, prs }) {
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

  // ---- PR status
  const wp = wb.addWorksheet('PR Status');
  wp.getCell('A1').value = `Deposits vs PR - FY ${summary.label}`;
  wp.getCell('A1').font = { bold: true, size: 14 };
  header(wp, 3, ['ESD', 'Type', 'Deposited 1-Ph', 'Deposited 3-Ph', 'PR raised 1-Ph', 'PR raised 3-Ph', 'Pending PR 1-Ph', 'Pending PR 3-Ph', 'Advance PR 1-Ph', 'Advance PR 3-Ph']);
  let p = 4;
  for (const row of [...status.rows, status.total]) {
    for (const kind of ['new', 'rep']) {
      const s = row[kind];
      const vals = [row.esd, kind === 'new' ? KIND_LABEL.new : KIND_LABEL.replacement, s.dep1, s.dep3, s.pr1, s.pr3, s.pending1, s.pending3, s.advance1, s.advance3];
      vals.forEach((v, i) => { wp.getCell(p, i + 1).value = v; });
      if (row === status.total) for (let c = 1; c <= 10; c++) { wp.getCell(p, c).fill = TOTAL_FILL; wp.getCell(p, c).font = { bold: true }; }
      p += 1;
    }
  }
  styleRange(wp, 3, p - 1, 10);
  wp.getColumn(1).width = 16; wp.getColumn(2).width = 16;
  for (let c = 3; c <= 10; c++) wp.getColumn(c).width = 14;

  // ---- PR list
  const wl = wb.addWorksheet('PR List');
  header(wl, 1, ['Date', 'ESD', 'PR No', 'Type', '1-Ph', '3-Ph', 'Total', 'Note']);
  prs.forEach((pr, i) => {
    const row = i + 2;
    [String(pr.pr_date).slice(0, 10), ESD_BY_CODE[pr.esd_code] || pr.esd_code, pr.pr_no, KIND_LABEL[pr.kind], pr.ph1, pr.ph3, { formula: `E${row}+F${row}`, result: pr.ph1 + pr.ph3 }, pr.note || '']
      .forEach((v, c) => { wl.getCell(row, c + 1).value = v; });
  });
  styleRange(wl, 1, prs.length + 1, 8);
  [12, 14, 26, 16, 8, 8, 8, 30].forEach((w, i) => { wl.getColumn(i + 1).width = w; });
  return wb;
}
