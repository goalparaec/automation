import { NextResponse } from 'next/server';
import { getBaseline } from '../../../../lib/watchlistDb';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 60;

// The browser asks this before checking a day's billing files: the consumers on the list plus
// what to compare each one against (the previous check, or the list's own starting data).
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const listId = searchParams.get('listId');
  const reportDate = searchParams.get('reportDate');
  if (!listId) return NextResponse.json({ error: 'listId is required.' }, { status: 400 });
  if (!reportDate || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    return NextResponse.json({ error: 'reportDate (YYYY-MM-DD) is required.' }, { status: 400 });
  }
  try {
    return NextResponse.json(await getBaseline(listId, reportDate));
  } catch (err) {
    console.error('Watchlist baseline failed', err);
    return NextResponse.json({ error: err.message || 'Could not load the list.' }, { status: 500 });
  }
}
