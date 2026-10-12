import { NextResponse } from 'next/server';
import { replacePrepaidRecoveryForEsd } from '../../../../lib/prepaidRecoveryDb';

export const dynamic = 'force-dynamic';

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

  const { reportDate, esdCode, esdLabel, summary, callListRows, paymentsRows, uploadedBy } = body || {};

  if (!reportDate || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    return NextResponse.json({ error: 'reportDate must be YYYY-MM-DD.' }, { status: 400 });
  }
  if (!esdCode) {
    return NextResponse.json({ error: 'esdCode is required.' }, { status: 400 });
  }
  if (!summary || !Array.isArray(callListRows) || !Array.isArray(paymentsRows)) {
    return NextResponse.json({ error: 'summary, callListRows and paymentsRows are required.' }, { status: 400 });
  }

  try {
    await replacePrepaidRecoveryForEsd({
      reportDate, esdCode, esdLabel, summary, callListRows, paymentsRows, uploadedBy,
    });
    return NextResponse.json({ ok: true, esdCode, callListCount: callListRows.length, paymentsCount: paymentsRows.length });
  } catch (err) {
    console.error('Prepaid Recovery upload failed', err);
    return NextResponse.json({ error: err.message || 'Upload failed.' }, { status: 500 });
  }
}
