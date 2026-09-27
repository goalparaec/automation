export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUploadedEsdCoverage } from '../../../../lib/consumerIndexingDb.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const reportDate = searchParams.get('date');
  if (!reportDate) {
    return NextResponse.json({ error: 'date is required (YYYY-MM-DD).' }, { status: 400 });
  }
  try {
    const coverage = await getUploadedEsdCoverage(reportDate);
    return NextResponse.json({ ok: true, coverage });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
