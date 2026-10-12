import { NextResponse } from 'next/server';
import { createAllotment, deleteAllotment, evaluateAllotments } from '../../../../lib/prepaidRecoveryDb';
import { allotmentStats } from '../../../../lib/prepaidRecoveryCore';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET ?reportDate=YYYY-MM-DD            -> every allotment with its counts
// GET ?reportDate=...&id=12             -> that allotment with per-consumer rows
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const reportDate = searchParams.get('reportDate');
  const id = searchParams.get('id');
  if (!reportDate || !DATE_RE.test(reportDate)) {
    return NextResponse.json({ error: 'reportDate (YYYY-MM-DD) is required.' }, { status: 400 });
  }
  try {
    const evaluated = await evaluateAllotments(reportDate, id);
    const out = evaluated.map((e) => ({
      allotment: e.allotment,
      pending: e.pending,
      stats: e.pending ? null : allotmentStats(e),
      items: id ? e.items : undefined,
    }));
    return NextResponse.json({ allotments: out });
  } catch (err) {
    console.error('Allotment read failed', err);
    return NextResponse.json({ error: err.message || 'Failed.' }, { status: 500 });
  }
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  const { reportDate, esdCode, fromSerial, toSerial, label } = body || {};
  const from = Number(fromSerial);
  const to = Number(toSerial);
  if (!reportDate || !DATE_RE.test(reportDate)) return NextResponse.json({ error: 'reportDate is required.' }, { status: 400 });
  if (!esdCode) return NextResponse.json({ error: 'Choose an ESD.' }, { status: 400 });
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
    return NextResponse.json({ error: 'Serial range must be whole numbers with From <= To, starting at 1.' }, { status: 400 });
  }
  if (!label || !String(label).trim()) return NextResponse.json({ error: 'Give the allotment a name (e.g. caller name).' }, { status: 400 });
  try {
    const allot = await createAllotment({ reportDate, esdCode, fromSerial: from, toSerial: to, label: String(label).trim() });
    return NextResponse.json({ ok: true, allotment: allot });
  } catch (err) {
    console.error('Allotment create failed', err);
    return NextResponse.json({ error: err.message || 'Failed.' }, { status: 400 });
  }
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  try {
    await deleteAllotment(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed.' }, { status: 500 });
  }
}
