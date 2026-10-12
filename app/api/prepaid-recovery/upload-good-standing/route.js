import { NextResponse } from 'next/server';
import { replaceGoodStandingChunk } from '../../../../lib/prepaidRecoveryDb';

export const dynamic = 'force-dynamic';

// Good-standing consumers (eligible, just not currently a defaulter) can
// number in the tens of thousands per ESD — far too many for one request
// body. The client sends them in small chunks; chunkIndex 0 clears any
// previous data for that (date, esd) first, later chunks just append.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { reportDate, esdCode, rows, chunkIndex } = body || {};

  if (!reportDate || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    return NextResponse.json({ error: 'reportDate must be YYYY-MM-DD.' }, { status: 400 });
  }
  if (!esdCode) {
    return NextResponse.json({ error: 'esdCode is required.' }, { status: 400 });
  }
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: 'rows must be an array.' }, { status: 400 });
  }

  try {
    await replaceGoodStandingChunk({ reportDate, esdCode, rows, isFirstChunk: chunkIndex === 0 });
    return NextResponse.json({ ok: true, inserted: rows.length });
  } catch (err) {
    console.error('Good-standing chunk upload failed', err);
    return NextResponse.json({ error: err.message || 'Upload failed.' }, { status: 500 });
  }
}
