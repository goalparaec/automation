// Step 2 of an upload: save the rows with the decisions made on screen.
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { sanitiseDecisions } from '../../../../lib/meterCostCore.js';
import { saveDeposits } from '../../../../lib/meterCostDb.js';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const items = Array.isArray(body?.records) ? body.records : [];
  if (items.length === 0) return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });

  const { clean, problems } = sanitiseDecisions(items);
  if (problems.length > 0) {
    return NextResponse.json({ error: problems.slice(0, 5).join(' ') + (problems.length > 5 ? ` (+${problems.length - 5} more)` : '') }, { status: 422 });
  }
  try {
    const { saved, skipped } = await saveDeposits(clean);
    const counted = clean.filter((c) => c.status === 'counted').length;
    return NextResponse.json({ ok: true, saved, skipped, counted, ignored: clean.length - counted });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
