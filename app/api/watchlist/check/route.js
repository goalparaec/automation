import { NextResponse } from 'next/server';
import { startCheck, appendCheckRows, finishCheck } from '../../../../lib/watchlistDb';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The browser has already read the billing files and run lib/watchlistCore.js. This route only saves
// the result, in steps (a list can be larger than Vercel's ~4.5 MB request limit):
//   { part: 'start',  listId, reportDate, fileNames, rowsInFiles, staleWarning }
//   { part: 'rows',   listId, reportDate, rows }
//   { part: 'finish', listId, reportDate, totals }
export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  const { part, listId, reportDate } = body || {};
  if (!listId) return NextResponse.json({ error: 'listId is required.' }, { status: 400 });
  if (!reportDate || !DATE_RE.test(reportDate)) return NextResponse.json({ error: 'reportDate must be YYYY-MM-DD.' }, { status: 400 });
  try {
    if (part === 'start') {
      await startCheck({
        listId, reportDate, fileNames: body.fileNames, rowsInFiles: body.rowsInFiles,
        staleWarning: body.staleWarning, uploadedBy: body.uploadedBy,
      });
      return NextResponse.json({ ok: true });
    }
    if (part === 'rows') {
      if (!Array.isArray(body.rows)) return NextResponse.json({ error: 'rows must be an array.' }, { status: 400 });
      const appended = await appendCheckRows({ listId, reportDate, rows: body.rows });
      return NextResponse.json({ ok: true, appended });
    }
    if (part === 'finish') {
      if (!body.totals) return NextResponse.json({ error: 'totals are required.' }, { status: 400 });
      await finishCheck({ listId, reportDate, totals: body.totals });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'part must be start, rows or finish.' }, { status: 400 });
  } catch (err) {
    console.error('Watchlist check save failed', err);
    return NextResponse.json({ error: err.message || 'Save failed.' }, { status: 500 });
  }
}
