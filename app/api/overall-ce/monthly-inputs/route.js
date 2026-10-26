// Monthly inputs for Overall CE: per ESD, the "manual amount" and
// "assessment amount" not reflected in ARMS. Three ways in:
//   GET                      -> current values for ?month=YYYY-MM-01
//   GET ?template=1          -> Excel template pre-filled with this month's values
//   POST (JSON)              -> hand-typed values
//   POST (multipart, file)   -> Excel / CSV upload
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { getMonthlyInputs, upsertMonthlyInputs } from '../../../../lib/overallCeDb.js';
import { ESDS } from '../../../../lib/overallCeCore.js';
import { detectFileKind, parseCSVText, parseNumericValue } from '../../../../lib/xlsxReader.js';

const MONTH_RE = /^\d{4}-\d{2}-01$/;

function parseMonthlyFile(buffer) {
  let raw;
  if (detectFileKind(buffer) === 'text') {
    raw = parseCSVText(buffer.toString('utf8'));
  } else {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    if (!wb.SheetNames?.length) throw new Error('No sheets found in the uploaded file.');
    raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: null, blankrows: false });
  }
  const cell = (r, i) => (r[i] ?? '').toString().trim();

  // Columns come from the header row if it names them, else the two columns right after the name.
  let manualCol = null;
  let assessCol = null;
  for (const r of raw) {
    const m = r.findIndex((c) => /manual/i.test(c ?? ''));
    const a = r.findIndex((c) => /assess/i.test(c ?? ''));
    if (m >= 0 && a >= 0) { manualCol = m; assessCol = a; break; }
  }

  const values = {};
  for (const r of raw) {
    const nameCol = r.findIndex((c) => ESDS.some((e) => e.toLowerCase() === cell([c], 0).toLowerCase()));
    if (nameCol < 0) continue;
    const esd = ESDS.find((e) => e.toLowerCase() === cell(r, nameCol).toLowerCase());
    const mc = manualCol ?? nameCol + 1;
    const ac = assessCol ?? nameCol + 2;
    values[esd] = {
      manual_amount: parseNumericValue(r[mc]) ?? 0,
      assessment_amount: parseNumericValue(r[ac]) ?? 0,
    };
  }
  const missing = ESDS.filter((e) => !values[e]);
  if (missing.length) throw new Error(`Could not find a row for: ${missing.join(', ')}. Use the template (one row per sub-division).`);
  return values;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month');
  if (!month || !MONTH_RE.test(month)) {
    return NextResponse.json({ error: 'month is required (YYYY-MM-01).' }, { status: 400 });
  }
  try {
    const data = await getMonthlyInputs(month);

    if (searchParams.get('template')) {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Monthly_Inputs');
      ws.columns = [
        { header: 'Sub-Division', key: 'esd', width: 18 },
        { header: 'Manual Amount Not Reflected in ARMS', key: 'manual', width: 38 },
        { header: 'Assessment Amount Not Reflected in ARMS', key: 'assess', width: 42 },
      ];
      ws.getRow(1).font = { bold: true };
      for (const esd of ESDS) {
        ws.addRow({ esd, manual: data[esd]?.manual_amount ?? 0, assess: data[esd]?.assessment_amount ?? 0 });
      }
      const buffer = await wb.xlsx.writeBuffer();
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="Overall_CE_Monthly_Inputs_${month.slice(0, 7)}.xlsx"`,
        },
      });
    }

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const type = request.headers.get('content-type') || '';
    let month;
    let values;

    if (type.includes('multipart/form-data')) {
      const form = await request.formData();
      month = form.get('month');
      const file = form.get('file');
      if (!file || typeof file === 'string') return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
      if (!month || !MONTH_RE.test(month)) return NextResponse.json({ error: 'month is required (YYYY-MM-01).' }, { status: 400 });
      try {
        values = parseMonthlyFile(Buffer.from(await file.arrayBuffer()));
      } catch (err) {
        return NextResponse.json({ error: `Could not read file: ${err.message}` }, { status: 422 });
      }
    } else {
      ({ month, values } = await request.json());
      if (!month || !MONTH_RE.test(month) || !values) {
        return NextResponse.json({ error: 'month (YYYY-MM-01) and values are required.' }, { status: 400 });
      }
    }

    await upsertMonthlyInputs(month, values);
    return NextResponse.json({ ok: true, data: await getMonthlyInputs(month) });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
