import { NextResponse } from 'next/server';
import { getGoodStandingForEsd, getEsdMap } from '../../../../../../lib/prepaidRecoveryDb';
import { buildGoodStandingWorkbook } from '../../../../../../lib/prepaidRecoveryExcelExport';
import { xlsxResponse, xlsxError, dmy } from '../../../../../../lib/xlsxResponse';

export const dynamic = 'force-dynamic';

// One ESD at a time: a whole circle's good-standing list is ~260,000 rows,
// too heavy for a single download.
export async function GET(request, { params }) {
  const { date } = params;
  const esdCode = new URL(request.url).searchParams.get('esdCode');
  if (!esdCode) {
    return NextResponse.json({ error: 'Choose an ESD first (esdCode is required).' }, { status: 400 });
  }
  try {
    const [rows, esdMap] = await Promise.all([getGoodStandingForEsd(date, esdCode), getEsdMap()]);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No good-standing records for that ESD on this date.' }, { status: 404 });
    }
    const wb = await buildGoodStandingWorkbook({ reportDate: date, esdCode, rows, esdMap });
    return xlsxResponse(wb, `Prepaid-Good-Standing-${esdMap[esdCode] || esdCode}-${dmy(date)}.xlsx`);
  } catch (err) {
    return xlsxError(err);
  }
}
