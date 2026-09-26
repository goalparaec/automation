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
// The ESD a row belongs to is read from the FEEDER NAME's numeric prefix
// (e.g. "038-DHUPDHARA 11 KV" -> Dhupdhara), not from which file it came
// in - real exports have been seen mixing two ESDs' rows in one file.

import * as XLSX from 'xlsx';
import { detectFileKind, parseCSVText, parseNumericValue } from './xlsxReader.js';

const ESD_BY_FEEDER_PREFIX = {
  '038': 'Dhupdhara',
  '039': 'Dudhnoi',
  '040': 'Goalpara',
  '041': 'Lakhipur',
  '042': 'Mankachar',
};

const GHDT_PATTERN = /ghdt/i;

function esdFromFeederName(feederName) {
  if (!feederName) return null;
  const prefix = feederName.split('-')[0].trim();
  return ESD_BY_FEEDER_PREFIX[prefix] ?? null;
}

/**
 * Parses one Consumer Indexing Report file (.xlsx, .xls, or .csv) into
 * row objects ready to store. Ghost/duplicate DTR rows are flagged
 * (is_excluded), not dropped, so they stay visible for review rather than
 * silently vanishing.
 * @param {Buffer} buffer
 * @returns {object[]} parsed rows
 */
export function parseConsumerIndexingFile(buffer) {
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

    // Excluded when the DTR No. itself contains "GHDT" - a deliberate
    // marker code for designated ghost/placeholder DTRs. DTR Name text is
    // deliberately NOT used for this (it produced both false positives
    // and false negatives against the real, authoritative marker).
    const isExcluded = GHDT_PATTERN.test(dtrNo);

    // A DTR the portal has marked "Indexed" (flag = Yes) but which shows
    // zero consumers attached - a data-quality signal worth surfacing per
    // ESD, separate from the exclusion above.
    const isIndexedZeroConsumer = dtrIndexFlag.toLowerCase() === 'yes' && totalCons === 0;

    parsedRows.push({
      esd_name: esdFromFeederName(feederName),
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
