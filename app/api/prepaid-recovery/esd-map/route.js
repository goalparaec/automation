import { NextResponse } from 'next/server';
import { getEsdMap, upsertEsdLabel } from '../../../../lib/prepaidRecoveryDb';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET() {
  try {
    const map = await getEsdMap();
    return NextResponse.json({ map });
  } catch (err) {
    console.error('Could not load ESD map', err);
    return NextResponse.json({ error: err.message || 'Could not load ESD map.' }, { status: 500 });
  }
}

export async function PUT(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const { esdCode, esdLabel } = body || {};
  if (!esdCode || !esdLabel) {
    return NextResponse.json({ error: 'esdCode and esdLabel are required.' }, { status: 400 });
  }
  try {
    await upsertEsdLabel(esdCode, esdLabel);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Could not update ESD label', err);
    return NextResponse.json({ error: err.message || 'Could not update ESD label.' }, { status: 500 });
  }
}
