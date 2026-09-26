export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getConsumerIndexingSummary } from '../../../../../../lib/consumerIndexingDb.js';
import { buildConsumerIndexingWorkbook } from '../../../../../../lib/consumerIndexingExcelExport.js';

export async function GET(request, { params }) {
  const { date } = params;
  try {
    const rows = await getConsumerIndexingSummary(date);
    const wb = await buildConsumerIndexingWorkbook(date, rows);
    const buffer = await wb.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Consumer_Indexing_${date}.xlsx"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
