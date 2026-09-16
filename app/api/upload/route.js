export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { readTargetSheets } from '../../../lib/xlsxReader.js';
import { upsertInputRows, recordUpload, generateAllOutputs } from '../../../lib/db.js';
import { SHEET_CONFIGS } from '../../../lib/sheetConfig.js';

const WANTED_SHEETS = Object.keys(SHEET_CONFIGS);

export async function POST(request) {
  const formData = await request.formData();
  const file = formData.get('file');
  const reportDate = formData.get('reportDate');

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
  }
  if (!reportDate) {
    return NextResponse.json({ error: 'reportDate is required (YYYY-MM-DD).' }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let sheets;
  try {
    sheets = await readTargetSheets(buffer, WANTED_SHEETS);
  } catch (err) {
    await recordUpload({
      reportDate,
      filename: file.name,
      fileSizeBytes: buffer.length,
      sheetsParsed: [],
      rowCounts: {},
      status: 'failed',
      errorMessage: err.message,
    });
    return NextResponse.json({ error: `Could not read workbook: ${err.message}` }, { status: 422 });
  }

  const rowCounts = {};
  try {
    for (const [sheetName, config] of Object.entries(SHEET_CONFIGS)) {
      const rows = sheets[sheetName] ?? [];
      const count = await upsertInputRows(config.table, reportDate, rows);
      rowCounts[sheetName] = count;
    }

    await generateAllOutputs(reportDate);

    await recordUpload({
      reportDate,
      filename: file.name,
      fileSizeBytes: buffer.length,
      sheetsParsed: WANTED_SHEETS,
      rowCounts,
      status: 'success',
    });
  } catch (err) {
    await recordUpload({
      reportDate,
      filename: file.name,
      fileSizeBytes: buffer.length,
      sheetsParsed: WANTED_SHEETS,
      rowCounts,
      status: 'failed',
      errorMessage: err.message,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, reportDate, rowCounts });
}
