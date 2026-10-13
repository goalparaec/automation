import { NextResponse } from 'next/server';
import { getStillUnpaidTracker, getEsdMap } from '../../../../../../lib/prepaidRecoveryDb';
import { buildStillUnpaidWorkbook } from '../../../../../../lib/prepaidRecoveryExcelExport';
import { xlsxResponse, xlsxError, dmy } from '../../../../../../lib/xlsxResponse';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { date } = params;
  try {
    const [{ previousDate, tracker }, esdMap] = await Promise.all([getStillUnpaidTracker(date), getEsdMap()]);
    if (!previousDate) {
      return NextResponse.json({ error: 'There is no earlier report to compare with yet.' }, { status: 404 });
    }
    const wb = await buildStillUnpaidWorkbook({ reportDate: date, previousDate, tracker, esdMap });
    return xlsxResponse(wb, `Prepaid-Still-Unpaid-${dmy(date)}.xlsx`);
  } catch (err) {
    return xlsxError(err);
  }
}
