import ExcelJS from 'exceljs';
import { FIELDS, CATEGORY_NAMES, hqLayoutRow } from './hqMrrCore.js';
import {
  SUMMARY_COLS, CATEGORY_COLS, SUMMARY_SECTIONS, CATEGORY_SECTIONS,
  groupSpans, sectionCols, packBlocks, EXCEL_FMT,
} from './hqMrrColumns.js';
import { trimSummaryCols, trimCategoryCols, keepNonEmpty } from './hqMrrTrim.js';

const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
const GROUP_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC5D5EA' } };
const TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };
const KEY_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
const DIVIDER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8CCE4' } };
const thin = { style: 'thin', color: { argb: 'FF666666' } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const FONT = { name: 'Calibri', size: 10 };

const num = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : v);

// ---------------------------------------------------------------- page maths
// Usable print area in points (A4, narrow margins) and the width of an Excel column in points.
const PAGE = {
  landscape: { w: 799, h: 519 },
  portrait: { w: 552, h: 766 },
};
const colPt = (w) => w * 5.25 + 3.75;
const NUM_W = 12.5;
const TITLE_H = 26;
const HDR1_H = 22;
const HDR2_H = 58;
const ROW_H = 18;

function printSetup(ws, { orientation, scale, paper = 9, titlesRow = '1:1', titlesCol }) {
  Object.assign(ws.pageSetup, {
    orientation,
    paperSize: paper,
    fitToPage: false,
    scale,
    horizontalCentered: true,
    margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.55, header: 0.2, footer: 0.25 },
  });
  if (titlesRow) ws.pageSetup.printTitlesRow = titlesRow;
  if (titlesCol) ws.pageSetup.printTitlesColumn = titlesCol;
  ws.headerFooter.oddFooter = '&L&8Goalpara Electrical Circle&C&8Page &P of &N&R&8&D';
}

function scaleFor(orientation, widthPt) {
  return Math.max(40, Math.min(100, Math.floor((PAGE[orientation].w * 0.93 / widthPt) * 100)));
}

function title(ws, text) {
  ws.getCell('A1').value = text;
  ws.getCell('A1').font = { name: 'Calibri', bold: true, size: 14 };
  ws.getRow(1).height = TITLE_H;
}

function styleCell(cell, { bold, fill, align = 'right', wrap = false, shrink = false } = {}) {
  cell.font = { ...FONT, bold: !!bold };
  cell.border = BORDER;
  if (fill) cell.fill = fill;
  cell.alignment = { vertical: 'middle', horizontal: align, wrapText: wrap, shrinkToFit: shrink };
}

// ---------------------------------------------------------------- blocks
/**
 * One block: two heading rows, then a row per entry, then an optional total row.
 * Returns the next free row.
 */
function writeBlock(ws, startRow, leadLabels, cols, rows, total, { leadShrink = false, rowH = ROW_H, hdr2 = HDR2_H } = {}) {
  const lead = leadLabels.length;
  const r1 = startRow;
  const r2 = startRow + 1;
  const groups = groupSpans(cols);

  leadLabels.forEach((l, i) => {
    ws.mergeCells(r1, i + 1, r2, i + 1);
    ws.getCell(r1, i + 1).value = l;
  });
  let col = lead + 1;
  for (const g of groups) {
    if (g.label) {
      if (g.span > 1) ws.mergeCells(r1, col, r1, col + g.span - 1);
      ws.getCell(r1, col).value = g.label;
      for (let k = 0; k < g.span; k++) ws.getCell(r2, col + k).value = cols[col - lead - 1 + k].label;
    } else {
      ws.mergeCells(r1, col, r2, col);
      ws.getCell(r1, col).value = cols[col - lead - 1].label;
    }
    col += g.span;
  }
  const hasGroups = groups.some((g) => g.label);
  for (let c = 1; c <= lead + cols.length; c++) {
    for (const r of [r1, r2]) {
      styleCell(ws.getCell(r, c), { bold: true, fill: r === r1 && c > lead && hasGroups ? GROUP_FILL : HEAD_FILL, align: 'center', wrap: true });
    }
  }
  ws.getRow(r1).height = HDR1_H;
  ws.getRow(r2).height = hdr2;

  let r = startRow + 2;
  const all = total ? [...rows, { ...total, _total: true }] : rows;
  for (const row of all) {
    row.lead.forEach((v, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = v;
      styleCell(cell, { align: 'left', bold: row._total, fill: row._total ? TOTAL_FILL : undefined, shrink: leadShrink && i === lead - 1 });
    });
    cols.forEach((c, i) => {
      const cell = ws.getCell(r, lead + 1 + i);
      cell.value = num(row.values[c.key]);
      cell.numFmt = EXCEL_FMT[c.fmt];
      styleCell(cell, { bold: row._total || c.strong, fill: row._total ? TOTAL_FILL : c.strong ? KEY_FILL : undefined });
    });
    ws.getRow(r).height = rowH;
    r += 1;
  }
  return r;
}

/** Blocks one below the other; a block that would be cut by the page edge starts a new page. Returns the print scale. */
function stackBlocks(ws, orientation, leadLabels, leadWidths, blocks, rows, total, opts = {}) {
  const leadPt = leadWidths.reduce((s, w) => s + colPt(w), 0);
  const maxCols = Math.max(...blocks.map((b) => b.length));
  const rowH = opts.rowH || ROW_H;
  const hdr2 = opts.hdr2 || HDR2_H;
  const blockH = HDR1_H + hdr2 + (rows.length + (total ? 1 : 0)) * rowH;
  const heightScale = Math.floor((PAGE[orientation].h / (TITLE_H + blockH)) * 100);
  const scale = Math.max(40, Math.min(scaleFor(orientation, leadPt + maxCols * colPt(NUM_W)), heightScale));
  const usable = PAGE[orientation].h / (scale / 100);

  leadWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  for (let i = 0; i < maxCols; i++) ws.getColumn(leadWidths.length + 1 + i).width = NUM_W;

  let row = 3;
  let y = TITLE_H;
  blocks.forEach((cols, i) => {
    const h = blockH;
    if (i > 0 && y + h > usable) {
      ws.getRow(row - 1).addPageBreak();
      y = TITLE_H;
    }
    row = writeBlock(ws, row, leadLabels, cols, rows, total, opts) + 1;
    y += h + rowH;
  });
  return scale;
}

// ---------------------------------------------------------------- sheets
function circleSheet(wb, report, cols, name, short) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
  title(ws, `Goalpara Electrical Circle - MRR Summary${short ? ' (Short)' : ''} - ${report.monthLabel}`);
  const present = report.esds.filter((e) => e.present);
  const rows = present.map((e) => ({ lead: [e.name], values: e.summary }));
  const total = { lead: ['Goalpara Circle'], values: report.circle.summary };
  const blocks = packBlocks(cols, SUMMARY_SECTIONS, 11);
  const scale = stackBlocks(ws, 'landscape', ['ESD'], [18], blocks, rows, total);
  printSetup(ws, { orientation: 'landscape', scale });
}

function labelOf(c) {
  return c.group ? `${c.group.replace(' (Rs lakhs)', '')} - ${c.label}` : c.label;
}

/** Fields down the page, one column per ESD and the circle - made for a portrait page. */
function esdSummarySheet(wb, report, cols, name, short) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }] });
  title(ws, `ESD-wise Summary${short ? ' (Short)' : ''} - ${report.monthLabel}`);
  const present = report.esds.filter((e) => e.present);
  const heads = [...present.map((e) => ({ name: e.name, s: e.summary })), { name: 'Goalpara Circle', s: report.circle.summary, total: true }];
  const LEAD = 38;
  const W = 12.5;

  ws.getColumn(1).width = LEAD;
  heads.forEach((_, i) => { ws.getColumn(2 + i).width = W; });
  ws.getRow(3).height = 30;
  ['Particulars', ...heads.map((h) => h.name)].forEach((t, i) => {
    const c = ws.getCell(3, i + 1);
    c.value = t;
    styleCell(c, { bold: true, fill: HEAD_FILL, align: 'center', wrap: true });
  });

  let r = 4;
  for (const sec of sectionCols(cols, SUMMARY_SECTIONS)) {
    ws.mergeCells(r, 1, r, 1 + heads.length);
    ws.getCell(r, 1).value = sec.title;
    for (let c = 1; c <= 1 + heads.length; c++) styleCell(ws.getCell(r, c), { bold: true, fill: DIVIDER_FILL, align: 'left' });
    ws.getRow(r).height = 18;
    r += 1;
    for (const c of sec.cols) {
      const label = labelOf(c);
      const a = ws.getCell(r, 1);
      a.value = label;
      styleCell(a, { align: 'left', wrap: true, bold: c.strong, fill: c.strong ? KEY_FILL : undefined });
      heads.forEach((h, i) => {
        const cell = ws.getCell(r, 2 + i);
        cell.value = num(h.s[c.key]);
        cell.numFmt = EXCEL_FMT[c.fmt];
        styleCell(cell, { bold: c.strong || h.total, fill: h.total ? TOTAL_FILL : c.strong ? KEY_FILL : undefined });
      });
      ws.getRow(r).height = label.length > LEAD ? 30 : 18;
      r += 1;
    }
  }
  const width = colPt(LEAD) + heads.length * colPt(W);
  printSetup(ws, { orientation: 'portrait', scale: scaleFor('portrait', width), titlesRow: '1:3' });
}

function categorySheet(wb, report, owner, cols, name, short) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
  const label = owner.name === 'Goalpara Circle' ? 'Goalpara Electrical Circle' : `${owner.name} ESD`;
  title(ws, `${label} - Category-wise${short ? ' (Short)' : ''} - ${report.monthLabel}`);
  const all = owner.categories.rows;
  const used = short ? keepNonEmpty(all) : all;
  const rows = used.map((x) => ({ lead: [`${all.indexOf(x) + 1}. ${x.name}`], values: x }));
  const blocks = packBlocks(cols, CATEGORY_SECTIONS, 10);
  const scale = stackBlocks(ws, 'landscape', ['Category'], [40], blocks, rows, { lead: ['TOTAL'], values: owner.categories.total }, { leadShrink: true, rowH: 15, hdr2: 50 });
  printSetup(ws, { orientation: 'landscape', scale });
}

function hqFormatSheet(wb, report, present) {
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
  printSetup(ws, { orientation: 'landscape', scale: 45, paper: 8, titlesRow: '1:1', titlesCol: 'A:C' });
}

export async function buildHqMrrWorkbook(report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Goalpara Circle Reporting System';
  const present = report.esds.filter((e) => e.present);
  const sShort = trimSummaryCols();
  const cShort = trimCategoryCols();
  const circle = { name: 'Goalpara Circle', categories: report.circle.categories };

  circleSheet(wb, report, SUMMARY_COLS, 'Circle Summary', false);
  circleSheet(wb, report, sShort, 'Circle Summary (Short)', true);
  esdSummarySheet(wb, report, SUMMARY_COLS, 'ESD Summary', false);
  esdSummarySheet(wb, report, sShort, 'ESD Summary (Short)', true);
  categorySheet(wb, report, circle, CATEGORY_COLS, 'Category - Circle', false);
  categorySheet(wb, report, circle, cShort, 'Category - Circle (Short)', true);
  for (const e of present) {
    categorySheet(wb, report, e, CATEGORY_COLS, e.name, false);
    categorySheet(wb, report, e, cShort, `${e.name} (Short)`, true);
  }
  hqFormatSheet(wb, report, present);
  return wb;
}
