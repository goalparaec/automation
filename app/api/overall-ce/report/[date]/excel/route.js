export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { getOverallCE } from '../../../../../../lib/overallCeDb.js';
import { buildOverallCeWorkbook } from '../../../../../../lib/overallCeExcelExport.js';
import { xlsxResponse, xlsxError, dmy } from '../../../../../../lib/xlsxResponse.js';

export async function GET(request, { params }) {
  const { date } = params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return xlsxError(new Error('Invalid date.'));
  try {
    const report = await getOverallCE(date);
    const extended = new URL(request.url).searchParams.get('ext') === '1';
    const wb = await buildOverallCeWorkbook(report, { extended });
    return xlsxResponse(wb, `Overall_CE_${dmy(date)}${extended ? '_with_additional_columns' : ''}.xlsx`);
  } catch (err) {
    return xlsxError(err);
  }
}

// Builds the Excel from exactly the report the page is showing (the page sends
// it), so the image and the Excel can never be made from different data.
export async function POST(request, { params }) {
  const { date } = params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return xlsxError(new Error('Invalid date.'));
  try {
    const report = await request.json();
    if (!report || !Array.isArray(report.rows) || report.rows.length === 0 || report.reportDate !== date) {
      throw new Error('The report data sent with the request is not valid.');
    }
    const extended = new URL(request.url).searchParams.get('ext') === '1';
    const wb = await buildOverallCeWorkbook({ ...report, sources: report.sources || [], missing: report.missing || [] }, { extended });
    return xlsxResponse(wb, `Overall_CE_${dmy(date)}${extended ? '_with_additional_columns' : ''}.xlsx`);
  } catch (err) {
    return xlsxError(err);
  }
}
