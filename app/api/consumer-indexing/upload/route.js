export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { parseConsumerIndexingFile } from '../../../../lib/consumerIndexing.js';
import { SUB_DIVISIONS } from '../../../../lib/sheetConfig.js';
import {
  replaceConsumerIndexingRowsForEsd,
  generateConsumerIndexingSummary,
  recordConsumerIndexingUpload,
  getUploadedEsdCoverage,
} from '../../../../lib/consumerIndexingDb.js';

export async function POST(request) {
  const formData = await request.formData();
  const file = formData.get('file');
  const reportDate = formData.get('reportDate');
  const esdName = formData.get('esdName');

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
  }
  if (!reportDate) {
    return NextResponse.json({ error: 'reportDate is required (YYYY-MM-DD).' }, { status: 400 });
  }
  if (!SUB_DIVISIONS.includes(esdName)) {
    return NextResponse.json({ error: `esdName must be one of: ${SUB_DIVISIONS.join(', ')}` }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let rows;
  try {
    rows = parseConsumerIndexingFile(buffer, esdName);
  } catch (err) {
    await recordConsumerIndexingUpload({
      reportDate, esdName, filename: file.name, rowCount: 0, excludedCount: 0,
      status: 'failed', errorMessage: err.message,
    });
    return NextResponse.json({ error: `Could not read file: ${err.message}` }, { status: 422 });
  }

  if (rows.length === 0) {
    await recordConsumerIndexingUpload({
      reportDate, esdName, filename: file.name, rowCount: 0, excludedCount: 0,
      status: 'failed', errorMessage: 'No data rows found in this file.',
    });
    return NextResponse.json({ error: 'No data rows were found in this file.' }, { status: 422 });
  }

  const excludedCount = rows.filter((r) => r.is_excluded).length;

  try {
    const count = await replaceConsumerIndexingRowsForEsd(reportDate, esdName, rows);
    await generateConsumerIndexingSummary(reportDate);
    await recordConsumerIndexingUpload({
      reportDate, esdName, filename: file.name, rowCount: count, excludedCount, status: 'success',
    });
    const coverage = await getUploadedEsdCoverage(reportDate);
    return NextResponse.json({ ok: true, reportDate, esdName, rowCount: count, excludedCount, coverage });
  } catch (err) {
    await recordConsumerIndexingUpload({
      reportDate, esdName, filename: file.name, rowCount: 0, excludedCount, status: 'failed', errorMessage: err.message,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
