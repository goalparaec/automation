import { NextResponse } from 'next/server';
import {
  getSummaryForDate, getAnalysisForDate, getPreviousReportDate, getEsdMap,
} from '../../../../../../lib/prepaidRecoveryDb';
import { buildAnalysisWorkbook } from '../../../../../../lib/prepaidRecoveryExcelExport';
import { xlsxResponse, xlsxError, dmy } from '../../../../../../lib/xlsxResponse';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET(request, { params }) {
  const { date } = params;
  try {
    const [summaryRows, analysis, esdMap, previousDate] = await Promise.all([
      getSummaryForDate(date), getAnalysisForDate(date), getEsdMap(), getPreviousReportDate(date),
    ]);
    if (!analysis || Object.keys(analysis).length === 0) {
      return NextResponse.json({
        error: 'No analysis stored for this date. Upload the billing files again to generate it.',
      }, { status: 404 });
    }
    let prevSummaryRows = [];
    let prevAnalysis = {};
    if (previousDate) {
      [prevSummaryRows, prevAnalysis] = await Promise.all([getSummaryForDate(previousDate), getAnalysisForDate(previousDate)]);
    }
    const wb = await buildAnalysisWorkbook({
      reportDate: date, previousDate, analysis, prevAnalysis, summaryRows, prevSummaryRows, esdMap,
    });
    return xlsxResponse(wb, `Prepaid-Analysis-${dmy(date)}.xlsx`);
  } catch (err) {
    return xlsxError(err);
  }
}
