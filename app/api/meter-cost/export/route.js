export const runtime = 'nodejs';
export const maxDuration = 60;

import { getDepositsForFy, listPrs } from '../../../../lib/meterCostDb.js';
import { buildDepositSummary, buildPrStatus } from '../../../../lib/meterCostCore.js';
import { buildMeterCostWorkbook } from '../../../../lib/meterCostExcelExport.js';
import { xlsxResponse, xlsxError } from '../../../../lib/xlsxResponse.js';

export async function GET(request) {
  const fy = Number(new URL(request.url).searchParams.get('fy'));
  if (!fy) return xlsxError(new Error('fy is required (e.g. 2026).'), 'Bad request');
  try {
    const [deposits, prs] = await Promise.all([getDepositsForFy(fy), listPrs(fy)]);
    const summary = buildDepositSummary(deposits, fy);
    const status = buildPrStatus(deposits, prs, fy);
    const wb = await buildMeterCostWorkbook({ summary, status, prs });
    return xlsxResponse(wb, `Meter_Cost_Record_FY_${summary.label}.xlsx`);
  } catch (err) {
    return xlsxError(err);
  }
}
