// Parsing + validation for the one report Overall CE needs that the daily
// report does not already read: the Prepaid Recharge (collection) report.
// The other four inputs keep using lib/xlsxReader.js and /api/upload unchanged.

import * as XLSX from 'xlsx';
import { detectFileKind, parseCSVText, parseNumericValue, columnLetterToIndex } from './xlsxReader.js';
import { CIRCLE_FILTER, ESDS } from './overallCeCore.js';

export const PREPAID_COLL_CONFIG = {
  table: 'input_prepaid_coll',
  label: 'Prepaid Recharge Report',
  stopField: 'sl_no',
  columns: {
    A: 'sl_no',
    B: 'region',
    C: 'circle',
    D: 'sub_division_name',
    E: 'consumer_paid',
    F: 'total_recharge',
    G: 'credit_adjustment',
    H: 'outstanding_payment',
    I: 'easypay_consumers',
    J: 'easypay_amount',
  },
};
const TEXT = new Set(['region', 'circle', 'sub_division_name']);

/** Reads a Prepaid Recharge report (.csv / .xlsx / .xls) into row objects. */
export function parsePrepaidCollFile(buffer) {
  const kind = detectFileKind(buffer);
  let raw;
  if (kind === 'text') {
    raw = parseCSVText(buffer.toString('utf8'));
  } else {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    if (!wb.SheetNames?.length) throw new Error('No sheets found in the uploaded file.');
    raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: null, blankrows: false });
  }

  const rows = [];
  for (const row of raw) {
    // Only rows whose first column is a number are data (skips the title,
    // blank and header rows wherever they sit).
    if (parseNumericValue(row[0]) === null) continue;
    const rec = {};
    for (const [letter, field] of Object.entries(PREPAID_COLL_CONFIG.columns)) {
      const v = row[columnLetterToIndex(letter)];
      if (v === null || v === undefined || v === '') continue;
      rec[field] = TEXT.has(field) ? String(v).trim() : parseNumericValue(v);
    }
    // The portal's grand-total line is not a sub-division.
    if ((rec.sub_division_name || '').toLowerCase() === 'total') continue;
    rows.push(rec);
  }
  return rows;
}

/** Same spirit as validateReportRows in db.js: refuse a wrong/partial file before it overwrites data. */
export function validatePrepaidColl(rows) {
  const problems = [];
  if (rows.length === 0) return ['No data rows were found at all.'];
  const ours = rows.filter((r) => r.circle === CIRCLE_FILTER);
  const seen = new Set(ours.map((r) => r.sub_division_name));
  const missing = ESDS.filter((e) => !seen.has(e));
  if (missing.length) problems.push(`Missing data for: ${missing.join(', ')} (found ${seen.size} of 5 sub-divisions).`);
  const recharge = ours.reduce((t, r) => t + (Number(r.total_recharge) || 0), 0);
  if (seen.size > 0 && recharge <= 0) problems.push('Total recharge for the circle is zero - this does not look like the Prepaid Recharge report.');
  return problems;
}
