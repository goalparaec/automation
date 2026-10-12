import { NextResponse } from 'next/server';
import { getExcludedForDate, getEsdMap } from '../../../../../../lib/prepaidRecoveryDb';
import { buildExcludedWorkbook } from '../../../../../../lib/prepaidRecoveryExcelExport';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { date } = params;
  const [rows, esdMap] = await Promise.all([getExcludedForDate(date), getEsdMap()]);
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'No excluded-consumer records for this date.' }, { status: 404 });
  }
  const wb = await buildExcludedWorkbook(date, rows, esdMap);
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="prepaid-recovery-excluded-${date}.xlsx"`,
    },
  });
}
