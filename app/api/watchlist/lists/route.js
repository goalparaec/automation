import { NextResponse } from 'next/server';
import {
  listWatchlists, startListSync, appendListConsumers, finishListSync, deleteWatchlist, updateWatchlistMeta,
} from '../../../../lib/watchlistDb';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET -> every list with its consumer counts and the dates it has been checked.
export async function GET() {
  try {
    return NextResponse.json({ lists: await listWatchlists() });
  } catch (err) {
    console.error('Watchlist list failed', err);
    return NextResponse.json({ error: err.message || 'Could not load the lists.' }, { status: 500 });
  }
}

// POST - the browser has already read the Excel file; it sends the consumers in batches:
//   { part: 'start',  name, sourceFile }                       -> { listId, syncId }
//   { part: 'rows',   listId, syncId, listedOn, consumers }    -> { appended }
//   { part: 'finish', listId, syncId, mode: 'replace'|'add' }  -> { removed, total }
export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  const { part } = body || {};
  try {
    if (part === 'start') {
      if (body.asOnDate && !DATE_RE.test(body.asOnDate)) return NextResponse.json({ error: 'asOnDate must be YYYY-MM-DD.' }, { status: 400 });
      const out = await startListSync({ name: body.name, sourceFile: body.sourceFile, asOnDate: body.asOnDate });
      return NextResponse.json({ ok: true, ...out });
    }
    if (part === 'rows') {
      if (!body.listId || !body.syncId) return NextResponse.json({ error: 'listId and syncId are required.' }, { status: 400 });
      if (!DATE_RE.test(body.listedOn || '')) return NextResponse.json({ error: 'listedOn must be YYYY-MM-DD.' }, { status: 400 });
      if (!Array.isArray(body.consumers)) return NextResponse.json({ error: 'consumers must be an array.' }, { status: 400 });
      const appended = await appendListConsumers({
        listId: body.listId, syncId: body.syncId, consumers: body.consumers, listedOn: body.listedOn,
      });
      return NextResponse.json({ ok: true, appended });
    }
    if (part === 'finish') {
      if (!body.listId || !body.syncId) return NextResponse.json({ error: 'listId and syncId are required.' }, { status: 400 });
      const out = await finishListSync({ listId: body.listId, syncId: body.syncId, mode: body.mode === 'add' ? 'add' : 'replace' });
      return NextResponse.json({ ok: true, ...out });
    }
    return NextResponse.json({ error: 'part must be start, rows or finish.' }, { status: 400 });
  } catch (err) {
    console.error('Watchlist upload failed', err);
    return NextResponse.json({ error: err.message || 'Upload failed.' }, { status: 500 });
  }
}

// PATCH { id, asOnDate?, criteriaText? } - change the "balances as on" date or the report-title text.
export async function PATCH(request) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  if (!body || !body.id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  if (body.asOnDate && !DATE_RE.test(body.asOnDate)) return NextResponse.json({ error: 'asOnDate must be YYYY-MM-DD.' }, { status: 400 });
  try {
    const out = await updateWatchlistMeta({ id: body.id, asOnDate: body.asOnDate, criteriaText: body.criteriaText });
    return NextResponse.json({ ok: true, ...out });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  try {
    await deleteWatchlist(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed.' }, { status: 500 });
  }
}
