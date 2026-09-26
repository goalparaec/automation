// Two file paths live in this module:
// 1. readTargetSheets() - for the old combined 89MB master workbook (kept
//    for reference / bulk use). It opens the .xlsx as a zip and only
//    decompresses the sheets it needs, skipping the huge unused ones.
// 2. readSingleSheetFile() - the normal day-to-day path, one standalone
//    report file at a time. These files are small, so it uses SheetJS
//    (the `xlsx` package) instead, which transparently supports .xlsx,
//    the older binary .xls format, and plain .csv - all through one API.

import yauzl from 'yauzl';
import sax from 'sax';
import * as XLSX from 'xlsx';
import { SHEET_CONFIGS, TEXT_FIELDS } from './sheetConfig.js';

function openZip(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      resolve(zipfile);
    });
  });
}

function collectEntries(zipfile) {
  return new Promise((resolve, reject) => {
    const entries = new Map();
    zipfile.on('entry', (entry) => {
      entries.set(entry.fileName, entry);
      zipfile.readEntry();
    });
    zipfile.on('end', () => resolve(entries));
    zipfile.on('error', reject);
    zipfile.readEntry();
  });
}

function readEntryText(zipfile, entry) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, readStream) => {
      if (err) return reject(err);
      const chunks = [];
      readStream.on('data', (c) => chunks.push(c));
      readStream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      readStream.on('error', reject);
    });
  });
}

function parseWorkbookSheetList(xml) {
  return new Promise((resolve, reject) => {
    const list = [];
    const parser = sax.parser(true);
    parser.onerror = reject;
    parser.onopentag = (node) => {
      if (node.name === 'sheet') {
        const name = node.attributes.name;
        const rId = node.attributes['r:id'];
        if (name && rId) list.push({ name, rId });
      }
    };
    parser.onend = () => resolve(list);
    parser.write(xml).close();
  });
}

function parseWorkbookSheetMap(xml) {
  return new Promise((resolve, reject) => {
    const map = {};
    const parser = sax.parser(true);
    parser.onerror = reject;
    parser.onopentag = (node) => {
      if (node.name === 'sheet') {
        const name = node.attributes.name;
        const rId = node.attributes['r:id'];
        if (name && rId) map[name] = rId;
      }
    };
    parser.onend = () => resolve(map);
    parser.write(xml).close();
  });
}

function parseRelsMap(xml) {
  return new Promise((resolve, reject) => {
    const map = {};
    const parser = sax.parser(true);
    parser.onerror = reject;
    parser.onopentag = (node) => {
      if (node.name === 'Relationship') {
        const id = node.attributes.Id;
        const target = node.attributes.Target;
        const type = node.attributes.Type || '';
        if (id && target && type.endsWith('/worksheet')) map[id] = target;
      }
    };
    parser.onend = () => resolve(map);
    parser.write(xml).close();
  });
}

function parseSharedStrings(xml) {
  return new Promise((resolve, reject) => {
    const strings = [];
    let current = null;
    let inT = false;
    const parser = sax.parser(true, { trim: false, normalize: false });
    parser.onerror = reject;
    parser.onopentag = (node) => {
      if (node.name === 'si') current = '';
      else if (node.name === 't') inT = true;
    };
    parser.ontext = (text) => {
      if (inT && current !== null) current += text;
    };
    parser.onclosetag = (name) => {
      if (name === 't') inT = false;
      else if (name === 'si') {
        strings.push(current);
        current = null;
      }
    };
    parser.onend = () => resolve(strings);
    parser.write(xml).close();
  });
}

// Excel's day-1 epoch, adjusted for the built-in 1900 leap-year bug -
// this constant (25569) is the standard, widely used conversion offset.
function excelSerialToISODate(serial) {
  if (!serial || Number.isNaN(serial)) return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

function parseSheetRows(xml, config, sharedStrings) {
  return new Promise((resolve, reject) => {
    const rows = [];
    let rowData = null;
    let cellCol = null;
    let cellType = 'n';
    let capturing = false;
    let valueText = '';

    const parser = sax.parser(true, { trim: false, normalize: false });
    parser.onerror = reject;

    parser.onopentag = (node) => {
      if (node.name === 'row') {
        rowData = {};
      } else if (node.name === 'c') {
        cellCol = (node.attributes.r || '').replace(/[0-9]/g, '');
        cellType = node.attributes.t || 'n';
        valueText = '';
      } else if (node.name === 'v' || node.name === 't') {
        capturing = true;
      }
    };

    parser.ontext = (text) => {
      if (capturing) valueText += text;
    };

    parser.onclosetag = (name) => {
      if (name === 'v' || name === 't') {
        capturing = false;
      } else if (name === 'c') {
        const field = config.columns[cellCol];
        if (field && valueText !== '' && rowData) {
          let value;
          if (cellType === 's') value = sharedStrings[parseInt(valueText, 10)] ?? '';
          else if (cellType === 'b') value = valueText === '1';
          else if (cellType === 'str' || cellType === 'inlineStr') value = valueText;
          else value = parseFloat(valueText);

          if (config.dateFields.includes(field) && typeof value === 'number') {
            value = excelSerialToISODate(value);
          }
          if (TEXT_FIELDS.has(field) && typeof value === 'number') {
            value = String(Math.trunc(value));
          }
          rowData[field] = value;
        }
        cellCol = null;
        valueText = '';
      } else if (name === 'row') {
        if (rowData) rows.push(rowData);
        rowData = null;
      }
    };

    parser.onend = () => {
      // A row counts as real data once its stop field (sl_no) is an actual
      // number - this is how header rows, blank preamble rows, and trailing
      // blank rows all get skipped without needing to know their position
      // ahead of time. This means standalone single-sheet exports parse
      // correctly even if their preamble is a different length than it was
      // inside the old combined workbook.
      const stopField = config.stopField;
      resolve(rows.filter((r) => typeof r[stopField] === 'number' && Number.isFinite(r[stopField])));
    };

    parser.write(xml).close();
  });
}

/**
 * Reads only the requested sheets out of a (possibly huge) .xlsx buffer.
 * Kept for the case of uploading one combined workbook. For the normal
 * day-to-day flow (separate standalone files), use readSingleSheetFile below.
 * @param {Buffer} buffer - the raw uploaded file
 * @param {string[]} wantedSheetNames - keys into SHEET_CONFIGS
 * @returns {Promise<Record<string, object[]>>} sheetName -> array of row objects
 */
export async function readTargetSheets(buffer, wantedSheetNames) {
  const zipfile = await openZip(buffer);
  try {
    const entries = await collectEntries(zipfile);

    const workbookEntry = entries.get('xl/workbook.xml');
    const relsEntry = entries.get('xl/_rels/workbook.xml.rels');
    if (!workbookEntry || !relsEntry) {
      throw new Error('This does not look like a valid .xlsx file (missing workbook.xml).');
    }

    const [workbookXml, relsXml] = await Promise.all([
      readEntryText(zipfile, workbookEntry),
      readEntryText(zipfile, relsEntry),
    ]);

    const sheetNameToRid = await parseWorkbookSheetMap(workbookXml);
    const ridToTarget = await parseRelsMap(relsXml);

    let sharedStrings = [];
    const sharedStringsEntry = entries.get('xl/sharedStrings.xml');
    if (sharedStringsEntry) {
      const sharedStringsXml = await readEntryText(zipfile, sharedStringsEntry);
      sharedStrings = await parseSharedStrings(sharedStringsXml);
    }

    const result = {};
    for (const sheetName of wantedSheetNames) {
      const rId = sheetNameToRid[sheetName];
      if (!rId) {
        throw new Error(`Sheet "${sheetName}" was not found in the uploaded workbook.`);
      }
      const target = ridToTarget[rId];
      const entryPath = `xl/${target}`;
      const sheetEntry = entries.get(entryPath);
      if (!sheetEntry) {
        throw new Error(`Could not locate the worksheet file for "${sheetName}" (${entryPath}).`);
      }
      const sheetXml = await readEntryText(zipfile, sheetEntry);
      const config = SHEET_CONFIGS[sheetName];
      result[sheetName] = await parseSheetRows(sheetXml, config, sharedStrings);
    }

    return result;
  } finally {
    zipfile.close();
  }
}

function normalizeSheetName(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function columnLetterToIndex(letter) {
  return letter.charCodeAt(0) - 65; // 'A' -> 0, 'B' -> 1, ...
}

// Handles numbers that arrive as formatted text - most commonly from CSV
// exports, where every value is a quoted string and large numbers use
// comma thousand-separators (e.g. "39,981"). A plain parseFloat() on that
// string stops at the first comma and silently returns 39 instead of
// 39981, which is exactly what caused corrupted, tiny-looking totals
// earlier. This strips thousand-separators (and stray whitespace) before
// parsing, and leaves genuine numbers (already numbers, not strings) as-is.
export function parseNumericValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    if (cleaned === '' || cleaned === '-') return null;
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeDateValue(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    // Excel serial date (rare in .csv, possible in old .xls exports).
    const ms = Math.round((value - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return null;
}

export function detectFileKind(buffer) {
  // .xlsx is a zip archive (starts with "PK"); legacy .xls is an OLE
  // compound file (starts with this specific 4-byte signature). Anything
  // else is treated as plain text - i.e. CSV.
  if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b) return 'zip';
  if (buffer.length >= 4 && buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) return 'ole';
  return 'text';
}

// Hand-rolled CSV parser, used instead of relying on a library's internal
// (and, for our purposes, unverifiable) heuristics for guessing which CSV
// cells are "numbers" - that guessing is exactly what caused comma-grouped
// numbers like "2,194" to be misread earlier. This always returns every
// field as a plain string; parseNumericValue() below does the one, single,
// predictable numeric conversion for every field, every time.
export function parseCSVText(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      // ignore - the following \n marks the actual line break
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Reads a standalone single-report export file (the normal day-to-day
 * upload) in .xlsx, .xls, or .csv format. CSV is parsed by hand (see
 * parseCSVText above); .xlsx/.xls go through SheetJS. The file may contain
 * just one sheet - possibly named "Sheet1" or anything else by whatever
 * system generated it - so this doesn't require an exact sheet-name match:
 * it tries to find a sheet whose name loosely matches sheetType, and
 * otherwise just reads the first sheet in the file.
 * @param {Buffer} buffer
 * @param {string} sheetType - one of the keys in SHEET_CONFIGS
 * @returns {Promise<object[]>} parsed data rows
 */
export async function readSingleSheetFile(buffer, sheetType) {
  const config = SHEET_CONFIGS[sheetType];
  if (!config) throw new Error(`Unknown sheet type "${sheetType}".`);

  const kind = detectFileKind(buffer);
  let rawRows;

  if (kind === 'text') {
    rawRows = parseCSVText(buffer.toString('utf8'));
  } else {
    let workbook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    } catch (err) {
      throw new Error(`Could not read this file as .xlsx or .xls: ${err.message}`);
    }
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('No sheets found in the uploaded file.');
    }
    const wanted = normalizeSheetName(sheetType);
    const chosenName = workbook.SheetNames.find((n) => normalizeSheetName(n) === wanted) ?? workbook.SheetNames[0];
    const worksheet = workbook.Sheets[chosenName];
    // raw:false returns each cell's displayed text rather than its parsed
    // value, so every field - regardless of source format - goes through
    // the exact same, predictable string-based parsing below.
    rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: null, blankrows: false });
  }

  const stopFieldIndex = Object.entries(config.columns).find(([, field]) => field === config.stopField)?.[0];
  const stopColIndex = stopFieldIndex ? columnLetterToIndex(stopFieldIndex) : 0;

  const parsedRows = [];
  for (const row of rawRows) {
    const rawStop = row[stopColIndex];
    const stopValue = parseNumericValue(rawStop);
    // A row only counts as real data once its stop field (sl_no) is an
    // actual number - this is how header rows, blank preamble rows, and
    // trailing blank rows all get skipped without needing to know their
    // position ahead of time, for any of the 3 supported file formats.
    if (stopValue === null) continue;

    const record = {};
    for (const [letter, field] of Object.entries(config.columns)) {
      const value = row[columnLetterToIndex(letter)];
      if (value === null || value === undefined || value === '') continue;

      if (config.dateFields.includes(field)) {
        record[field] = normalizeDateValue(value);
      } else if (TEXT_FIELDS.has(field)) {
        record[field] = typeof value === 'number' ? String(Math.trunc(value)) : String(value).trim();
      } else {
        record[field] = parseNumericValue(value);
      }
    }
    parsedRows.push(record);
  }


  return parsedRows;
}
