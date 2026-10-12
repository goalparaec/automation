import { NextResponse } from 'next/server';
import { getCallListForDate, getEsdMap } from '../../../../../../lib/prepaidRecoveryDb';
import { buildCallListWorkbook } from '../../../../../../lib/prepaidRecoveryExcelExport';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { date } = params;
  const [rows, esdMap] = await Promise.all([getCallListForDate(date), getEsdMap()]);
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'No call list for this date.' }, { status: 404 });
  }
  const rowsByEsd = {};
  for (const r of rows) {
    const label = esdMap[r.esd_code] || r.esd_code;
    if (!rowsByEsd[label]) rowsByEsd[label] = [];
    rowsByEsd[label].push(r);
  }
  const wb = await buildCallListWorkbook(date, rowsByEsd);
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="prepaid-recovery-calllist-${date}.xlsx"`,
    },
  });
}
