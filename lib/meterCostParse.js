// Reads a Head-wise Collection report (.xls / .xlsx / .csv) into raw row
// objects keyed by the file's header text. The logic that decides what the
// rows mean lives in meterCostCore.js.

import * as XLSX from 'xlsx';
import { detectFileKind, parseCSVText } from './xlsxReader.js';
import { rowsToRecords } from './meterCostCore.js';

export function readHeadwiseRows(buffer) {
  const kind = detectFileKind(buffer);
  if (kind === 'text') {
    const grid = parseCSVText(buffer.toString('utf8'));
    const [header, ...body] = grid;
    return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? null])));
  }
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  if (!wb.SheetNames?.length) throw new Error('No sheets found in the file.');
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null, blankrows: false });
}

/** buffer -> { records, meterCostRows, notOurEsd, rowsRead }; throws a readable error. */
export function parseHeadwiseFile(buffer, fileName) {
  const raw = readHeadwiseRows(buffer);
  if (raw.length === 0) throw new Error('The file has no rows.');
  const keys = Object.keys(raw[0]).map((k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, ''));
  const need = ['consumernumber', 'billhead', 'amount', 'paymentdate', 'receiptnumber'];
  const missing = need.filter((k) => !keys.includes(k));
  if (missing.length > 0) {
    throw new Error('This does not look like a Head-wise Collection report (missing columns: ' + missing.join(', ') + ').');
  }
  return { ...rowsToRecords(raw, fileName), rowsRead: raw.length };
}
