import { NextResponse } from 'next/server';
import { getSummaryForDate, getAnalysisForDate, getEsdMap } from '../../../../../../lib/prepaidRecoveryDb';
import { widePresent } from '../../../../../../lib/prepaidRecoveryCore';
import { buildWideSummaryWorkbook } from '../../../../../../lib/prepaidRecoveryExcelExport';
import { xlsxResponse, xlsxError, dmy } from '../../../../../../lib/xlsxResponse';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { date } = params;
  try {
    const [summaryRows, analysis, esdMap] = await Promise.all([
      getSummaryForDate(date), getAnalysisForDate(date), getEsdMap(),
    ]);
    if (!widePresent(analysis)) {
      return NextResponse.json({
        error: 'The All Categories summary is not stored for this date. Upload the billing files again for this date to generate it.',
      }, { status: 404 });
    }
    const wb = await buildWideSummaryWorkbook({ reportDate: date, analysis, summaryRows, esdMap });
    return xlsxResponse(wb, `Prepaid-Summary-All-Categories-${dmy(date)}.xlsx`);
  } catch (err) {
    return xlsxError(err);
  }
}
