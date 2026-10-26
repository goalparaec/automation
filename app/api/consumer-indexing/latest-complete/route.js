export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { NextResponse } from 'next/server';
import { getLatestCompleteReportDate } from '../../../../lib/consumerIndexingDb.js';

export async function GET() {
  try {
    const date = await getLatestCompleteReportDate();
    return NextResponse.json({ ok: true, date });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
