import { NextResponse } from 'next/server';
import { getAnalysisForDate, getEsdMap } from '../../../../../../lib/prepaidRecoveryDb';
import { nonCommPresent } from '../../../../../../lib/prepaidRecoveryCore';
import { buildNonCommWorkbook } from '../../../../../../lib/prepaidRecoveryExcelExport';
import { xlsxResponse, xlsxError, dmy } from '../../../../../../lib/xlsxResponse';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET(request, { params }) {
  const { date } = params;
  try {
    const [analysis, esdMap] = await Promise.all([getAnalysisForDate(date), getEsdMap()]);
    if (!nonCommPresent(analysis)) {
      return NextResponse.json({
        error: 'The Non-Comm Unbilled summary is not stored for this date. Upload the billing files again for this date to generate it.',
      }, { status: 404 });
    }
    const wb = await buildNonCommWorkbook({ reportDate: date, analysis, esdMap });
    return xlsxResponse(wb, `Prepaid-NonComm-Unbilled-Summary-${dmy(date)}.xlsx`);
  } catch (err) {
    return xlsxError(err);
  }
}
