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

// Logging an upload attempt is best-effort - if the audit table itself
// isn't reachable (e.g. schema not fully set up yet), that must never
// crash the actual response back to the browser. Without this wrapper, a
// second failure in here would throw uncaught, which is exactly what
// produced the "Unexpected end of JSON input" error - Next.js returns an
// empty/non-JSON body for an unhandled exception, which res.json() then
// fails to parse on the client.
async function safeRecordUpload(details) {
  try {
    await recordConsumerIndexingUpload(details);
  } catch (err) {
    console.error('Failed to record consumer-indexing upload audit row:', err.message);
  }
}

export async function POST(request) {
  let file, reportDate, esdName;
  try {
    const formData = await request.formData();
    file = formData.get('file');
    reportDate = formData.get('reportDate');
    esdName = formData.get('esdName');
  } catch (err) {
    return NextResponse.json({ error: `Could not read the upload request: ${err.message}` }, { status: 400 });
  }

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
    await safeRecordUpload({
      reportDate, esdName, filename: file.name, rowCount: 0, excludedCount: 0,
      status: 'failed', errorMessage: err.message,
    });
    return NextResponse.json({ error: `Could not read file: ${err.message}` }, { status: 422 });
  }

  if (rows.length === 0) {
    await safeRecordUpload({
      reportDate, esdName, filename: file.name, rowCount: 0, excludedCount: 0,
      status: 'failed', errorMessage: 'No data rows found in this file.',
    });
    return NextResponse.json({ error: 'No data rows were found in this file.' }, { status: 422 });
  }

  const excludedCount = rows.filter((r) => r.is_excluded).length;

  try {
    const count = await replaceConsumerIndexingRowsForEsd(reportDate, esdName, rows);
    await generateConsumerIndexingSummary(reportDate);
    await safeRecordUpload({
      reportDate, esdName, filename: file.name, rowCount: count, excludedCount, status: 'success',
    });
    const coverage = await getUploadedEsdCoverage(reportDate);
    return NextResponse.json({ ok: true, reportDate, esdName, rowCount: count, excludedCount, coverage });
  } catch (err) {
    await safeRecordUpload({
      reportDate, esdName, filename: file.name, rowCount: 0, excludedCount, status: 'failed', errorMessage: err.message,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
