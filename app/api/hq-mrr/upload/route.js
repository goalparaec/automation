// Saves the category-wise commercial MRR of each ESD (and the IRCA units).
// All-or-nothing for the files: if any file cannot be read, nothing is saved.
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { ESDS, parseCommercialGrid, parseIrcaGrid, sumRows, monthName } from '../../../../lib/hqMrrCore.js';
import { saveEsdMrr, saveIrca, getMrrRows } from '../../../../lib/hqMrrDb.js';

function readGrid(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  if (!wb.SheetNames?.length) throw new Error('No sheets found in the file.');
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: true, blankrows: false });
}

const fingerprint = (rows) => {
  const t = sumRows(rows);
  return `${Math.round(t.unit_billed)}|${Math.round(t.current_dmd)}|${Math.round(t.grand_coll)}`;
};

export async function POST(request) {
  const form = await request.formData();
  const monthInput = String(form.get('month') || '').trim(); // YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(monthInput)) {
    return NextResponse.json({ error: 'Choose the MRR month.' }, { status: 400 });
  }
  const month = `${monthInput}-01`;

  const results = [];
  const parsed = {};
  for (const esd of ESDS) {
    const file = form.get(`file_${esd}`);
    if (!file || typeof file === 'string' || !file.size) continue;
    try {
      const p = parseCommercialGrid(readGrid(Buffer.from(await file.arrayBuffer())));
      if (p.month && p.month !== month) {
        throw new Error(`The file is for ${monthName(p.month)}, but you chose ${monthName(month)}.`);
      }
      parsed[esd] = { ...p, fileName: file.name };
      results.push({ esd, file: file.name, ok: true, rows: p.rows.length, warnings: p.warnings });
    } catch (err) {
      results.push({ esd, file: file.name, ok: false, error: err.message });
    }
  }

  // The circle's IRCA ESD-wise MRR (one file for all 5 ESDs).
  let irca = null;
  let ircaName = null;
  const ircaFile = form.get('file_IRCA');
  if (ircaFile && typeof ircaFile !== 'string' && ircaFile.size) {
    try {
      irca = parseIrcaGrid(readGrid(Buffer.from(await ircaFile.arrayBuffer()))).byEsd;
      ircaName = ircaFile.name;
      results.push({ esd: 'IRCA', file: ircaFile.name, ok: true, rows: Object.keys(irca).length, warnings: [] });
    } catch (err) {
      results.push({ esd: 'IRCA', file: ircaFile.name, ok: false, error: err.message });
    }
  }

  // The same file put into two slots is the most likely slip - catch it.
  const seen = new Map();
  for (const esd of Object.keys(parsed)) {
    const fp = fingerprint(parsed[esd].rows);
    if (seen.has(fp)) {
      const other = seen.get(fp);
      for (const e of [esd, other]) {
        const r = results.find((x) => x.esd === e);
        r.ok = false;
        r.error = `${esd} and ${other} have identical figures - the same file was probably chosen twice.`;
      }
    } else seen.set(fp, esd);
  }

  let failed = results.some((r) => !r.ok);
  try {
    if (!failed && Object.keys(parsed).length) {
      const stored = await getMrrRows(month);
      for (const esd of Object.keys(parsed)) {
        const fp = fingerprint(parsed[esd].rows);
        for (const other of ESDS) {
          if (other !== esd && !parsed[other] && stored[other] && fingerprint(stored[other]) === fp) {
            const r = results.find((x) => x.esd === esd);
            r.ok = false;
            r.error = `These figures are identical to the saved ${other} file - the wrong file may have been chosen.`;
            failed = true;
          }
        }
      }
    }

    if (failed) {
      return NextResponse.json({ error: 'Nothing was saved. Fix the files marked below and try again.', results }, { status: 400 });
    }

    for (const esd of Object.keys(parsed)) {
      await saveEsdMrr(month, esd, parsed[esd].rows, parsed[esd].fileName);
    }
    if (irca) await saveIrca(month, irca, ircaName);
    return NextResponse.json({ ok: true, month, results, ircaSaved: !!irca });
  } catch (err) {
    return NextResponse.json({ error: err.message, results }, { status: 500 });
  }
}
