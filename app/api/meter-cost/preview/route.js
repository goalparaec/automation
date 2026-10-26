// Step 1 of an upload: read the head-wise files, work out what each row is,
// and compare with what is already saved. Nothing is written here.
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { parseHeadwiseFile } from '../../../../lib/meterCostParse.js';
import { buildPreview } from '../../../../lib/meterCostCore.js';
import { getExistingFor } from '../../../../lib/meterCostDb.js';

export async function POST(request) {
  const formData = await request.formData();
  const files = formData.getAll('files').filter((f) => f && typeof f !== 'string');
  if (files.length === 0) {
    return NextResponse.json({ error: 'Choose at least one file.' }, { status: 400 });
  }

  const fileReports = [];
  const records = [];
  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const parsed = parseHeadwiseFile(buffer, file.name);
      records.push(...parsed.records);
      fileReports.push({
        name: file.name,
        ok: true,
        rowsRead: parsed.rowsRead,
        meterCostRows: parsed.meterCostRows,
        notOurEsd: parsed.notOurEsd,
      });
    } catch (err) {
      fileReports.push({ name: file.name, ok: false, error: err.message });
    }
  }

  try {
    const { byKey, byApp } = records.length ? await getExistingFor(records) : { byKey: new Map(), byApp: new Map() };
    const preview = buildPreview(records, byKey, byApp);
    return NextResponse.json({ files: fileReports, records: preview.records, stats: preview.stats });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
