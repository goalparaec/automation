export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
