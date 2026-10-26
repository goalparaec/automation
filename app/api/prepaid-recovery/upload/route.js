import { NextResponse } from 'next/server';
import { replacePrepaidRecoveryForEsd, appendPrepaidRecoveryRows } from '../../../../lib/prepaidRecoveryDb';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 60;

// The browser has already parsed the .xls file(s) and run them through
// lib/prepaidRecoveryCore.js (processSheet/mergeProcessed/summarize). This
// route just persists one ESD's result for one report date — called once
// per ESD found in the uploaded file(s), not once per uploaded file, since
// ESD is derived from Consumer No, not from which file it came from.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { reportDate, esdCode, esdLabel, summary, callListRows, paymentsRows, excludedRows, analysis, uploadedBy } = body || {};
  const { part, kind, rows, serialStart } = body || {};

  if (!reportDate || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    return NextResponse.json({ error: 'reportDate must be YYYY-MM-DD.' }, { status: 400 });
  }
  if (!esdCode) {
    return NextResponse.json({ error: 'esdCode is required.' }, { status: 400 });
  }
  // Chunked upload (large ESDs such as Lakhipur exceed Vercel's ~4.5 MB request
  // limit if sent in one go). part 'rows' = append one batch of rows.
  if (part === 'rows') {
    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: 'rows must be an array.' }, { status: 400 });
    }
    try {
      const n = await appendPrepaidRecoveryRows({ kind, reportDate, esdCode, rows, serialStart });
      return NextResponse.json({ ok: true, appended: n });
    } catch (err) {
      console.error('Prepaid Reports row batch failed', err);
      return NextResponse.json({ error: err.message || 'Upload failed.' }, { status: 500 });
    }
  }

  if (part === 'start') {
    // summary + analysis only; clears this ESD/date's old rows. Rows follow in batches.
    if (!summary) return NextResponse.json({ error: 'summary is required.' }, { status: 400 });
    try {
      await replacePrepaidRecoveryForEsd({
        reportDate, esdCode, esdLabel, summary, callListRows: [], paymentsRows: [], excludedRows: [], analysis: analysis || null, uploadedBy,
      });
      return NextResponse.json({ ok: true, esdCode });
    } catch (err) {
      console.error('Prepaid Reports start failed', err);
      return NextResponse.json({ error: err.message || 'Upload failed.' }, { status: 500 });
    }
  }
  if (!summary || !Array.isArray(callListRows) || !Array.isArray(paymentsRows)) {
    return NextResponse.json({ error: 'summary, callListRows and paymentsRows are required.' }, { status: 400 });
  }

  try {
    await replacePrepaidRecoveryForEsd({
      reportDate, esdCode, esdLabel, summary, callListRows, paymentsRows,
      excludedRows: Array.isArray(excludedRows) ? excludedRows : [], analysis: analysis || null, uploadedBy,
    });
    return NextResponse.json({ ok: true, esdCode, callListCount: callListRows.length, paymentsCount: paymentsRows.length });
  } catch (err) {
    console.error('Prepaid Reports upload failed', err);
    return NextResponse.json({ error: err.message || 'Upload failed.' }, { status: 500 });
  }
}
