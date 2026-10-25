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
// Band row over the header: [label, first data column index, last data column index, fill]
const GREY = 'FFD6DCE4';
const GREEN = 'FFE2EFDA';
const BANDS = [
  ['Postpaid Demand and Collection', 0, 4, GREY],
  ['Prepaid and Additional Demand', 5, 8, GREY],
  ['Grand Total Current Demand', 9, 9, GREEN],
  ['Prepaid and Additional Collection', 10, 14, GREY],
  ['Grand Total Collection (Prepaid & Postpaid)', 15, 15, GREEN],
  ['Overall Coll Eff. %', 16, 16, GREEN],
];
// Columns that get the red-yellow-green scale (same as the Excel): index into COLS.
const HEAT_COLS = [2, 4, 16];
// Single-column bands (Grand Total Current Demand = 9, Grand Total Collection = 15,
// Overall CE = 16): band and heading are the same text, so merge rows 3-4 into one cell.
const SOLO = new Set([9, 15, 16]);

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
  ws.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  ws.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
  ws.getRow(1).height = 30;

  const border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

  // Band row (3) and header row (4)
  for (const [label, a, b, tone] of BANDS) {
    if (b > a) ws.mergeCells(3, first + a, 3, first + b);
    else ws.mergeCells(3, first + a, 4, first + a);
    for (let c = first + a; c <= first + b; c++) ws.getCell(3, c).fill = fill(tone);
    ws.getCell(3, first + a).value = label;
  }
  for (let c = 1; c <= lastCol; c++) {
    const band = ws.getCell(3, c);
    band.font = { bold: true };
    band.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    if (c < first) band.fill = fill(GREEN);
    band.border = border;
  }
  ws.getRow(3).height = 32;
  ws.mergeCells(3, 1, 4, 1);
  ws.mergeCells(3, 2, 4, 2);
  ws.getCell(3, 1).value = 'Sl No';
  ws.getCell(3, 2).value = 'Sub-Division';
  const head = ws.getRow(4);
  COLS.forEach(([h], i) => { if (!SOLO.has(i)) head.getCell(first + i).value = h; });
  head.height = 64;
  head.eachCell({ includeEmpty: true }, (c) => {
    c.font = { bold: true };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.fill = fill(GREEN);
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
      c.alignment = { vertical: 'middle', horizontal: c.col === 2 ? 'left' : c.col === 1 ? 'center' : 'right' };
      if (r.isTotal) {
        c.font = { bold: true };
        if (r.name === 'Circle Total') c.fill = fill('FFFCE4D6');
      }
    });
    row.height = 20;
  });

  // Same red-yellow-green colour scale as the Excel report, on the 5 sub-division rows only.
  for (const idx of HEAT_COLS) {
    const col = ws.getColumn(first + idx).letter;
    ws.addConditionalFormatting({
      ref: `${col}5:${col}9`,
      rules: [{
        type: 'colorScale',
        cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }],
        color: [{ argb: 'FFF8696B' }, { argb: 'FFFFEB84' }, { argb: 'FF63BE7B' }],
      }],
    });
  }
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  ws.getColumn(1).width = 7;
  ws.getColumn(2).width = 16;
  for (let c = first; c <= lastCol; c++) ws.getColumn(c).width = 18;
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
