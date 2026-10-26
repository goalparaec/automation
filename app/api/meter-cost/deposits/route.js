export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { listDeposits, deleteDeposit, updateDeposit } from '../../../../lib/meterCostDb.js';

export async function GET(request) {
  const p = new URL(request.url).searchParams;
  try {
    const rows = await listDeposits({
      fyStart: Number(p.get('fy')) || null,
      esd: p.get('esd') || null,
      status: p.get('status') || null,
      limit: Math.min(Number(p.get('limit')) || 500, 2000),
    });
    return NextResponse.json({ rows });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  const body = await request.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  try {
    await updateDeposit(body.id, { status: body.status, phase: body.phase });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function DELETE(request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  try {
    await deleteDeposit(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
