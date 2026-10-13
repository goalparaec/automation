import { evaluateAllotments, getEsdMap } from '../../../../../../lib/prepaidRecoveryDb';
import { allotmentStats } from '../../../../../../lib/prepaidRecoveryCore';
import { buildAllotmentsWorkbook } from '../../../../../../lib/prepaidRecoveryExcelExport';
import { xlsxResponse, xlsxError, dmy } from '../../../../../../lib/xlsxResponse';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { date } = params;
  try {
    const [evaluated, esdMap] = await Promise.all([evaluateAllotments(date), getEsdMap()]);
    const withStats = evaluated.map((e) => ({ ...e, stats: e.pending ? null : allotmentStats(e) }));
    const wb = await buildAllotmentsWorkbook({ reportDate: date, evaluated: withStats, esdMap });
    return xlsxResponse(wb, `Prepaid-Allotments-${dmy(date)}.xlsx`);
  } catch (err) {
    return xlsxError(err);
  }
}
