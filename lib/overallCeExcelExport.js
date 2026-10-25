import ExcelJS from 'exceljs';

const CIRCLE = 'Goalpara Electrical Circle';
const NUM = '#,##0';
const PCT = '0.00%';

function monthTitle(iso) {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function dmy(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

// [header, key, kind]
const COLS = [
  ['Current Demand (Postpaid)', 'postpaid_current', 'n'],
  ['Arrear Demand (Postpaid)', 'postpaid_arrear', 'n'],
  ['Daily Collection (Postpaid)', 'postpaid_daily', 'n'],
  ['Total Collection (Postpaid)', 'postpaid_total', 'n'],
  ['Coll Eff. % (Postpaid)', 'postpaid_ce', 'p'],
  ['Current Demand (Prepaid)', 'prepaid_current', 'n'],
  ['Manual Amount Not Reflected in ARMS', 'manual_amount', 'n'],
  ['Assessment Amount Not Reflected in ARMS', 'assessment_amount', 'n'],
  ['Converted Current Demand', 'converted_current', 'n'],
  ['Grand Total Current Demand', 'grand_demand', 'n'],
  ['Recharge of Smart Prepaid', 'recharge', 'n'],
  ['Credit Adjustment', 'credit_adjustment', 'n'],
  ['Manual Amount Not Reflected in ARMS', 'manual_collection', 'n'],
  ['Assessment Amount Not Reflected in ARMS', 'assessment_collection', 'n'],
  ['Collection Against Converted', 'converted_collection', 'n'],
  ['Grand Total Collection (Prepaid & Postpaid)', 'grand_collection', 'n'],
  ['Overall Coll Eff. %', 'overall_ce', 'p'],
];
// Band row over the header: [label, first data column index, last data column index]
const BANDS = [
  ['Postpaid Demand and Collection', 0, 4],
  ['Prepaid and Additional Demand', 5, 8],
  ['Grand Total Current Demand', 9, 9],
  ['Prepaid and Additional Collection', 10, 14],
  ['Grand Total Collection (Prepaid & Postpaid)', 15, 15],
  ['Overall Coll Eff. %', 16, 16],
];

export async function buildOverallCeWorkbook(report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Goalpara Circle Reporting System';
  wb.created = new Date();
  const ws = wb.addWorksheet('CE_All');

  const first = 3; // data columns start at C (A = Sl No, B = Sub-Division)
  const lastCol = first + COLS.length - 1;

  ws.mergeCells(1, 1, 1, lastCol);
  ws.getCell(1, 1).value = `Overall Collection Efficiency of ${CIRCLE} for the Month of ${monthTitle(report.reportDate)} (as on ${dmy(report.reportDate)})`;
  ws.getCell(1, 1).font = { bold: true, size: 13 };
  ws.getCell(1, 1).alignment = { horizontal: 'center' };

  const border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

  // Band row (3) and header row (4)
  for (const [label, a, b] of BANDS) {
    if (b > a) ws.mergeCells(3, first + a, 3, first + b);
    const c = ws.getCell(3, first + a);
    c.value = label;
  }
  for (let c = 1; c <= lastCol; c++) {
    const band = ws.getCell(3, c);
    band.font = { bold: true };
    band.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    band.fill = fill('FFB7CCE3');
    band.border = border;
  }
  const head = ws.getRow(4);
  head.getCell(1).value = 'Sl No';
  head.getCell(2).value = 'Sub-Division';
  COLS.forEach(([h], i) => { head.getCell(first + i).value = h; });
  head.height = 48;
  head.eachCell((c) => {
    c.font = { bold: true };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.fill = fill('FFDCE6F1');
    c.border = border;
  });

  report.rows.forEach((r, idx) => {
    const row = ws.getRow(5 + idx);
    row.getCell(1).value = r.sl_no ?? '';
    row.getCell(2).value = r.name;
    COLS.forEach(([, key, kind], i) => {
      const cell = row.getCell(first + i);
      cell.value = r[key] === null || r[key] === undefined ? '' : r[key];
      cell.numFmt = kind === 'p' ? PCT : NUM;
    });
    row.eachCell({ includeEmpty: true }, (c) => {
      c.border = border;
      if (r.name === 'Goalpara ED' || r.name === 'Circle Total') {
        c.font = { bold: true };
        c.fill = fill('FFFFF2CC');
      }
    });
  });

  ws.getColumn(1).width = 7;
  ws.getColumn(2).width = 16;
  for (let c = first; c <= lastCol; c++) ws.getColumn(c).width = 17;
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 4 }];

  // Sources: which file/date each number came from.
  const src = wb.addWorksheet('Data_Used');
  src.columns = [
    { header: 'Input', key: 'label', width: 40 },
    { header: 'Data from date', key: 'date', width: 16 },
    { header: 'Status', key: 'status', width: 34 },
    { header: 'Source', key: 'source', width: 30 },
  ];
  src.getRow(1).font = { bold: true };
  for (const s of report.sources) {
    src.addRow({
      label: s.label,
      date: s.effectiveDate ? dmy(s.effectiveDate) : '',
      status: !s.present ? 'NOT UPLOADED THIS MONTH (counted as 0)' : s.isCarriedForward ? 'Carried forward from earlier this month' : 'Uploaded for this date',
      source: s.source || '',
    });
  }
  src.addRow({
    label: 'Monthly inputs (manual / assessment)',
    status: report.monthlyPresent ? 'Entered for this month' : 'NOT ENTERED THIS MONTH (counted as 0)',
  });

  return wb;
}
