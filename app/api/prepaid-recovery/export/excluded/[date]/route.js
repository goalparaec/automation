import { NextResponse } from 'next/server';
import { getExcludedForDate, getSummaryForDate, getEsdMap } from '../../../../../../lib/prepaidRecoveryDb';
import { buildExcludedWorkbook } from '../../../../../../lib/prepaidRecoveryExcelExport';
import { xlsxResponse, xlsxError, dmy } from '../../../../../../lib/xlsxResponse';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { date } = params;
  try {
    const [rows, summaryRows, esdMap] = await Promise.all([getExcludedForDate(date), getSummaryForDate(date), getEsdMap()]);
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'No excluded-consumer records for this date.' }, { status: 404 });
    }
    const wb = await buildExcludedWorkbook({ reportDate: date, rows, summaryRows, esdMap });
    return xlsxResponse(wb, `Prepaid-Excluded-${dmy(date)}.xlsx`);
  } catch (err) {
    return xlsxError(err);
  }
}
