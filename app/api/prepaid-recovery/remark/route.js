import { NextResponse } from 'next/server';
import { upsertRemark } from '../../../../lib/prepaidRecoveryDb';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const { consumerNo, esdCode, remark, updatedBy } = body || {};
  if (!consumerNo || !esdCode) {
    return NextResponse.json({ error: 'consumerNo and esdCode are required.' }, { status: 400 });
  }
  try {
    await upsertRemark(consumerNo, esdCode, remark || '', updatedBy);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Remark save failed', err);
    return NextResponse.json({ error: err.message || 'Could not save remark.' }, { status: 500 });
  }
}
