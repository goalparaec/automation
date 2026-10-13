import { getPaymentsForDate, getSummaryForDate, getEsdMap } from '../../../../../../lib/prepaidRecoveryDb';
import { buildPaymentsWorkbook } from '../../../../../../lib/prepaidRecoveryExcelExport';
import { xlsxResponse, xlsxError, dmy } from '../../../../../../lib/xlsxResponse';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { date } = params;
  try {
    const [paymentsRows, summaryRows, esdMap] = await Promise.all([
      getPaymentsForDate(date), getSummaryForDate(date), getEsdMap(),
    ]);
    const wb = await buildPaymentsWorkbook({ reportDate: date, paymentsRows, summaryRows, esdMap });
    return xlsxResponse(wb, `Prepaid-Paid-Since-Last-Report-${dmy(date)}.xlsx`);
  } catch (err) {
    return xlsxError(err);
  }
}
