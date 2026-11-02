export const runtime = 'nodejs';
export const maxDuration = 60;

import { getDepositsForFy, listPrs } from '../../../../lib/meterCostDb.js';
import { buildDepositSummary, buildPrStatus } from '../../../../lib/meterCostCore.js';
import { buildMeterCostWorkbook } from '../../../../lib/meterCostExcelExport.js';
import { loadHq } from '../../../../lib/meterCostHqDb.js';
import { buildHqStatus, buildIssueStatus } from '../../../../lib/meterCostHq.js';
import { xlsxResponse, xlsxError } from '../../../../lib/xlsxResponse.js';

export async function GET(request) {
  const fy = Number(new URL(request.url).searchParams.get('fy'));
  if (!fy) return xlsxError(new Error('fy is required (e.g. 2026).'), 'Bad request');
  try {
    const [deposits, prs] = await Promise.all([getDepositsForFy(fy), listPrs(fy)]);
    const summary = buildDepositSummary(deposits, fy);
    let hq = null;
    let lists = null;
    let issueStatus = null;
    let status = buildPrStatus(deposits, [], fy);
    try {
      lists = await loadHq(fy);
      status = buildPrStatus(deposits, lists.issues || [], fy);
      hq = buildHqStatus({ deposits, reqs: lists.reqs, supplies: lists.supplies, prs, issues: lists.issues, fyStart: fy });
      issueStatus = buildIssueStatus({ prs, issues: lists.issues, fyStart: fy });
    } catch { hq = null; lists = null; issueStatus = null; }
    const wb = await buildMeterCostWorkbook({ summary, status, prs, hq, lists, issueStatus });
    return xlsxResponse(wb, `Meter_Cost_Record_FY_${summary.label}.xlsx`);
  } catch (err) {
    return xlsxError(err);
  }
}
