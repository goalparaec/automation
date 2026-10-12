import { NextResponse } from 'next/server';
import { searchGoodStanding } from '../../../../../lib/prepaidRecoveryDb';

export const dynamic = 'force-dynamic';

// Good-standing can be 200k+ rows for a date, so this is always a search —
// never a full listing. reportDate is required; esdCode and q are optional.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const reportDate = searchParams.get('reportDate');
  const esdCode = searchParams.get('esdCode') || null;
  const q = searchParams.get('q') || '';
  const offset = Number(searchParams.get('offset') || 0);
  const limit = Math.min(Number(searchParams.get('limit') || 300), 300);

  if (!reportDate || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    return NextResponse.json({ error: 'reportDate (YYYY-MM-DD) query param is required.' }, { status: 400 });
  }

  try {
    const result = await searchGoodStanding({ reportDate, esdCode, q, offset, limit });
    return NextResponse.json(result);
  } catch (err) {
    console.error('Good-standing search failed', err);
    return NextResponse.json({ error: err.message || 'Search failed.' }, { status: 500 });
  }
}
