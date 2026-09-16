export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getManualInputs, upsertManualInputs } from '../../../lib/db.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month'); // YYYY-MM-01
  if (!month) {
    return NextResponse.json({ error: 'month is required (YYYY-MM-01).' }, { status: 400 });
  }
  try {
    const data = await getManualInputs(month);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const body = await request.json();
  const { month, values } = body;
  if (!month || !values) {
    return NextResponse.json({ error: 'month and values are required.' }, { status: 400 });
  }
  try {
    await upsertManualInputs(month, values);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
