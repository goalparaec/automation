// Saves the Solar Unit Adjustment of each ESD. The consumer-wise MRR files are big,
// so the browser reads them and sends only the totals here.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { NextResponse } from 'next/server';
import { ESDS } from '../../../../lib/hqMrrCore.js';
import { saveSolar } from '../../../../lib/hqMrrDb.js';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }
  const m = String(body?.month || '').trim(); // YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(m)) return NextResponse.json({ error: 'Choose the MRR month.' }, { status: 400 });
  const items = {};
  for (const [esd, v] of Object.entries(body?.items || {})) {
    if (!ESDS.includes(esd)) return NextResponse.json({ error: `Unknown ESD: ${esd}` }, { status: 400 });
    const kwh = Number(v?.solar_kwh);
    if (!Number.isFinite(kwh)) return NextResponse.json({ error: `${esd}: the solar adjustment is not a number.` }, { status: 400 });
    items[esd] = {
      solar_kwh: kwh,
      consumers: Number.isFinite(Number(v?.consumers)) ? Number(v.consumers) : null,
      column: v?.column ? String(v.column).slice(0, 120) : null,
      file_name: v?.file_name ? String(v.file_name).slice(0, 200) : null,
    };
  }
  if (!Object.keys(items).length) return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
  try {
    await saveSolar(`${m}-01`, items);
    return NextResponse.json({ ok: true, saved: Object.keys(items) });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
