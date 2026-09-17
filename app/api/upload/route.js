export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { readSingleSheetFile } from '../../../lib/xlsxReader.js';
import { replaceInputRows, recordUpload, generateAllOutputs, validateReportRows } from '../../../lib/db.js';
import { SHEET_CONFIGS } from '../../../lib/sheetConfig.js';

export async function POST(request) {
  const formData = await request.formData();
  const file = formData.get('file');
  const reportDate = formData.get('reportDate');
  const sheetType = formData.get('sheetType');

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
  }
  if (!reportDate) {
    return NextResponse.json({ error: 'reportDate is required (YYYY-MM-DD).' }, { status: 400 });
  }
  const config = SHEET_CONFIGS[sheetType];
  if (!config) {
    return NextResponse.json({ error: `Unknown report type "${sheetType}".` }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let rows;
  try {
    rows = await readSingleSheetFile(buffer, sheetType);
  } catch (err) {
    await recordUpload({
      reportDate,
      filename: file.name,
      fileSizeBytes: buffer.length,
      sheetsParsed: [sheetType],
      rowCounts: {},
      status: 'failed',
      errorMessage: err.message,
    });
    return NextResponse.json({ error: `Could not read file: ${err.message}` }, { status: 422 });
  }

  if (rows.length === 0) {
    await recordUpload({
      reportDate,
      filename: file.name,
      fileSizeBytes: buffer.length,
      sheetsParsed: [sheetType],
      rowCounts: { [sheetType]: 0 },
      status: 'failed',
      errorMessage: 'No data rows were found in this file - check it is the right report.',
    });
    return NextResponse.json(
      { error: 'No data rows were found in this file. Is this the right report type?' },
      { status: 422 }
    );
  }

  const problems = validateReportRows(sheetType, rows);
  if (problems.length > 0) {
    await recordUpload({
      reportDate,
      filename: file.name,
      fileSizeBytes: buffer.length,
      sheetsParsed: [sheetType],
      rowCounts: { [sheetType]: rows.length },
      status: 'failed',
      errorMessage: problems.join(' '),
    });
    return NextResponse.json(
      { error: `This file doesn't look complete: ${problems.join(' ')} Nothing was saved - please check the file and try again.` },
      { status: 422 }
    );
  }

  try {
    // Deletes any rows already stored for this date + report type, then
    // inserts the freshly parsed rows - so a corrected re-upload fully
    // replaces a previous mistake rather than merging with it.
    const count = await replaceInputRows(config.table, reportDate, rows);

    await generateAllOutputs(reportDate);

    await recordUpload({
      reportDate,
      filename: file.name,
      fileSizeBytes: buffer.length,
      sheetsParsed: [sheetType],
      rowCounts: { [sheetType]: count },
      status: 'success',
    });

    return NextResponse.json({ ok: true, reportDate, sheetType, rowCount: count });
  } catch (err) {
    await recordUpload({
      reportDate,
      filename: file.name,
      fileSizeBytes: buffer.length,
      sheetsParsed: [sheetType],
      rowCounts: {},
      status: 'failed',
      errorMessage: err.message,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
