export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { loadReportInputs } from '../../../../lib/hqMrrDb.js';
import { buildHqMrrReport, monthName } from '../../../../lib/hqMrrCore.js';
import { buildHqMrrWorkbook } from '../../../../lib/hqMrrExcelExport.js';
import { xlsxResponse, xlsxError } from '../../../../lib/xlsxResponse.js';

export async function GET(request) {
  const month = new URL(request.url).searchParams.get('month') || '';
  if (!/^\d{4}-\d{2}-01$/.test(month)) return xlsxError(new Error('month is required (YYYY-MM-01).'), 'Bad request');
  try {
    const inputs = await loadReportInputs(month);
    const report = buildHqMrrReport({ month, ...inputs });
    if (!report.circle) throw new Error(`No MRR files are saved for ${monthName(month)}.`);
    const wb = await buildHqMrrWorkbook(report);
    return await xlsxResponse(wb, `HQ_MRR_Goalpara_Circle_${monthName(month).replace(' ', '_')}.xlsx`);
  } catch (err) {
    return xlsxError(err);
  }
}
