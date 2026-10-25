export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getOverallCE } from '../../../../../../lib/overallCeDb.js';
import { buildOverallCeWorkbook } from '../../../../../../lib/overallCeExcelExport.js';
import { xlsxResponse, xlsxError, dmy } from '../../../../../../lib/xlsxResponse.js';

export async function GET(request, { params }) {
  const { date } = params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return xlsxError(new Error('Invalid date.'));
  try {
    const report = await getOverallCE(date);
    const wb = await buildOverallCeWorkbook(report);
    return xlsxResponse(wb, `Overall_CE_${dmy(date)}.xlsx`);
  } catch (err) {
    return xlsxError(err);
  }
}
