export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { parseConsumerIndexingFile } from '../../../../lib/consumerIndexing.js';
import {
  replaceConsumerIndexingRows,
  generateConsumerIndexingSummary,
  recordConsumerIndexingUpload,
} from '../../../../lib/consumerIndexingDb.js';

export async function POST(request) {
  const formData = await request.formData();
  const files = formData.getAll('files');
  const reportDate = formData.get('reportDate');

  if (!files || files.length === 0) {
    return NextResponse.json({ error: 'No files uploaded.' }, { status: 400 });
  }
  if (!reportDate) {
    return NextResponse.json({ error: 'reportDate is required (YYYY-MM-DD).' }, { status: 400 });
  }

  let allRows = [];
  const filenames = [];
  try {
    for (const file of files) {
      if (typeof file === 'string') continue;
      const buffer = Buffer.from(await file.arrayBuffer());
      const rows = parseConsumerIndexingFile(buffer);
      allRows = allRows.concat(rows);
      filenames.push(file.name);
    }
  } catch (err) {
    await recordConsumerIndexingUpload({
      reportDate,
      filename: filenames.join(', ') || 'unknown',
      rowCount: 0,
      excludedCount: 0,
      unmappedCount: 0,
      status: 'failed',
      errorMessage: err.message,
    });
    return NextResponse.json({ error: `Could not read file(s): ${err.message}` }, { status: 422 });
  }

  if (allRows.length === 0) {
    return NextResponse.json({ error: 'No data rows were found in the uploaded file(s).' }, { status: 422 });
  }

  const excludedCount = allRows.filter((r) => r.is_excluded).length;
  const unmappedCount = allRows.filter((r) => !r.is_excluded && !r.esd_name).length;

  try {
    const count = await replaceConsumerIndexingRows(reportDate, allRows);
    await generateConsumerIndexingSummary(reportDate);
    await recordConsumerIndexingUpload({
      reportDate,
      filename: filenames.join(', '),
      rowCount: count,
      excludedCount,
      unmappedCount,
      status: 'success',
    });
    return NextResponse.json({ ok: true, reportDate, rowCount: count, excludedCount, unmappedCount });
  } catch (err) {
    await recordConsumerIndexingUpload({
      reportDate,
      filename: filenames.join(', '),
      rowCount: 0,
      excludedCount,
      unmappedCount,
      status: 'failed',
      errorMessage: err.message,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
