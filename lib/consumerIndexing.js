// Consumer Indexing Report - a module kept independent from the daily
// report (own tables, own upload flow, own page), sharing only the
// low-level file-parsing helpers from xlsxReader.js.
//
// Source format (from the portal's "Consumer Indexing Report" export),
// columns in order:
//   SL No, Substation No., Substation Name, Substation Index Flag,
//   Feeder No., UM Feeder No., Feeder Name, Feeder Index Flag,
//   DTR No., DTR Name, DTR Index Flag,
//   DTR Total Cons., DTR Indexed Cons., DTR Un-Indexed Cons.
//
// Which ESD a row belongs to is NOT derived from the feeder-name prefix -
// a feeder coded e.g. "040-..." can legitimately belong to a different
// ESD than its number suggests (confirmed against real data). Instead,
// every row in a file is tagged with whichever ESD's upload slot the
// file was placed into - that's the authoritative source of truth here.

import * as XLSX from 'xlsx';
import { detectFileKind, parseCSVText, parseNumericValue } from './xlsxReader.js';

const GHDT_PATTERN = /ghdt/i;

/**
 * Parses one Consumer Indexing Report file (.xlsx, .xls, or .csv) into
 * row objects tagged with the given ESD. Ghost/placeholder DTRs (DTR No.
 * containing "GHDT") are flagged (is_excluded), not dropped, so they stay
 * visible for review rather than silently vanishing.
 * @param {Buffer} buffer
 * @param {string} esdName - which of the 5 sub-divisions this file is for
 * @returns {object[]} parsed rows
 */
export function parseConsumerIndexingFile(buffer, esdName) {
  const kind = detectFileKind(buffer);
  let rawRows;

  if (kind === 'text') {
    rawRows = parseCSVText(buffer.toString('utf8'));
  } else {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('No sheets found in the uploaded file.');
    }
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: null, blankrows: false });
  }

  const parsedRows = [];
  for (const row of rawRows) {
    // Column 0 = SL No - a row only counts as data once it's a real number
    // (skips the header row and any blank trailing rows), same convention
    // used throughout this app.
    const slNo = parseNumericValue(row[0]);
    if (slNo === null) continue;

    const feederName = (row[6] ?? '').toString().trim();
    const dtrNo = (row[8] ?? '').toString().trim();
    const dtrName = (row[9] ?? '').toString().trim();
    const dtrIndexFlag = (row[10] ?? '').toString().trim();
    const totalCons = parseNumericValue(row[11]) ?? 0;

    const isExcluded = GHDT_PATTERN.test(dtrNo);
    const isIndexedZeroConsumer = dtrIndexFlag.toLowerCase() === 'yes' && totalCons === 0;

    parsedRows.push({
      esd_name: esdName,
      substation_no: (row[1] ?? '').toString().trim(),
      substation_name: (row[2] ?? '').toString().trim(),
      feeder_no: (row[4] ?? '').toString().trim(),
      feeder_name: feederName,
      dtr_no: dtrNo,
      dtr_name: dtrName,
      dtr_index_flag: dtrIndexFlag,
      total_cons: totalCons,
      indexed_cons: parseNumericValue(row[12]) ?? 0,
      unindexed_cons: parseNumericValue(row[13]) ?? 0,
      is_excluded: isExcluded,
      is_indexed_zero_consumer: isIndexedZeroConsumer,
    });
  }

  return parsedRows;
}
