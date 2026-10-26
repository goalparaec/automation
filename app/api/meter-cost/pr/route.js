export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { listPrs, findPrByNumber, addPr, deletePr } from '../../../../lib/meterCostDb.js';
import { ESD_BY_CODE, toIsoDate } from '../../../../lib/meterCostCore.js';

export async function GET(request) {
  const fy = Number(new URL(request.url).searchParams.get('fy')) || null;
  try {
    return NextResponse.json({ rows: await listPrs(fy) });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Adds a PR. If the PR number is already saved, answers 409 with the saved
// entries so the screen can show them; sending { force: true } adds it anyway.
export async function POST(request) {
  const b = await request.json().catch(() => ({}));
  const prNo = String(b.pr_no ?? '').trim();
  const prDate = toIsoDate(b.pr_date);
  const ph1 = Math.max(0, parseInt(b.ph1, 10) || 0);
  const ph3 = Math.max(0, parseInt(b.ph3, 10) || 0);

  if (!ESD_BY_CODE[b.esd_code]) return NextResponse.json({ error: 'Choose an ESD.' }, { status: 400 });
  if (!prNo) return NextResponse.json({ error: 'PR number is required.' }, { status: 400 });
  if (!prDate) return NextResponse.json({ error: 'PR date is required.' }, { status: 400 });
  if (!['new', 'replacement'].includes(b.kind)) return NextResponse.json({ error: 'Choose New connection or Replacement.' }, { status: 400 });
  if (ph1 + ph3 === 0) return NextResponse.json({ error: 'Enter a 1-phase or 3-phase count.' }, { status: 400 });

  try {
    if (!b.force) {
      const existing = await findPrByNumber(prNo);
      if (existing.length > 0) {
        return NextResponse.json({ conflict: true, message: `PR ${prNo} is already saved.`, existing }, { status: 409 });
      }
    }
    const row = await addPr({ esd_code: b.esd_code, pr_no: prNo, pr_date: prDate, kind: b.kind, ph1, ph3, note: String(b.note ?? '').slice(0, 200) || null });
    return NextResponse.json({ ok: true, row });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  try {
    await deletePr(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
