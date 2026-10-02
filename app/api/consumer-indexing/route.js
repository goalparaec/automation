export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { listCompleteReports } from '../../../../lib/consumerIndexingDb.js';

export async function GET() {
  try {
    const reports = await listCompleteReports();
    return NextResponse.json({ ok: true, reports });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
