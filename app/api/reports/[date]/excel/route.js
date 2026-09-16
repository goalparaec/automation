export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getReportForDate } from '../../../../../lib/db.js';
import { buildReportWorkbook } from '../../../../../lib/excelExport.js';

export async function GET(request, { params }) {
  const { date } = params;
  try {
    const report = await getReportForDate(date);
    const wb = await buildReportWorkbook(report);
    const buffer = await wb.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="GpEC_Report_${date}.xlsx"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
