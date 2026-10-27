export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { listLedger, findByNumber, addLedger, deleteLedger } from '../../../../lib/meterCostHqDb.js';
import { LEDGERS } from '../../../../lib/meterCostHq.js';
import { ESD_BY_CODE, toIsoDate } from '../../../../lib/meterCostCore.js';

const bad = (message, status = 400) => NextResponse.json({ error: message }, { status });

export async function GET(request) {
  const u = new URL(request.url);
  const type = u.searchParams.get('type');
  if (!LEDGERS[type]) return bad('Unknown type.');
  try {
    return NextResponse.json({ rows: await listLedger(type, Number(u.searchParams.get('fy')) || null) });
  } catch (err) {
    return bad(err.message, 500);
  }
}

export async function POST(request) {
  const b = await request.json().catch(() => ({}));
  const L = LEDGERS[b.type];
  if (!L) return bad('Unknown type.');
  const no = String(b.no ?? '').trim();
  const date = toIsoDate(b.date);
  const ph1 = Math.max(0, parseInt(b.ph1, 10) || 0);
  const ph3 = Math.max(0, parseInt(b.ph3, 10) || 0);
  if (L.esd && !ESD_BY_CODE[b.esd_code]) return bad('Choose an ESD.');
  if (!no) return bad(`${L.noLabel} is required.`);
  if (!date) return bad('Date is required.');
  if (ph1 + ph3 === 0) return bad('Enter a 1-phase or 3-phase count.');

  try {
    if (!b.force) {
      const existing = await findByNumber(b.type, no);
      if (existing.length > 0) {
        return NextResponse.json({ conflict: true, message: `${L.noLabel} ${no} is already saved.`, existing }, { status: 409 });
      }
    }
    const row = { [L.noCol]: no, [L.dateCol]: date, ph1, ph3, note: String(b.note ?? '').slice(0, 200) || null };
    if (L.esd) row.esd_code = b.esd_code;
    if (L.link) row.req_no = String(b.req_no ?? '').trim() || null;
    return NextResponse.json({ ok: true, row: await addLedger(b.type, row) });
  } catch (err) {
    return bad(err.message, 500);
  }
}

export async function DELETE(request) {
  const u = new URL(request.url);
  const type = u.searchParams.get('type');
  const id = u.searchParams.get('id');
  if (!LEDGERS[type] || !id) return bad('type and id are required.');
  try {
    await deleteLedger(type, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return bad(err.message, 500);
  }
}
