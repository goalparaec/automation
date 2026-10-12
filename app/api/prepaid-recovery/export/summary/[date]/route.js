import { NextResponse } from 'next/server';
import { getSummaryForDate } from '../../../../../../lib/prepaidRecoveryDb';
import { buildSummaryWorkbook } from '../../../../../../lib/prepaidRecoveryExcelExport';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { date } = params;
  const rows = await getSummaryForDate(date);
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'No summary for this date.' }, { status: 404 });
  }
  const total = rows.reduce(
    (acc, r) => {
      acc.band36 += r.band_3_6;
      acc.band612 += r.band_6_12;
      acc.bandAbove1y += r.band_above_1y;
      acc.bandNoPayment += r.band_no_payment;
      acc.callListTotal += r.call_list_total;
      acc.negTotal += Number(r.neg_total);
      acc.noPhoneExcluded += r.no_phone_excluded;
      acc.paidYesterdayCount += r.paid_yesterday_count;
      acc.paidYesterdayAmount += Number(r.paid_yesterday_amount);
      acc.paidTodayCount += r.paid_today_count;
      acc.paidTodayAmount += Number(r.paid_today_amount);
      acc.rows += r.rows_in_report;
      return acc;
    },
    { band36: 0, band612: 0, bandAbove1y: 0, bandNoPayment: 0, callListTotal: 0, negTotal: 0,
      noPhoneExcluded: 0, paidYesterdayCount: 0, paidYesterdayAmount: 0, paidTodayCount: 0,
      paidTodayAmount: 0, rows: 0 }
  );

  const wb = await buildSummaryWorkbook(date, rows, total);
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="prepaid-recovery-summary-${date}.xlsx"`,
    },
  });
}
