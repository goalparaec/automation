import { NextResponse } from 'next/server';
import { getCallListForDate, getEsdMap } from '../../../../../../lib/prepaidRecoveryDb';
import { buildCallListWorkbook } from '../../../../../../lib/prepaidRecoveryExcelExport';
import { xlsxResponse, xlsxError, dmy } from '../../../../../../lib/xlsxResponse';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET(request, { params }) {
  const { date } = params;
  try {
    const [rows, esdMap] = await Promise.all([getCallListForDate(date), getEsdMap()]);
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'No call list for this date.' }, { status: 404 });
    }
    const wb = await buildCallListWorkbook({ reportDate: date, rows, esdMap });
    return xlsxResponse(wb, `Prepaid-Call-List-${dmy(date)}.xlsx`);
  } catch (err) {
    return xlsxError(err);
  }
}
