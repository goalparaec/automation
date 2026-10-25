// Upload for the one input the daily report does not already handle: the
// Prepaid Recharge (collection) report. The other four Overall CE inputs use
// the existing /api/upload route, so they get the same checks as before.
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { parsePrepaidCollFile, validatePrepaidColl, PREPAID_COLL_CONFIG } from '../../../../lib/overallCeParse.js';
import { replaceInputRows, recordUpload } from '../../../../lib/db.js';

async function safeRecord(details) {
  try {
    await recordUpload(details);
  } catch (err) {
    console.error('Failed to record Prepaid_Coll upload:', err.message);
  }
}

export async function POST(request) {
  const formData = await request.formData();
  const file = formData.get('file');
  const reportDate = formData.get('reportDate');
  const sheetType = formData.get('sheetType');

  if (sheetType !== 'Prepaid_Coll') {
    return NextResponse.json({ error: 'This route only handles Prepaid_Coll. Other reports use /api/upload.' }, { status: 400 });
  }
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
  }
  if (!reportDate || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    return NextResponse.json({ error: 'reportDate is required (YYYY-MM-DD).' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base = { reportDate, filename: file.name, fileSizeBytes: buffer.length, sheetsParsed: ['Prepaid_Coll'] };

  let rows;
  try {
    rows = parsePrepaidCollFile(buffer);
  } catch (err) {
    await safeRecord({ ...base, rowCounts: {}, status: 'failed', errorMessage: err.message });
    return NextResponse.json({ error: `Could not read file: ${err.message}` }, { status: 422 });
  }

  const problems = validatePrepaidColl(rows);
  if (problems.length > 0) {
    await safeRecord({ ...base, rowCounts: { Prepaid_Coll: rows.length }, status: 'failed', errorMessage: problems.join(' ') });
    return NextResponse.json(
      { error: `This file doesn't look right: ${problems.join(' ')} Nothing was saved - please check the file and try again.` },
      { status: 422 }
    );
  }

  try {
    const count = await replaceInputRows(PREPAID_COLL_CONFIG.table, reportDate, rows);
    await safeRecord({ ...base, rowCounts: { Prepaid_Coll: count }, status: 'success' });
    return NextResponse.json({ ok: true, reportDate, sheetType, rowCount: count });
  } catch (err) {
    await safeRecord({ ...base, rowCounts: {}, status: 'failed', errorMessage: err.message });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
