import ExcelJS from 'exceljs';
import { FIELDS, CATEGORY_NAMES, hqLayoutRow } from './hqMrrCore.js';
import { SUMMARY_COLS, CATEGORY_COLS, groupSpans, EXCEL_FMT } from './hqMrrColumns.js';
import { trimSummaryCols, trimCategoryCols } from './hqMrrTrim.js';

const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
const GROUP_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC5D5EA' } };
const TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };
const KEY_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
const thin = { style: 'thin', color: { argb: 'FF666666' } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

const num = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : v);

/**
 * Two-row header + data rows + optional total row.
 * lead = number of text columns before the numeric ones (labels).
 * Returns the next free row.
 */
function writeTable(ws, startRow, leadLabels, cols, rows, totalRow) {
  const lead = leadLabels.length;
  const groups = groupSpans(cols);
  const r1 = startRow;
  const r2 = startRow + 1;

  leadLabels.forEach((l, i) => {
    ws.mergeCells(r1, i + 1, r2, i + 1);
    const c = ws.getCell(r1, i + 1);
    c.value = l;
  });
  let col = lead + 1;
  for (const g of groups) {
    if (g.label) {
      if (g.span > 1) ws.mergeCells(r1, col, r1, col + g.span - 1);
      ws.getCell(r1, col).value = g.label;
      for (let k = 0; k < g.span; k++) {
        const c = cols[col - lead - 1 + k];
        ws.getCell(r2, col + k).value = c.label;
      }
    } else {
      ws.mergeCells(r1, col, r2, col);
      ws.getCell(r1, col).value = cols[col - lead - 1].label;
    }
    col += g.span;
  }
  for (let c = 1; c <= lead + cols.length; c++) {
    for (const r of [r1, r2]) {
      const cell = ws.getCell(r, c);
      cell.font = { bold: true };
      cell.fill = r === r1 && groups.length && c > lead ? GROUP_FILL : HEAD_FILL;
      cell.border = BORDER;
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    }
  }
  ws.getRow(r1).height = 30;
  ws.getRow(r2).height = 62;

  let r = startRow + 2;
  const all = totalRow ? [...rows, { ...totalRow, _total: true }] : rows;
  for (const row of all) {
    row.lead.forEach((v, i) => { ws.getCell(r, i + 1).value = v; });
    cols.forEach((c, i) => {
      const cell = ws.getCell(r, lead + 1 + i);
      cell.value = num(row.values[c.key]);
      cell.numFmt = EXCEL_FMT[c.fmt];
    });
    for (let c = 1; c <= lead + cols.length; c++) {
      const cell = ws.getCell(r, c);
      cell.border = BORDER;
      cell.alignment = { vertical: 'middle', horizontal: c <= lead ? 'left' : 'right' };
      if (row._total) {
        cell.font = { bold: true };
        cell.fill = TOTAL_FILL;
      } else if (c > lead && cols[c - lead - 1].strong) {
        cell.fill = KEY_FILL;
        cell.font = { bold: true };
      }
    }
    r += 1;
  }
  return r;
}

function setWidths(ws, lead, cols) {
  lead.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  cols.forEach((c, i) => {
    ws.getColumn(lead.length + 1 + i).width = c.fmt === 'pct' ? 12 : c.fmt === 'int' ? 13 : 15;
  });
}

function title(ws, text, sub) {
  ws.getCell('A1').value = text;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A2').value = sub;
  ws.getCell('A2').font = { italic: true, color: { argb: 'FF555555' } };
}

function esdNote(e) {
  const s = e.summary;
  const inj = e.injection_kwh ? '' : '  |  Energy injection not entered - billing efficiency is blank (enter it on the Monthly Inputs page).';
  return `Energy injected ${s.injected_mu === null ? '-' : s.injected_mu.toFixed(3)} MU  |  IRCA units ${s.irca_billed_mu.toFixed(3)} MU${inj}`;
}

/** Landscape, one page wide, repeating heading rows, page numbers. A3 for the wide full sheets, A4 for trimmed ones. */
function printSetup(ws, { paper = 8, titlesRow, titlesCol } = {}) {
  Object.assign(ws.pageSetup, {
    orientation: 'landscape',
    paperSize: paper,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.25 },
  });
  if (titlesRow) ws.pageSetup.printTitlesRow = titlesRow;
  if (titlesCol) ws.pageSetup.printTitlesColumn = titlesCol;
  ws.headerFooter.oddFooter = '&L&8Goalpara Electrical Circle&C&8Page &P of &N&R&8Printed &D';
}

const PAPER = { full: 8, trim: 9 }; // A3 / A4

function circleSheet(wb, report, sub, cols, name, trim) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', xSplit: 2, ySplit: 5 }] });
  title(ws, `Goalpara Electrical Circle - MRR Summary${trim ? ' (Short)' : ''} - ${report.monthLabel}`, sub);
  if (report.missingFiles.length) {
    ws.getCell('A3').value = `Incomplete: no MRR file for ${report.missingFiles.join(', ')}. The circle total covers only the ESDs shown.`;
    ws.getCell('A3').font = { bold: true, color: { argb: 'FFC00000' } };
  }
  const present = report.esds.filter((e) => e.present);
  const rows = present.map((e, i) => ({ lead: [i + 1, e.name], values: e.summary }));
  const total = { lead: ['', 'Goalpara Circle'], values: report.circle.summary };
  writeTable(ws, 4, ['Sl No', 'ESD'], cols, rows, total);
  setWidths(ws, [7, 18], cols);
  printSetup(ws, { paper: trim ? PAPER.trim : PAPER.full, titlesRow: '4:5', titlesCol: 'A:B' });
}

function esdSheet(wb, report, e, sCols, cCols, name, trim) {
  const ws = wb.addWorksheet(name);
  title(ws, `${e.name} ESD - MRR Analysis${trim ? ' (Short)' : ''} - ${report.monthLabel}`, esdNote(e));

  // key figures, one under the other
  ws.getCell('A4').value = 'Summary';
  ws.getCell('A4').font = { bold: true, size: 12 };
  let r = 5;
  const seenLabels = new Set();
  for (const c of sCols) {
    const label = c.group ? `${c.group} - ${c.label}` : c.label;
    if (seenLabels.has(label)) continue;
    seenLabels.add(label);
    const a = ws.getCell(r, 1);
    a.value = label;
    a.border = BORDER;
    a.fill = HEAD_FILL;
    const b = ws.getCell(r, 2);
    b.value = num(e.summary[c.key]);
    b.numFmt = EXCEL_FMT[c.fmt];
    b.border = BORDER;
    if (c.strong) { a.font = { bold: true }; b.font = { bold: true }; b.fill = KEY_FILL; }
    r += 1;
  }
  // category-wise table (category names share column A with the labels above)
  const start = r + 2;
  ws.getCell(start - 1, 1).value = 'Category-wise';
  ws.getCell(start - 1, 1).font = { bold: true, size: 12 };
  const rows = e.categories.rows.map((x, i) => ({ lead: [`${i + 1}. ${x.name}`], values: x }));
  writeTable(ws, start, ['Category'], cCols, rows, { lead: ['TOTAL'], values: e.categories.total });
  cCols.forEach((c, i) => { ws.getColumn(2 + i).width = c.fmt === 'pct' ? 13 : 16; });
  ws.getColumn(1).width = 60;
  ws.getRow(start - 1).addPageBreak(); // summary on page 1, category-wise table starts page 2
  printSetup(ws, { paper: trim ? PAPER.trim : PAPER.full });
}

function categoryCircleSheet(wb, report, sub, cCols, name, trim) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', xSplit: 2, ySplit: 5 }] });
  title(ws, `Goalpara Electrical Circle - Category-wise${trim ? ' (Short)' : ''} - ${report.monthLabel}`, sub);
  const rows = report.circle.categories.rows.map((x, i) => ({ lead: [i + 1, x.name], values: x }));
  writeTable(ws, 4, ['Sl No', 'Category'], cCols, rows, { lead: ['', 'TOTAL'], values: report.circle.categories.total });
  setWidths(ws, [7, 46], cCols);
  printSetup(ws, { paper: trim ? PAPER.trim : PAPER.full, titlesRow: '4:5', titlesCol: 'A:B' });
}

export async function buildHqMrrWorkbook(report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Goalpara Circle Reporting System';
  const present = report.esds.filter((e) => e.present);
  const sub = `${report.monthLabel}  |  Amounts in Rs lakhs, energy in MU  |  Collection efficiency = Grand total collection / Current demand (ESD only, IRCA excluded)  |  Billing efficiency = (ESD + IRCA units) / injection`;
  const sTrim = trimSummaryCols();
  const cTrim = trimCategoryCols();

  // circle summary: full, then short
  circleSheet(wb, report, sub, SUMMARY_COLS, 'Circle Summary', false);
  circleSheet(wb, report, sub, sTrim, 'Circle Summary (Short)', true);

  // one full + one short sheet per ESD
  for (const e of present) {
    esdSheet(wb, report, e, SUMMARY_COLS, CATEGORY_COLS, e.name, false);
    esdSheet(wb, report, e, sTrim, cTrim, `${e.name} (Short)`, true);
  }

  // circle categories: full, then short
  categoryCircleSheet(wb, report, sub, CATEGORY_COLS, 'Category - Circle', false);
  categoryCircleSheet(wb, report, sub, cTrim, 'Category - Circle (Short)', true);

  // HQ "ESD MRR" layout rows
  {
    const ws = wb.addWorksheet('MRR (HQ format)', { views: [{ state: 'frozen', xSplit: 3, ySplit: 1 }] });
    const head = ['Office', 'CATEGORY_CODE', 'CATEGORY_NAME', ...FIELDS.map((f) => f[1]), 'M_MONTHNAME', 'Y_YEAR'];
    head.forEach((h, i) => {
      const c = ws.getCell(1, i + 1);
      c.value = h;
      c.font = { bold: true };
      c.fill = HEAD_FILL;
      c.border = BORDER;
      c.alignment = { horizontal: 'center', wrapText: true };
    });
    let r = 2;
    for (const e of present) {
      for (const row of e.rows) {
        hqLayoutRow(e.name, { ...row, category_name: row.category_name || CATEGORY_NAMES[row.category_code] }, report.month).forEach((v, i) => {
          ws.getCell(r, i + 1).value = v;
        });
        r += 1;
      }
    }
    ws.getColumn(1).width = 20;
    ws.getColumn(3).width = 40;
    ws.getRow(1).height = 32;
    ws.getCell(r + 1, 1).value = 'Same layout as HQ\'s ESD MRR sheet: energy in MU, money in Rs lakhs.';
    ws.getCell(r + 1, 1).font = { italic: true };
    printSetup(ws, { paper: PAPER.full, titlesRow: '1:1', titlesCol: 'A:C' });
  }

  return wb;
}
