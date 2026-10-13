import { NextResponse } from 'next/server';
import { getPreviousReportDate } from '../../../../lib/prepaidRecoveryDb';

export const dynamic = 'force-dynamic';

// The browser asks this before processing an upload: payments are counted
// "since the last report", so it needs to know which date that was.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const reportDate = searchParams.get('reportDate');
  if (!reportDate || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    return NextResponse.json({ error: 'reportDate (YYYY-MM-DD) is required.' }, { status: 400 });
  }
  try {
    return NextResponse.json({ previousDate: await getPreviousReportDate(reportDate) });
  } catch (err) {
    console.error('previous-date lookup failed', err);
    return NextResponse.json({ error: err.message || 'Lookup failed.' }, { status: 500 });
  }
}
