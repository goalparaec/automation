import { NextResponse } from 'next/server';
import { evaluateAllotments, getEsdMap } from '../../../../../../lib/prepaidRecoveryDb';
import { allotmentStats } from '../../../../../../lib/prepaidRecoveryCore';
import { buildAllotmentsWorkbook } from '../../../../../../lib/prepaidRecoveryExcelExport';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { date } = params;
  const [evaluated, esdMap] = await Promise.all([evaluateAllotments(date), getEsdMap()]);
  const withStats = evaluated.map((e) => ({ ...e, stats: e.pending ? null : allotmentStats(e) }));
  const wb = await buildAllotmentsWorkbook(date, withStats, esdMap);
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="prepaid-recovery-allotments-${date}.xlsx"`,
    },
  });
}
