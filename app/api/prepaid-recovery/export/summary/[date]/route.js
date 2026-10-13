import { NextResponse } from 'next/server';
import {
  getSummaryForDate, getPaymentsForDate, getExcludedForDate, getEsdMap,
} from '../../../../../../lib/prepaidRecoveryDb';
import { buildSummaryWorkbook } from '../../../../../../lib/prepaidRecoveryExcelExport';
import { xlsxResponse, xlsxError, dmy } from '../../../../../../lib/xlsxResponse';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { date } = params;
  try {
    const [summaryRows, paymentsRows, excludedRows, esdMap] = await Promise.all([
      getSummaryForDate(date), getPaymentsForDate(date), getExcludedForDate(date), getEsdMap(),
    ]);
    if (!summaryRows || summaryRows.length === 0) {
      return NextResponse.json({ error: 'No summary for this date.' }, { status: 404 });
    }
    const wb = await buildSummaryWorkbook({ reportDate: date, summaryRows, paymentsRows, excludedRows, esdMap });
    return xlsxResponse(wb, `Prepaid-Summary-${dmy(date)}.xlsx`);
  } catch (err) {
    return xlsxError(err);
  }
}
