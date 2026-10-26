import ExcelJS from 'exceljs';
import { FIELDS, CATEGORY_NAMES, hqLayoutRow } from './hqMrrCore.js';
import { SUMMARY_COLS, CATEGORY_COLS, groupSpans, EXCEL_FMT } from './hqMrrColumns.js';

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

export async function buildHqMrrWorkbook(report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Goalpara Circle Reporting System';
  const present = report.esds.filter((e) => e.present);
  const sub = `${report.monthLabel}  |  Amounts in Rs lakhs, energy in MU  |  Collection efficiency = Grand total collection / Current demand (ESD only, IRCA excluded)  |  Billing efficiency = (ESD + IRCA units) / injection`;

  // ---------------------------------------------------------- circle summary
  {
    const ws = wb.addWorksheet('Circle Summary', { views: [{ state: 'frozen', xSplit: 2, ySplit: 5 }] });
    title(ws, `Goalpara Electrical Circle - MRR Summary - ${report.monthLabel}`, sub);
    if (report.missingFiles.length) {
      ws.getCell('A3').value = `Incomplete: no MRR file for ${report.missingFiles.join(', ')}. The circle total covers only the ESDs shown.`;
      ws.getCell('A3').font = { bold: true, color: { argb: 'FFC00000' } };
    }
    const rows = present.map((e, i) => ({ lead: [i + 1, e.name], values: e.summary }));
    const total = { lead: ['', 'Goalpara Circle'], values: report.circle.summary };
    writeTable(ws, 4, ['Sl No', 'ESD'], SUMMARY_COLS, rows, total);
    setWidths(ws, [7, 18], SUMMARY_COLS);
  }

  // ---------------------------------------------------- one sheet per ESD
  for (const e of present) {
    const ws = wb.addWorksheet(e.name);
    title(ws, `${e.name} ESD - MRR Analysis - ${report.monthLabel}`, esdNote(e));

    // key figures, one under the other
    ws.getCell('A4').value = 'Summary';
    ws.getCell('A4').font = { bold: true, size: 12 };
    let r = 5;
    const seenLabels = new Set();
    for (const c of SUMMARY_COLS) {
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
    writeTable(ws, start, ['Category'], CATEGORY_COLS, rows, { lead: ['TOTAL'], values: e.categories.total });
    CATEGORY_COLS.forEach((c, i) => { ws.getColumn(2 + i).width = c.fmt === 'pct' ? 13 : 16; });
    ws.getColumn(1).width = 60;
  }

  // ------------------------------------------------------ circle categories
  {
    const ws = wb.addWorksheet('Category - Circle', { views: [{ state: 'frozen', xSplit: 2, ySplit: 5 }] });
    title(ws, `Goalpara Electrical Circle - Category-wise - ${report.monthLabel}`, sub);
    const rows = report.circle.categories.rows.map((x, i) => ({ lead: [i + 1, x.name], values: x }));
    writeTable(ws, 4, ['Sl No', 'Category'], CATEGORY_COLS, rows, { lead: ['', 'TOTAL'], values: report.circle.categories.total });
    setWidths(ws, [7, 46], CATEGORY_COLS);
  }

  // ------------------------------------------------ HQ "ESD MRR" layout rows
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
  }

  return wb;
}
