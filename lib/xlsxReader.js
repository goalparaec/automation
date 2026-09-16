// This workbook is huge (three of its sheets carry hundreds of thousands of
// consumer-level rows we never use). A normal "load the whole file" parser
// would choke on it. Instead this reader opens the .xlsx as a zip and only
// decompresses the specific entries it needs: workbook.xml (sheet name ->
// file mapping), sharedStrings.xml (unavoidable - shared across all sheets),
// and the handful of small sheetN.xml files that map to the 5 sheets we
// actually read. The multi-hundred-MB sheets are never touched.

import yauzl from 'yauzl';
import sax from 'sax';
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

/**
 * Reads a standalone single-report export file (the normal day-to-day
 * upload). The file may contain just one sheet - possibly named "Sheet1" or
 * anything else by whatever system generated it - so this doesn't require
 * an exact sheet-name match: it tries to find a sheet whose name loosely
 * matches sheetType, and otherwise just reads the first sheet in the file.
 * @param {Buffer} buffer
 * @param {string} sheetType - one of the keys in SHEET_CONFIGS
 * @returns {Promise<object[]>} parsed data rows
 */
export async function readSingleSheetFile(buffer, sheetType) {
  const config = SHEET_CONFIGS[sheetType];
  if (!config) throw new Error(`Unknown sheet type "${sheetType}".`);

  const zipfile = await openZip(buffer);
  try {
    const entries = await collectEntries(zipfile);

    const workbookEntry = entries.get('xl/workbook.xml');
    const relsEntry = entries.get('xl/_rels/workbook.xml.rels');
    if (!workbookEntry || !relsEntry) {
      throw new Error('This does not look like a valid .xlsx file.');
    }

    const [workbookXml, relsXml] = await Promise.all([
      readEntryText(zipfile, workbookEntry),
      readEntryText(zipfile, relsEntry),
    ]);

    const sheetList = await parseWorkbookSheetList(workbookXml);
    if (sheetList.length === 0) throw new Error('No sheets found in the uploaded file.');
    const ridToTarget = await parseRelsMap(relsXml);

    const wanted = normalizeSheetName(sheetType);
    const chosen = sheetList.find((s) => normalizeSheetName(s.name) === wanted) ?? sheetList[0];

    const target = ridToTarget[chosen.rId];
    const entryPath = `xl/${target}`;
    const sheetEntry = entries.get(entryPath);
    if (!sheetEntry) throw new Error(`Could not locate worksheet data (${entryPath}).`);

    let sharedStrings = [];
    const sharedStringsEntry = entries.get('xl/sharedStrings.xml');
    if (sharedStringsEntry) {
      const sharedStringsXml = await readEntryText(zipfile, sharedStringsEntry);
      sharedStrings = await parseSharedStrings(sharedStringsXml);
    }

    const sheetXml = await readEntryText(zipfile, sheetEntry);
    return await parseSheetRows(sheetXml, config, sharedStrings);
  } finally {
    zipfile.close();
  }
}
