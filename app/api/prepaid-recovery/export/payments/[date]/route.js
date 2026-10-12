import { NextResponse } from 'next/server';
import { getPaymentsForDate, getEsdMap } from '../../../../../../lib/prepaidRecoveryDb';
import { buildPaymentsWorkbook } from '../../../../../../lib/prepaidRecoveryExcelExport';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { date } = params;
  const [rows, esdMap] = await Promise.all([getPaymentsForDate(date), getEsdMap()]);
  const wb = await buildPaymentsWorkbook(date, rows, esdMap);
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="prepaid-recovery-payments-${date}.xlsx"`,
    },
  });
}
