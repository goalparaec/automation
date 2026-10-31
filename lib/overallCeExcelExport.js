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

const GREY = 'FFD6DCE4';
const GREEN = 'FFE2EFDA';

// Column layout. The normal version is exactly the original 19 columns; the
// extended version adds Conventional Prepaid and Temporary on both the demand
// and the collection side (always shown in the Excel, even when they are 0).
// [header, key, kind]
function layout(ext) {
  const gd = ext ? 'grand_demand_ext' : 'grand_demand';
  const gc = ext ? 'grand_collection_ext' : 'grand_collection';
  const ce = ext ? 'overall_ce_ext' : 'overall_ce';
  const rq = ext ? 'required_100_ext' : 'required_100';
  const cols = [
    ['Current Demand (Postpaid)', 'postpaid_current', 'n'],
    ['Arrear Demand (Postpaid)', 'postpaid_arrear', 'n'],
    ['Daily Collection (Postpaid)', 'postpaid_daily', 'n'],
    ['Total Collection (Postpaid)', 'postpaid_total', 'n'],
    ['Coll Eff. % (Postpaid)', 'postpaid_ce', 'p'],
    ['Current Demand (Prepaid)', 'prepaid_current', 'n'],
    ['Manual Amount Not Reflected in ARMS', 'manual_amount', 'n'],
    ['Assessment Amount', 'assessment_amount', 'n'],
    ...(ext ? [
      ['Conventional Prepaid Amount Not Reflected in ARMS', 'conv_prepaid_amount', 'n'],
      ['Temporary Connection Amount', 'temporary_amount', 'n'],
    ] : []),
    ['Converted Current Demand', 'converted_current', 'n'],
    ['Grand Total Current Demand', gd, 'n'],
    ['Recharge of Smart Prepaid', 'recharge', 'n'],
    ['Credit Adjustment', 'credit_adjustment', 'n'],
    ['Outstanding Payment Amount', 'outstanding_payment', 'n'],
    ['Manual Amount Not Reflected in ARMS', 'manual_collection', 'n'],
    ['Assessment Amount', 'assessment_collection', 'n'],
    ...(ext ? [
      ['Conventional Prepaid Amount Not Reflected in ARMS', 'conv_prepaid_collection', 'n'],
      ['Temporary Connection Amount', 'temporary_collection', 'n'],
    ] : []),
    ['Collection Against Converted', 'converted_collection', 'n'],
    ['Grand Total Collection (Prepaid & Postpaid)', gc, 'n'],
    ['Overall Coll Eff. %', ce, 'p'],
    ['Required for 100% CE (negative = surplus)', rq, 'n'],
  ];
  const ix = (k) => cols.findIndex((c) => c[1] === k);
  const bands = [
    ['Postpaid Demand and Collection', 0, 4, GREY],
    ['Prepaid and Additional Demand', 5, ix(gd) - 1, GREY],
    ['Grand Total Current Demand', ix(gd), ix(gd), GREEN],
    ['Prepaid and Additional Collection', ix(gd) + 1, ix(gc) - 1, GREY],
    ['Grand Total Collection (Prepaid & Postpaid)', ix(gc), ix(gc), GREEN],
    ['Overall Coll Eff. %', ix(ce), ix(ce), GREEN],
    ['Required for 100% CE (negative = surplus)', ix(rq), ix(rq), GREEN],
  ];
  return {
    COLS: cols,
    BANDS: bands,
    // Columns that get the red-yellow-green scale (same as the Excel): index into cols.
    HEAT_COLS: [2, 4, ix(ce)],
    // Single-column bands: band and heading are the same text, so merge rows 3-4 into one cell.
    SOLO: new Set([ix(gd), ix(gc), ix(ce), ix(rq)]),
    // The wide table is cut in two, one below the other, so it stays readable in print.
    SPLIT: ix(gd) + 1, // first table: everything up to Grand Total Current Demand
  };
}

export async function buildOverallCeWorkbook(report, { extended = false } = {}) {
  const { COLS, BANDS, HEAT_COLS, SOLO, SPLIT } = layout(extended);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Goalpara Circle Reporting System';
  wb.created = new Date();
  const ws = wb.addWorksheet('CE_All');

  const first = 3; // data columns start at C (A = Sl No, B = Sub-Division)
  const lastCol = first + SPLIT - 1;
  const border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

  ws.mergeCells(1, 1, 1, lastCol);
  ws.getCell(1, 1).value = `Overall Collection Efficiency of ${CIRCLE} for the Month of ${monthTitle(report.reportDate)}`;
  ws.getCell(1, 1).font = { bold: true, size: 13 };
  ws.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  ws.getCell(1, 1).fill = fill('FFDDEBF7');
  ws.getRow(1).height = 30;

  ws.mergeCells(2, 1, 2, lastCol);
  const sub = ws.getCell(2, 1);
  sub.value = `As on ${dmy(report.reportDate)}  |  Amounts in Rs` +
    (report.missing?.length ? `   -   Incomplete, not yet uploaded this month (counted as 0): ${report.missing.join('; ')}` : '');
  sub.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  sub.font = { size: 11, color: { argb: report.missing?.length ? 'FFB91C1C' : 'FF374151' }, bold: !!report.missing?.length };
  ws.getRow(2).height = report.missing?.length ? 32 : 20;

  const n = report.rows.length;
  const groups = [[0, SPLIT - 1], [SPLIT, COLS.length - 1]];
  const breaks = [];
  let top = 3;
  groups.forEach(([g0, g1], gi) => {
    const bandRow = top;
    const headRow = top + 1;
    const dataStart = top + 2;
    for (const [label, a, b, tone] of BANDS) {
      if (a < g0 || b > g1) continue;
      const ca = first + a - g0;
      const cb = first + b - g0;
      if (b > a) ws.mergeCells(bandRow, ca, bandRow, cb);
      else ws.mergeCells(bandRow, ca, headRow, ca);
      for (let c = ca; c <= cb; c++) ws.getCell(bandRow, c).fill = fill(tone);
      ws.getCell(bandRow, ca).value = label;
    }
    for (let c = 1; c <= lastCol; c++) {
      const band = ws.getCell(bandRow, c);
      band.font = { bold: true };
      band.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      if (c < first) band.fill = fill(GREEN);
      band.border = border;
    }
    ws.getRow(bandRow).height = 32;
    ws.mergeCells(bandRow, 1, headRow, 1);
    ws.mergeCells(bandRow, 2, headRow, 2);
    ws.getCell(bandRow, 1).value = 'Sl No';
    ws.getCell(bandRow, 2).value = 'Sub-Division';
    const head = ws.getRow(headRow);
    for (let i = g0; i <= g1; i++) if (!SOLO.has(i)) head.getCell(first + i - g0).value = COLS[i][0];
    head.height = 64;
    head.eachCell({ includeEmpty: true }, (c) => {
      c.font = { bold: true };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.fill = fill(GREEN);
      c.border = border;
    });

    report.rows.forEach((r, idx) => {
      const rn = dataStart + idx;
      const row = ws.getRow(rn);
      row.getCell(1).value = r.sl_no ?? '';
      row.getCell(2).value = r.name;
      if (r.isTotal) { ws.mergeCells(rn, 1, rn, 2); row.getCell(1).value = r.name; }
      for (let i = g0; i <= g1; i++) {
        const [, key, kind] = COLS[i];
        const cell = row.getCell(first + i - g0);
        cell.value = r[key] === null || r[key] === undefined ? '' : r[key];
        cell.numFmt = kind === 'p' ? PCT : NUM;
      }
      row.eachCell({ includeEmpty: true }, (c) => {
        c.border = border;
        c.alignment = { vertical: 'middle', horizontal: c.col === 2 && !r.isTotal ? 'left' : c.col <= 2 ? 'center' : 'right' };
        if (r.isTotal) {
          c.font = { bold: true };
          if (r.name === 'Circle Total') c.fill = fill('FFFCE4D6');
        }
      });
      row.height = 20;
    });

    // Same red-yellow-green colour scale as before, on the 5 sub-division rows only.
    for (const idx of HEAT_COLS) {
      if (idx < g0 || idx > g1) continue;
      const col = ws.getColumn(first + idx - g0).letter;
      ws.addConditionalFormatting({
        ref: `${col}${dataStart}:${col}${dataStart + 4}`,
        rules: [{
          type: 'colorScale',
          cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }],
          color: [{ argb: 'FFF8696B' }, { argb: 'FFFFEB84' }, { argb: 'FF63BE7B' }],
        }],
      });
    }
    top = dataStart + n + 1; // one blank row between the two tables
    if (gi === 0) breaks.push(top);
  });

  ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1, horizontalCentered: true };
  ws.pageSetup.margins = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };

  ws.getColumn(1).width = 7;
  ws.getColumn(2).width = 16;
  for (let c = first; c <= lastCol; c++) ws.getColumn(c).width = 18;
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 2 }];

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
    label: extended ? 'Monthly inputs (manual / assessment / conventional prepaid / temporary)' : 'Monthly inputs (manual / assessment)',
    status: report.monthlyPresent ? 'Entered for this month' : 'NOT ENTERED THIS MONTH (counted as 0)',
  });

  return wb;
}
